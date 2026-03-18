import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { Db } from "./db.js";
import type { Env } from "./env.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(s: string, max = 20_000) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n...\n(truncated)\n";
}

function resolveRunnerBinary(env: Env): string {
  const configured = String(env.UPDATES_RUNNER_BIN || "").trim();
  const installRoot = String(env.UPDATES_RUNNER_INSTALL_ROOT || "/opt/dingitalpay").trim() || "/opt/dingitalpay";
  const installFallback = `${installRoot.replace(/\/+$/, "")}/current/deploy/ops/dingitalpay-updater`;

  if (!configured) return installFallback;
  if (!configured.startsWith("/")) return configured;
  if (existsSync(configured)) return configured;
  if (existsSync(installFallback)) return installFallback;
  return configured;
}

async function claimNextJob(db: Db): Promise<{ id: string; target_version: string } | null> {
  const res = await db.query<any>(
    `
      with next_job as (
        select id
        from public.updates_jobs
        where
          (
            status = 'queued'
            and attempts < max_attempts
          )
          or (
            status = 'running'
            and locked_at is not null
            and locked_at < now() - interval '60 minutes'
            and attempts < max_attempts
          )
        order by created_at asc
        limit 1
        for update skip locked
      )
      update public.updates_jobs j
      set
        status = 'running',
        locked_at = now(),
        started_at = coalesce(started_at, now()),
        attempts = attempts + 1,
        last_error = '',
        log = coalesce(log,'')
      from next_job
      where j.id = next_job.id
      returning j.id, j.target_version
    `
  );
  return res.rows?.[0] ?? null;
}

async function markDone(db: Db, id: string, ok: boolean, log: string, err?: string) {
  await db.query(
    `
      update public.updates_jobs
      set
        status = $2,
        finished_at = now(),
        locked_at = null,
        log = $3,
        last_error = $4
      where id = $1
    `,
    [id, ok ? "success" : "failed", log, err ? String(err).slice(0, 4000) : ""]
  );
}

async function appendCancellationObservation(db: Db, id: string, output: string, note: string) {
  await db.query(
    `
      update public.updates_jobs
      set
        log = left(
          trim(
            both E'\n'
            from concat_ws(
              E'\n\n',
              nullif(coalesce(log, ''), ''),
              nullif($2, ''),
              $3
            )
          ),
          20000
        ),
        last_error = case
          when coalesce(last_error, '') = '' then 'canceled_by_admin'
          when position('canceled_by_admin' in coalesce(last_error, '')) > 0 then left(last_error, 4000)
          else left(last_error || ' | canceled_by_admin', 4000)
        end
      where id = $1
        and status = 'canceled'
    `,
    [id, truncate(output), note]
  );
}

async function persistRunningLog(db: Db, id: string, log: string) {
  await db.query(
    `
      update public.updates_jobs
      set
        log = $2,
        locked_at = now()
      where id = $1
        and status = 'running'
    `,
    [id, truncate(log)]
  );
}

async function readJobStatus(db: Db, id: string): Promise<string | null> {
  const res = await db.query<any>(
    `
      select status
      from public.updates_jobs
      where id = $1
      limit 1
    `,
    [id]
  );
  return res.rows?.[0]?.status ?? null;
}

let recoveredOrphanedJobs = false;

async function recoverOrphanedRunningJobs(db: Db): Promise<void> {
  if (recoveredOrphanedJobs) return;
  recoveredOrphanedJobs = true;
  try {
    await db.query(
      `
        update public.updates_jobs
        set
          status = 'failed',
          finished_at = now(),
          locked_at = null,
          last_error = case
            when coalesce(last_error, '') = '' then 'runner_restarted_before_job_completed'
            else left(last_error || ' | runner_restarted_before_job_completed', 4000)
          end,
          log = case
            when coalesce(log, '') = '' then '[auto-recovery] running job marked as failed after runner restart'
            else left(log || E'\\n\\n[auto-recovery] running job marked as failed after runner restart', 20000)
          end
        where status = 'running'
      `
    );
  } catch {
    recoveredOrphanedJobs = false;
    throw new Error("updates_jobs_recovery_failed");
  }
}

