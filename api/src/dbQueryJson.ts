import type { Db } from "./db.js";

type CachedJsonCols = { cols: Set<string>; exp: number };

const jsonColsCache = new Map<string, CachedJsonCols>();
const JSON_COLS_TTL_MS = 5 * 60 * 1000;

export async function getJsonColumns(db: Db, table: string): Promise<Set<string>> {
  const key = String(table || "").trim();
  if (!key) return new Set();

  const now = Date.now();
  const cached = jsonColsCache.get(key);
  if (cached && cached.exp > now) return cached.cols;

  const res = await db.query<{ column_name: string }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and data_type in ('json', 'jsonb')
    `,
    [key]
  );
  const cols = new Set<string>((res.rows || []).map((r) => String(r.column_name || "").trim()).filter(Boolean));
  jsonColsCache.set(key, { cols, exp: now + JSON_COLS_TTL_MS });
  return cols;
}

export function normalizeJsonColsInRecord(record: Record<string, any>, jsonCols: Set<string>): Record<string, any> {
  if (!record || typeof record !== "object") return record;
  if (!jsonCols || jsonCols.size === 0) return record;

  let changed = false;
  const out: Record<string, any> = { ...record };

  for (const col of jsonCols) {
    if (!(col in out)) continue;
    const value = out[col];
    if (value === undefined || value === null) continue;

    // `pg` serializes Arrays as Postgres arrays (`{"a","b"}`), which breaks json/jsonb columns.
    // For json/jsonb columns, force JSON string representation for any object/array.
    if (typeof value === "object") {
      out[col] = JSON.stringify(value);
      changed = true;
    }
  }

  return changed ? out : record;
}

export function normalizeJsonColsInRows(rows: Array<Record<string, any>>, jsonCols: Set<string>): Array<Record<string, any>> {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (!jsonCols || jsonCols.size === 0) return rows;
  return rows.map((r) => normalizeJsonColsInRecord(r, jsonCols));
}

