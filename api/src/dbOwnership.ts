import type { Db } from "./db.js";

export type Filter = { op: "eq" | "in" | "lt" | "lte" | "gt" | "gte" | "neq" | "is"; column: string; value?: any };

export function getEqFilterValue(filters: Array<Filter> | undefined, column: string): any | undefined {
  return filters?.find((f) => f.op === "eq" && f.column === column)?.value;
}

export async function assertOwnedBySellerViaProductsJoin(
  db: Db,
  opts: { table: string; id: string; sellerId: string; productIdColumn: string }
): Promise<{ ok: true } | { ok: false; kind: "not_found" | "forbidden" }> {
  const exists = await db.query(`select 1 from public."${opts.table}" where id = $1 limit 1`, [opts.id]);
  if (!exists.rows[0]) return { ok: false, kind: "not_found" };

  const owned = await db.query(
    `select 1
     from public."${opts.table}" t
     join public.products p on p.id = t."${opts.productIdColumn}"
     where t.id = $1 and p.seller_id = $2
     limit 1`,
    [opts.id, opts.sellerId]
  );
  if (!owned.rows[0]) return { ok: false, kind: "forbidden" };
  return { ok: true };
}

export async function assertOwnedCourseModule(
  db: Db,
  opts: { moduleId: string; sellerId: string }
): Promise<{ ok: true } | { ok: false; kind: "not_found" | "forbidden" }> {
  const exists = await db.query("select 1 from public.course_modules where id = $1 limit 1", [opts.moduleId]);
  if (!exists.rows[0]) return { ok: false, kind: "not_found" };

  const owned = await db.query(
    `select 1
     from public.course_modules m
     join public.courses c on c.id = m.course_id
     join public.products p on p.id = c.product_id
     where m.id = $1 and p.seller_id = $2
     limit 1`,
    [opts.moduleId, opts.sellerId]
  );
  if (!owned.rows[0]) return { ok: false, kind: "forbidden" };
  return { ok: true };
}

export async function assertOwnedCourseLesson(
  db: Db,
  opts: { lessonId: string; sellerId: string }
): Promise<{ ok: true } | { ok: false; kind: "not_found" | "forbidden" }> {
  const exists = await db.query("select 1 from public.course_lessons where id = $1 limit 1", [opts.lessonId]);
  if (!exists.rows[0]) return { ok: false, kind: "not_found" };

  const owned = await db.query(
    `select 1
     from public.course_lessons l
     join public.course_modules m on m.id = l.module_id
     join public.courses c on c.id = m.course_id
     join public.products p on p.id = c.product_id
     where l.id = $1 and p.seller_id = $2
     limit 1`,
    [opts.lessonId, opts.sellerId]
  );
  if (!owned.rows[0]) return { ok: false, kind: "forbidden" };
  return { ok: true };
}

export async function assertOwnedBySellerViaCourseId(db: Db, opts: { courseId: string; sellerId: string }): Promise<boolean> {
  const owns = await db.query(
    "select 1 from public.courses c join public.products p on p.id = c.product_id where c.id = $1 and p.seller_id = $2 limit 1",
    [opts.courseId, opts.sellerId]
  );
  return !!owns.rows[0];
}

export async function assertOwnedBySellerViaModuleId(db: Db, opts: { moduleId: string; sellerId: string }): Promise<boolean> {
  const owns = await db.query(
    `select 1
     from public.course_modules m
     join public.courses c on c.id = m.course_id
     join public.products p on p.id = c.product_id
     where m.id = $1 and p.seller_id = $2
     limit 1`,
    [opts.moduleId, opts.sellerId]
  );
  return !!owns.rows[0];
}
