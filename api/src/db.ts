import pg from "pg";

const { Pool } = pg;

export type Db = pg.Pool;

export type DbPoolConfig = {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
};

export function createPool(config: DbPoolConfig): Db {
  const pool = new Pool({
    ...config,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  pool.on("error", (err) => {
    // During self-updates or transient network issues, Postgres can restart under a long-lived process.
    // Without a listener, pg emits an unhandled "error" event on idle clients and crashes the process.
    // Log and let callers recover on the next query/retry cycle.
    // eslint-disable-next-line no-console
    console.error("Postgres pool error:", err instanceof Error ? err.message : String(err));
  });
  return pool;
}

export async function withClient<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
