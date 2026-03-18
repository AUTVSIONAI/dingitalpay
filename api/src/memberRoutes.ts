import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import { requireAuth } from "./auth.js";
import { attachProductEntitlementsToUser } from "./productEntitlements.js";
import { queueCourseCompletedEmail } from "./emailEventTriggers.js";

async function ensureBuyerAccess(db: Db, req: any, reply: any) {
  requireAuth(req, reply);
  if (req.auth.role !== "buyer") {
    reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    throw new Error("Forbidden");
  }
  await attachProductEntitlementsToUser(db, String(req.auth.user.id || ""), String(req.auth.user.email || "")).catch(() => {});
}

async function fetchCompletedLessonIds(db: Db, userId: string): Promise<Set<string>> {
  const progressRes = await db.query<{ lesson_id: string }>(
    "select lesson_id from public.course_progress where user_id = $1 and completed = true",
    [userId]
  );
  return new Set(progressRes.rows.map((row) => String(row.lesson_id || "")));
}

export async function registerMemberRoutes(api: FastifyInstance, db: Db) {
  api.get("/member/purchases", async (req, reply) => {
    await ensureBuyerAccess(db, req, reply);
    const auth = req.auth!;
    const userId = String(auth.user.id || "");
    const email = String(auth.user.email || "").trim().toLowerCase();

    const res = await db.query<any>(
      `
        select
          o.id,
          o.seller_id,
          o.product_id,
          c.id as course_id,
          o.buyer_email,
          o.buyer_name,
          o.buyer_phone,
          o.buyer_cpf,
          o.product_name,
          o.amount,
          coalesce(o.gross_amount, o.amount) as gross_amount,
          coalesce(o.platform_fee, 0) as platform_fee,
          o.method,
          o.status,
          o.transaction_id,
          coalesce(o.utm, '{}'::jsonb) as utm,
          o.created_at,
          o.updated_at,
          exists (
            select 1
            from public.product_entitlements pe
            where pe.user_id = $2
              and pe.product_id = o.product_id
              and pe.status = 'active'
          ) as access_granted
        from public.orders o
        left join public.courses c on c.product_id = o.product_id
        where lower(o.buyer_email) = $1
        order by o.created_at desc
      `,
      [email, userId]
    );

    return reply.send({ data: res.rows || [], error: null });
  });

  api.get("/member/courses", async (req, reply) => {
    await ensureBuyerAccess(db, req, reply);
    const auth = req.auth!;
    const userId = String(auth.user.id || "");

    const coursesRes = await db.query<any>(
      `
        select
          c.id,
          c.title,
          c.description,
          c.image_url,
          count(cl.id)::int as total_lessons
        from public.courses c
        left join public.course_modules cm on cm.course_id = c.id
        left join public.course_lessons cl on cl.module_id = cm.id
        where exists (
          select 1
          from public.product_entitlements pe
          where pe.user_id = $1
            and pe.product_id = c.product_id
            and pe.status = 'active'
        )
        group by c.id, c.title, c.description, c.image_url
        order by c.created_at desc
      `,
      [userId]
    );

    const data = (coursesRes.rows || []).map((row: any) => {
      const totalLessons = Number(row.total_lessons || 0);
      const completedLessons = Number(row.completed_lessons || 0);
      const progress = totalLessons > 0 ? completedLessons : 0;
      return {
        id: String(row.id || ""),
        title: String(row.title || ""),
        description: String(row.description || ""),
        image: String(row.image_url || "/placeholder.svg"),
        totalLessons,
        completedLessons: progress,
        status: totalLessons > 0 && progress === totalLessons ? "completed" : "in_progress",
      };
    });

    if (data.length > 0) {
      const countsRes = await db.query<{ course_id: string; total: string }>(
        `
          select
            cm.course_id,
            count(cp.lesson_id)::text as total
          from public.course_progress cp
          join public.course_lessons cl on cl.id = cp.lesson_id
          join public.course_modules cm on cm.id = cl.module_id
          where cp.user_id = $1
            and cp.completed = true
            and cm.course_id = any($2::uuid[])
          group by cm.course_id
        `,
        [userId, data.map((row) => row.id)]
      );
      const completedByCourse = new Map(countsRes.rows.map((row) => [String(row.course_id), Number.parseInt(String(row.total || "0"), 10) || 0]));
      for (const course of data) {
        const completedLessons = completedByCourse.get(course.id) || 0;
        course.completedLessons = completedLessons;
        course.status = course.totalLessons > 0 && completedLessons === course.totalLessons ? "completed" : "in_progress";
      }
    }

    return reply.send({ data, error: null });
  });

  api.get("/member/courses/:courseId", async (req, reply) => {
    await ensureBuyerAccess(db, req, reply);
    const auth = req.auth!;
    const userId = String(auth.user.id || "");
    const courseId = z.object({ courseId: z.string().uuid() }).parse(req.params).courseId;

    const courseRes = await db.query<any>(
      `
        select c.id, c.title, c.description
        from public.courses c
        where c.id = $2
          and exists (
            select 1
            from public.product_entitlements pe
            where pe.user_id = $1
              and pe.product_id = c.product_id
              and pe.status = 'active'
          )
        limit 1
      `,
      [userId, courseId]
    );
    const course = courseRes.rows[0];
    if (!course) return reply.code(404).send({ error: { code: "COURSE_NOT_FOUND", message: "Curso não encontrado." } });

    const lessonsRes = await db.query<any>(
      `
        select
          cm.id as module_id,
          cm.title as module_title,
          cm.sort_order as module_sort_order,
          cl.id as lesson_id,
          cl.title as lesson_title,
          cl.duration as lesson_duration,
          cl.locked as lesson_locked,
          cl.sort_order as lesson_sort_order
        from public.course_modules cm
        left join public.course_lessons cl on cl.module_id = cm.id
        where cm.course_id = $1
        order by cm.sort_order asc, cl.sort_order asc
      `,
      [courseId]
    );
    const completedSet = await fetchCompletedLessonIds(db, userId);
    const modules = new Map<string, any>();

    for (const row of lessonsRes.rows || []) {
      const moduleId = String(row.module_id || "");
      if (!modules.has(moduleId)) {
        modules.set(moduleId, {
          id: moduleId,
          title: String(row.module_title || ""),
          lessons: [],
        });
      }
      if (row.lesson_id) {
        modules.get(moduleId).lessons.push({
          id: String(row.lesson_id),
          title: String(row.lesson_title || ""),
          duration: String(row.lesson_duration || "00:00"),
          completed: completedSet.has(String(row.lesson_id)),
          locked: Boolean(row.lesson_locked),
        });
      }
    }

    return reply.send({
      data: {
        title: String(course.title || ""),
        description: String(course.description || ""),
        modules: [...modules.values()],
      },
      error: null,
    });
  });

  api.get("/member/courses/:courseId/full", async (req, reply) => {
    await ensureBuyerAccess(db, req, reply);
    const auth = req.auth!;
    const userId = String(auth.user.id || "");
    const courseId = z.object({ courseId: z.string().uuid() }).parse(req.params).courseId;

    const courseRes = await db.query<any>(
      `
        select c.id, c.title, c.description
        from public.courses c
        where c.id = $2
          and exists (
            select 1
            from public.product_entitlements pe
            where pe.user_id = $1
              and pe.product_id = c.product_id
              and pe.status = 'active'
          )
        limit 1
      `,
      [userId, courseId]
    );
    const course = courseRes.rows[0];
    if (!course) return reply.code(404).send({ error: { code: "COURSE_NOT_FOUND", message: "Curso não encontrado." } });

    const lessonsRes = await db.query<any>(
      `
        select
          cm.id as module_id,
          cm.title as module_title,
          cm.sort_order as module_sort_order,
          cl.id as lesson_id,
          cl.title as lesson_title,
          cl.duration as lesson_duration,
          cl.video_url as lesson_video_url,
          cl.locked as lesson_locked,
          cl.sort_order as lesson_sort_order
        from public.course_modules cm
        left join public.course_lessons cl on cl.module_id = cm.id
        where cm.course_id = $1
        order by cm.sort_order asc, cl.sort_order asc
      `,
      [courseId]
    );
    const completedSet = await fetchCompletedLessonIds(db, userId);
    const modules = new Map<string, any>();

    for (const row of lessonsRes.rows || []) {
      const moduleId = String(row.module_id || "");
      if (!modules.has(moduleId)) {
        modules.set(moduleId, {
          id: moduleId,
          title: String(row.module_title || ""),
          lessons: [],
        });
      }
      if (row.lesson_id) {
        modules.get(moduleId).lessons.push({
          id: String(row.lesson_id),
          title: String(row.lesson_title || ""),
          duration: String(row.lesson_duration || "00:00"),
          completed: completedSet.has(String(row.lesson_id)),
          locked: Boolean(row.lesson_locked),
          videoUrl: String(row.lesson_video_url || ""),
        });
      }
    }

    return reply.send({
      data: {
        title: String(course.title || ""),
        description: String(course.description || ""),
        modules: [...modules.values()],
      },
      error: null,
    });
  });

  api.post("/member/course-progress", async (req, reply) => {
    await ensureBuyerAccess(db, req, reply);
    const auth = req.auth!;
    const userId = String(auth.user.id || "");
    const body = z.object({
      lessonId: z.string().uuid(),
      completed: z.boolean(),
    }).parse((req as any).body || {});

    const lessonRes = await db.query<{ lesson_id: string; course_id: string }>(
      `
        select cl.id as lesson_id, c.id as course_id
        from public.course_lessons cl
        join public.course_modules cm on cm.id = cl.module_id
        join public.courses c on c.id = cm.course_id
        where cl.id = $2
          and exists (
            select 1
            from public.product_entitlements pe
            where pe.user_id = $1
              and pe.product_id = c.product_id
              and pe.status = 'active'
          )
        limit 1
      `,
      [userId, body.lessonId]
    );
    if (!lessonRes.rows[0]) {
      return reply.code(403).send({ error: { code: "COURSE_ACCESS_FORBIDDEN", message: "Acesso não permitido." } });
    }

    if (body.completed) {
      await db.query(
        `
          insert into public.course_progress(user_id, lesson_id, completed, completed_at)
          values ($1, $2, true, now())
          on conflict (user_id, lesson_id)
          do update set completed = true, completed_at = now()
        `,
        [userId, body.lessonId]
      );
      await queueCourseCompletedEmail(db, {
        userId,
        userEmail: String(auth.user.email || "").trim(),
        userName: String(auth.user.user_metadata?.name || "").trim(),
        courseId: String(lessonRes.rows[0]?.course_id || "").trim(),
      }).catch(() => {});
    } else {
      await db.query(
        "update public.course_progress set completed = false, completed_at = null where user_id = $1 and lesson_id = $2",
        [userId, body.lessonId]
      );
    }

    return reply.send({ data: { ok: true }, error: null });
  });
}
