// Supabase-compatible client wrapper (self-hosted API).
// The app codebase expects the Supabase JS API surface (`auth`, `from`, `rpc`, `functions`, `storage`),
// but runtime no longer depends on Supabase Cloud.
import type { Database } from "./types";

type SupabaseError = { message: string; code?: string };
type SupabaseResponse<T> = { data: T | null; error: SupabaseError | null; count?: number | null };

const API_ORIGIN = String(import.meta.env.VITE_API_ORIGIN || "").trim(); // optional (dev)
const API_PATH = "/api";
const API_BASE = API_ORIGIN ? `${API_ORIGIN}${API_PATH}` : API_PATH;

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { data: null, error: { message: text } };
  }
}

async function apiRequest(path: string, init: RequestInit = {}): Promise<{ json: any; response: Response }> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.headers || {}),
    },
  });
  const json = await readJsonSafe(response);
  return { json, response };
}

type DbFilterOp = "eq" | "in" | "lt" | "lte" | "gt" | "gte" | "neq" | "is";
type DbFilter = { op: DbFilterOp; column: string; value?: any };
type DbQuery = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  select?: string;
  returning?: string;
  filters?: DbFilter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  single?: boolean;
  maybeSingle?: boolean;
  count?: "exact";
  head?: boolean;
  values?: Record<string, any>;
  rows?: Array<Record<string, any>>;
  onConflict?: string;
};

class QueryBuilder<T = any> implements PromiseLike<SupabaseResponse<T>> {
  private q: DbQuery;

  constructor(table: string) {
    this.q = { table, action: "select", filters: [] };
  }

  private pushFilter(op: DbFilterOp, column: string, value?: any) {
    this.q.filters = this.q.filters || [];
    this.q.filters.push({ op, column, value });
    return this;
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    // If we're in a write action, select() means "returning"
    if (this.q.action !== "select") {
      this.q.returning = columns || "*";
      return this;
    }

    this.q.select = columns || "*";
    if (options?.count) this.q.count = options.count;
    if (options?.head) this.q.head = true;
    return this;
  }

  insert(values: Record<string, any> | Array<Record<string, any>>, _options?: { returning?: "minimal" | "representation" }) {
    this.q.action = "insert";
    this.q.rows = Array.isArray(values) ? values : [values];
    // Supabase default is returning representation; mimic with returning="*" unless overridden.
    this.q.returning = this.q.returning ?? "*";
    return this;
  }

  upsert(values: Record<string, any> | Array<Record<string, any>>, options: { onConflict: string }) {
    this.q.action = "upsert";
    this.q.rows = Array.isArray(values) ? values : [values];
    this.q.onConflict = options.onConflict;
    this.q.returning = this.q.returning ?? "*";
    return this;
  }

  update(values: Record<string, any>, _options?: { returning?: "minimal" | "representation" }) {
    this.q.action = "update";
    this.q.values = values;
    this.q.returning = this.q.returning ?? "*";
    return this;
  }

  delete(_options?: { returning?: "minimal" | "representation" }) {
    this.q.action = "delete";
    this.q.returning = this.q.returning ?? "*";
    return this;
  }

  eq(column: string, value: any) { return this.pushFilter("eq", column, value); }
  neq(column: string, value: any) { return this.pushFilter("neq", column, value); }
  lt(column: string, value: any) { return this.pushFilter("lt", column, value); }
  lte(column: string, value: any) { return this.pushFilter("lte", column, value); }
  gt(column: string, value: any) { return this.pushFilter("gt", column, value); }
  gte(column: string, value: any) { return this.pushFilter("gte", column, value); }
  is(column: string, value: any) { return this.pushFilter("is", column, value); }
  in(column: string, values: any[]) { return this.pushFilter("in", column, values); }

  not(column: string, operator: string, value: any) {
    const op = String(operator || "").trim().toLowerCase();
    // Minimal compatibility: `.not('id','is',null)` => `id IS NOT NULL`.
    if (op === "is" && value === null) return this.pushFilter("is", column, "__not_null__");
    if (op === "eq") return this.pushFilter("neq", column, value);
    if (op === "neq") return this.pushFilter("eq", column, value);
    // Fallback: best-effort invert where possible.
    return this.pushFilter("neq", column, value);
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.q.order = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.q.limit = count;
    return this;
  }

  single() {
    this.q.single = true;
    return this;
  }

  maybeSingle() {
    this.q.maybeSingle = true;
    return this;
  }

  private async execute(): Promise<SupabaseResponse<T>> {
    const { json, response } = await apiRequest("/db/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.q),
    });

    if (!response.ok) {
      const err = json?.error || { message: "Request failed" };
      return { data: null, error: { message: err.message || "Request failed", code: err.code } };
    }

    return {
      data: (json?.data ?? null) as T | null,
      error: (json?.error ?? null) as SupabaseError | null,
      count: typeof json?.count === "number" ? json.count : null,
    };
  }

  then<TResult1 = SupabaseResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResponse<T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }
}