async function runCmd(
  env: Env,
  args: string[],
  timeoutMs: number,
  shouldCancel?: () => Promise<boolean>,
  onProgress?: (output: string) => Promise<void>
): Promise<{ ok: boolean; output: string; code: number | null; canceled: boolean }> {
  const runnerBin = resolveRunnerBinary(env);
  let spawnError: Error | null = null;
  const child = spawn(runnerBin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  let out = "";
  let flushChain = Promise.resolve();
  let flushTimer: NodeJS.Timeout | null = null;
  const scheduleProgressFlush = () => {
    if (!onProgress || flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const snapshot = truncate(out);
      flushChain = flushChain.then(() => onProgress(snapshot)).catch(() => {
        // ignore transient log persistence failures and keep the command running
      });
    }, 350);
  };
  child.stdout.on("data", (b) => (out += b.toString("utf-8")));
  child.stderr.on("data", (b) => (out += b.toString("utf-8")));
  child.stdout.on("data", scheduleProgressFlush);
  child.stderr.on("data", scheduleProgressFlush);
  child.on("error", (err) => {
    spawnError = err;
    out += `\n[runner-spawn-error] ${String(err?.message || err)}\n`;
  });

  let killed = false;
  let canceled = false;
  let closed = false;
  const t = setTimeout(() => {
    killed = true;
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }, timeoutMs);

  const cancelInterval = shouldCancel
    ? setInterval(() => {
        void (async () => {
          if (closed || canceled) return;
          try {
            const requested = await shouldCancel();
            if (!requested) return;
            canceled = true;
            try {
              child.kill("SIGTERM");
            } catch {
              // ignore
            }
            setTimeout(() => {
              if (closed) return;
              try {
                child.kill("SIGKILL");
              } catch {
                // ignore
              }
            }, 3000);
          } catch {
            // ignore cancellation polling errors and let the process finish naturally
          }
        })();
      }, 1000)
    : null;

  const code = await new Promise<number | null>((resolve) => {
    child.on("close", (c) => {
      closed = true;
      resolve(typeof c === "number" ? c : null);
    });
  });
  clearTimeout(t);
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (onProgress) {
    const snapshot = truncate(out);
    flushChain = flushChain.then(() => onProgress(snapshot)).catch(() => {
      // ignore
    });
  }
  await flushChain;
  if (cancelInterval) clearInterval(cancelInterval);
  if (spawnError) return { ok: false, output: truncate(out), code, canceled: false };
  if (canceled) return { ok: false, output: truncate(out), code, canceled: true };
  if (killed) return { ok: false, output: truncate(out), code, canceled: false };
  return { ok: code === 0, output: truncate(out), code, canceled: false };
}

export async function processNextUpdatesJob(db: Db, env: Env): Promise<{ processed: boolean }> {
  if (!env.UPDATES_RUNNER_ENABLED) return { processed: false };

  // Table may not exist on older installs; avoid crashing the worker.
  try {
    await recoverOrphanedRunningJobs(db);
    const job = await claimNextJob(db);
    if (!job) return { processed: false };

    const baseArgs = ["--install-root", env.UPDATES_RUNNER_INSTALL_ROOT, "--product-key", env.UPDATES_RUNNER_PRODUCT_KEY];
    const timeoutMs = Math.max(30_000, Number(env.UPDATES_RUNNER_TIMEOUT_SECONDS || 0) * 1000);
    const shouldCancel = async () => (await readJobStatus(db, job.id)) === "canceled";
    const planHeader = `PLAN: versão alvo=${job.target_version} produto=${env.UPDATES_RUNNER_PRODUCT_KEY} install_root=${env.UPDATES_RUNNER_INSTALL_ROOT}\nPLAN: runner_bin=${resolveRunnerBinary(env)}\n`;
    await persistRunningLog(db, job.id, planHeader);

    const plan = await runCmd(
      env,
      [...baseArgs, "plan", "--version", job.target_version],
      Math.min(timeoutMs, 10 * 60_000),
      shouldCancel,
      async (output) => {
        await persistRunningLog(db, job.id, planHeader + output);
      }
    );
    const planLog = planHeader + plan.output;
    if (plan.canceled) {
      await appendCancellationObservation(db, job.id, planLog, "[runner] canceled before apply started");
      return { processed: true };
    }
    if (!plan.ok) {
      await markDone(db, job.id, false, planLog, `plan_failed (code=${plan.code ?? "?"})`);
      return { processed: true };
    }

    // Small delay to reduce thundering herd if multiple admins click.
    await sleep(500);
    if (await shouldCancel()) {
      await appendCancellationObservation(db, job.id, planLog, "[runner] apply skipped because the job was canceled");
      return { processed: true };
    }

    const applyHeader = `${planLog}\n\n--- APPLY ---\n\n`;
    await persistRunningLog(db, job.id, `${applyHeader}[runner] iniciando apply...\n`);
    const apply = await runCmd(
      env,
      [...baseArgs, "apply", "--version", job.target_version],
      timeoutMs,
      shouldCancel,
      async (output) => {
        await persistRunningLog(db, job.id, applyHeader + output);
      }
    );
    const fullLog = applyHeader + apply.output;
    if (apply.canceled) {
      await appendCancellationObservation(
        db,
        job.id,
        fullLog,
        "[runner] apply interrupted after admin cancellation"
      );
      return { processed: true };
    }
    if (!apply.ok) {
      await markDone(db, job.id, false, fullLog, `apply_failed (code=${apply.code ?? "?"})`);
      return { processed: true };
    }

    if (await shouldCancel()) {
      await appendCancellationObservation(
        db,
        job.id,
        fullLog,
        "[runner] command finished after cancellation request; status preserved as canceled"
      );
      return { processed: true };
    }

    await markDone(db, job.id, true, fullLog);
    return { processed: true };
  } catch {
    return { processed: false };
  }
}
