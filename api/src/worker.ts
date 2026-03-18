import { loadEnv } from "./env.js";
import { createPool } from "./db.js";
import { processNextEmailOutboxJob, reconcileCampaignStatuses, dispatchDueCampaigns } from "./emailWorker.js";
import { processNextUpdatesJob } from "./updatesWorker.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const env = loadEnv();
const db = createPool({
  connectionString: env.DATABASE_URL,
  host: env.PGHOST,
  port: env.PGPORT,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE
});

// eslint-disable-next-line no-console
console.log("Email worker starting...");

let consecutiveIdle = 0;

process.on("SIGTERM", async () => {
  // eslint-disable-next-line no-console
  console.log("Email worker shutting down...");
  await db.end();
  process.exit(0);
});

while (true) {
  try {
    const { processed } = env.EMAIL_WORKER_ENABLED
      ? await processNextEmailOutboxJob(db, env)
      : { processed: false };
    const { processed: processedUpdates } = await processNextUpdatesJob(db, env);
    await dispatchDueCampaigns(db);
    await reconcileCampaignStatuses(db);
    if (!processed && !processedUpdates) {
      consecutiveIdle++;
      await sleep(Math.min(2000, 200 + consecutiveIdle * 50));
    } else {
      consecutiveIdle = 0;
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("Worker error:", e?.message || e);
    await sleep(1500);
  }
}