type AuthSession = {
  access_token: string;
  user: { id: string; email: string; user_metadata: Record<string, any> };
  expires_at: number;
  mfa_pending?: boolean;
  mfa_setup_required?: boolean;
};

type AuthChangeEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "PASSWORD_RECOVERY"
  | "USER_UPDATED";

type AuthListener = (event: AuthChangeEvent, session: AuthSession | null) => void;

const authListeners = new Set<AuthListener>();

function notifyAuth(event: AuthChangeEvent, session: AuthSession | null) {
  for (const cb of Array.from(authListeners)) {
    try { cb(event, session); } catch { /* ignore */ }
  }
}

function getRecoveryTokenFromHash(): string | null {
  const hash = String(window.location.hash || "");
  if (!hash.includes("type=recovery")) return null;
  const m = hash.match(/(?:^|[&#?])token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export const supabase = {
  auth: {
    onAuthStateChange(cb: AuthListener) {
      authListeners.add(cb);
      // Best-effort compatibility with Supabase recovery hash flow
      if (typeof window !== "undefined") {
        const token = getRecoveryTokenFromHash();
        if (token) queueMicrotask(() => notifyAuth("PASSWORD_RECOVERY", null));
      }
      return {
        data: {
          subscription: {
            unsubscribe() {
              authListeners.delete(cb);
            },
          },
        },
      };
    },

    async getSession(): Promise<{ data: { session: AuthSession | null }; error: SupabaseError | null }> {
      const { json, response } = await apiRequest("/auth/session", { method: "GET" });
      if (!response.ok) {
        return { data: { session: null }, error: { message: json?.error?.message || "Unauthorized", code: json?.error?.code } };
      }
      return { data: { session: json?.data?.session ?? null }, error: null };
    },

    async refreshSession(): Promise<{ data: { session: AuthSession | null }; error: SupabaseError | null }> {
      const res = await this.getSession();
      notifyAuth("TOKEN_REFRESHED", res.data.session);
      return res;
    },

    async getUser(): Promise<{ data: { user: AuthSession["user"] | null }; error: SupabaseError | null }> {
      const { json, response } = await apiRequest("/auth/user", { method: "GET" });
      if (!response.ok) {
        return { data: { user: null }, error: { message: json?.error?.message || "Unauthorized", code: json?.error?.code } };
      }
      return { data: { user: json?.data?.user ?? null }, error: null };
    },

    async signInWithPassword(input: { email: string; password: string; turnstileResponse?: string; use_trusted_device?: boolean }) {
      const body: Record<string, any> = {
        email: input.email,
        password: input.password,
      };
      if (input.turnstileResponse) {
        body["cf-turnstile-response"] = input.turnstileResponse;
      }
      if (typeof input.use_trusted_device === "boolean") {
        body.use_trusted_device = input.use_trusted_device;
      }

      const { json, response } = await apiRequest("/auth/sign-in-with-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || json?.error) {
        return { data: { session: null }, error: json?.error || { message: "Login failed" } };
      }
      const session = json?.data?.session ?? null;
      notifyAuth("SIGNED_IN", session);
      return { data: { session }, error: null };
    },

    async signUp(
      input: {
        email: string;
        password: string;
        turnstile_token?: string;
        turnstileResponse?: string;
        options?: { data?: Record<string, any>; emailRedirectTo?: string };
      }
    ) {
      const turnstileResponse = input.turnstileResponse || input.turnstile_token;
      const body = {
        email: input.email,
        password: input.password,
        options: input.options,
        ...(turnstileResponse ? { "cf-turnstile-response": turnstileResponse } : {}),
      };
      const { json, response } = await apiRequest("/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || json?.error) {
        return {
          data: { user: null, requires_email_verification: true },
          error: json?.error || { message: "Sign up failed" },
        };
      }
      return {
        data: {
          user: json?.data?.user ?? null,
          requires_email_verification: Boolean(json?.data?.requires_email_verification),
        },
        error: null,
      };
    },

    async signOut() {
      const { json } = await apiRequest("/auth/sign-out", { method: "POST" });
      notifyAuth("SIGNED_OUT", null);
      return { data: json?.data ?? {}, error: json?.error ?? null };
    },

    async resetPasswordForEmail(email: string, options?: { redirectTo?: string }, turnstileResponse?: string) {
      const body: Record<string, any> = { email, options };
      if (turnstileResponse) {
        body["cf-turnstile-response"] = turnstileResponse;
      }
      const { json, response } = await apiRequest("/auth/reset-password-for-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || json?.error) {
        return { data: null, error: json?.error || { message: "Reset password failed" } };
      }
      return { data: json?.data ?? {}, error: null };
    },

    async updateUser(input: { password?: string }, turnstileResponse?: string) {
      const recovery_token = typeof window !== "undefined" ? getRecoveryTokenFromHash() : null;
      const payload: Record<string, any> = recovery_token ? { ...input, recovery_token } : { ...input };
      if (turnstileResponse) {
        payload["cf-turnstile-response"] = turnstileResponse;
      }
      const { json, response } = await apiRequest("/auth/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok || json?.error) {
        return { data: { user: null }, error: json?.error || { message: "Update user failed" } };
      }
      notifyAuth("USER_UPDATED", null);
      return { data: { user: json?.data?.user ?? null }, error: null };
    },

    async startTwoFactorSetup() {
      const { json, response } = await apiRequest("/auth/2fa/setup/start", { method: "POST" });
      if (!response.ok || json?.error) {
        return { data: null, error: json?.error || { message: "2FA setup start failed" } };
      }
      return { data: json?.data ?? null, error: null };
    },

    async confirmTwoFactorSetup(input: { code: string; remember_device?: boolean }) {
      const { json, response } = await apiRequest("/auth/2fa/setup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok || json?.error) {
        return { data: null, error: json?.error || { message: "2FA setup confirm failed" } };
      }
      return { data: json?.data ?? null, error: null };
    },

    async verifyTwoFactor(input: { code?: string; recovery_code?: string; remember_device?: boolean }) {
      const { json, response } = await apiRequest("/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok || json?.error) {
        return { data: null, error: json?.error || { message: "2FA verify failed" } };
      }
      return { data: json?.data ?? null, error: null };
    },

    async regenerateTwoFactorRecoveryCodes(input: { code: string }) {
      const { json, response } = await apiRequest("/auth/2fa/recovery/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok || json?.error) {
        return { data: null, error: json?.error || { message: "2FA recovery regenerate failed" } };
      }
      return { data: json?.data ?? null, error: null };
    },

    async disableTwoFactor(input: { code?: string; recovery_code?: string }) {
      const { json, response } = await apiRequest("/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok || json?.error) {
        return { data: null, error: json?.error || { message: "2FA disable failed" } };
      }
      return { data: json?.data ?? null, error: null };
    },
  },

  from<TTable extends keyof Database["public"]["Tables"] & string>(_table: TTable) {
    return new QueryBuilder<any>(_table);
  },

  async rpc(fn: string, args: Record<string, any>) {
    const { json, response } = await apiRequest(`/rpc/${encodeURIComponent(fn)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });
    if (!response.ok || json?.error) return { data: null, error: json?.error || { message: "RPC failed" } };
    return { data: json?.data ?? null, error: null };
  },

  functions: {
    _authHeader: {} as Record<string, string>,

    setAuth(token: string | null) {
      if (!token) {
        this._authHeader = {};
        return;
      }
      this._authHeader = { Authorization: `Bearer ${token}` };
    },

    async invoke(name: string, options?: { body?: any; headers?: Record<string, string> }) {
      const { json, response } = await apiRequest(`/functions/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this._authHeader, ...(options?.headers || {}) },
        body: JSON.stringify(options?.body ?? {}),
      });

      const data = json?.data ?? json;
      const error = json?.error ?? (!response.ok ? { message: "Function failed" } : null);
      return { data, error, response };
    },
  },

  storage: {
    from(bucket: string) {
      return {
        async upload(path: string, file: Blob, options?: { upsert?: boolean }) {
          const form = new FormData();
          const filename = (file as any)?.name || "file";
          form.append("file", file, filename);
          const upsert = options?.upsert ? "true" : "false";
          const { json, response } = await apiRequest(`/storage/${encodeURIComponent(bucket)}/upload?path=${encodeURIComponent(path)}&upsert=${upsert}`, {
            method: "POST",
            body: form,
          });
          if (!response.ok || json?.error) return { data: null, error: json?.error || { message: "Upload failed" } };
          return { data: json?.data ?? null, error: null };
        },

        async list(prefix = "") {
          const { json, response } = await apiRequest(`/storage/${encodeURIComponent(bucket)}/list?prefix=${encodeURIComponent(prefix)}`, { method: "GET" });
          if (!response.ok || json?.error) return { data: null, error: json?.error || { message: "List failed" } };
          return { data: json?.data ?? [], error: null };
        },

        async remove(paths: string[]) {
          const { json, response } = await apiRequest(`/storage/${encodeURIComponent(bucket)}/remove`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths }),
          });
          if (!response.ok || json?.error) return { data: null, error: json?.error || { message: "Remove failed" } };
          return { data: json?.data ?? [], error: null };
        },

        getPublicUrl(path: string) {
          return {
            data: {
              publicUrl: `${API_ORIGIN || (typeof window !== "undefined" ? window.location.origin : "")}${API_PATH}/storage/public/${encodeURIComponent(bucket)}/${encodeURIComponent(String(path || "").replace(/^\/+/, "")).replace(/%2F/g, "/")}`,
            },
          };
        },
      };
    },
  },
};
