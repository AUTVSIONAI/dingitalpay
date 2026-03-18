import type { Db } from "./db.js";
import { enqueueTemplatedEmail } from "./emailQueue.js";

function asUuidList(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export async function queueAccountCreatedEmail(
  db: Db,
  args: { userId: string; email: string; userName?: string | null }
): Promise<void> {
  const email = String(args.email || "").trim().toLowerCase();
  const userId = String(args.userId || "").trim();
  if (!email || !userId) return;
  await enqueueTemplatedEmail(db, {
    to: email,
    eventKey: "account_created",
    dedupeKey: `account_created:${userId}:${email}`,
    vars: {
      user_name: String(args.userName || "").trim() || "usuário",
    },
  }).catch(() => {});
}

export async function queueCourseAccessGrantedEmails(
  db: Db,
  args: {
    orderId: string;
    buyerEmail: string;
    buyerName?: string | null;
    productIds: string[];
  }
): Promise<void> {
  const buyerEmail = String(args.buyerEmail || "").trim().toLowerCase();
  const orderId = String(args.orderId || "").trim();
  const productIds = asUuidList(args.productIds);
  if (!buyerEmail || !orderId || productIds.length === 0) return;

  const coursesRes = await db.query<{ id: string; title: string; product_id: string }>(
    `
      select id, title, product_id
      from public.courses
      where product_id = any($1::uuid[])
    `,
    [productIds]
  );

  const buyerName = String(args.buyerName || "").trim() || "Aluno";
  for (const course of coursesRes.rows || []) {
    const courseId = String(course.id || "").trim();
    const courseName = String(course.title || "").trim() || "Curso";
    if (!courseId) continue;
    await enqueueTemplatedEmail(db, {
      to: buyerEmail,
      eventKey: "course_access_granted",
      dedupeKey: `course_access_granted:${orderId}:${courseId}:${buyerEmail}`,
      vars: {
        user_name: buyerName,
        course_name: courseName,
      },
    }).catch(() => {});
  }
}

export async function queueCourseCompletedEmail(
  db: Db,
  args: {
    userId: string;
    userEmail: string;
    userName?: string | null;
    courseId: string;
  }
): Promise<{ completed: boolean }> {
  const userId = String(args.userId || "").trim();
  const userEmail = String(args.userEmail || "").trim().toLowerCase();
  const courseId = String(args.courseId || "").trim();
  if (!userId || !userEmail || !courseId) return { completed: false };

  const summaryRes = await db.query<{
    course_title: string;
    total_lessons: string;
    completed_lessons: string;
  }>(
    `
      select
        c.title as course_title,
        count(cl.id)::text as total_lessons,
        count(cp.lesson_id) filter (where cp.completed = true)::text as completed_lessons
      from public.courses c
      left join public.course_modules cm on cm.course_id = c.id
      left join public.course_lessons cl on cl.module_id = cm.id
      left join public.course_progress cp on cp.lesson_id = cl.id and cp.user_id = $2
      where c.id = $1
      group by c.id, c.title
      limit 1
    `,
    [courseId, userId]
  );
  const summary = summaryRes.rows[0];
  const totalLessons = Number(summary?.total_lessons || 0);
  const completedLessons = Number(summary?.completed_lessons || 0);
  if (!summary || totalLessons === 0 || completedLessons !== totalLessons) {
    return { completed: false };
  }

  await enqueueTemplatedEmail(db, {
    to: userEmail,
    eventKey: "course_completed",
    dedupeKey: `course_completed:${userId}:${courseId}`,
    vars: {
      user_name: String(args.userName || "").trim() || "Aluno",
      course_name: String(summary.course_title || "").trim() || "Curso",
    },
  }).catch(() => {});
  return { completed: true };
}

export async function queueProfileUpdatedEmail(
  db: Db,
  args: { userEmail: string; userName?: string | null }
): Promise<void> {
  const userEmail = String(args.userEmail || "").trim().toLowerCase();
  if (!userEmail) return;
  await enqueueTemplatedEmail(db, {
    to: userEmail,
    eventKey: "profile_updated",
    vars: {
      user_name: String(args.userName || "").trim() || "usuário",
    },
  }).catch(() => {});
}

export async function queueRewardUnlockedEmails(
  db: Db,
  args: { sellerId: string }
): Promise<{ currentRevenue: number; rewardsQueued: number }> {
  const sellerId = String(args.sellerId || "").trim();
  if (!sellerId) return { currentRevenue: 0, rewardsQueued: 0 };

  const sellerRes = await db.query<{ email: string; name: string }>(
    `
      select u.email, coalesce(p.name, '') as name
      from public.users u
      left join public.profiles p on p.user_id = u.id
      where u.id = $1
      limit 1
    `,
    [sellerId]
  );
  const seller = sellerRes.rows[0];
  const sellerEmail = String(seller?.email || "").trim().toLowerCase();
  if (!sellerEmail) return { currentRevenue: 0, rewardsQueued: 0 };
  const sellerName = String(seller?.name || "").trim() || "Vendedor";

  const revenueRes = await db.query<{ total: string }>(
    `
      select coalesce(sum(amount) filter (where status = 'approved'), 0)::text as total
      from public.orders
      where seller_id = $1
    `,
    [sellerId]
  );
  const currentRevenue = Number(revenueRes.rows[0]?.total || 0);

  const rewardsRes = await db.query<{ id: string; name: string }>(
    `
      select id, name
      from public.rewards
      where status = 'active'
        and max_revenue <= $1
      order by max_revenue asc, created_at asc
    `,
    [currentRevenue]
  );

  let rewardsQueued = 0;
  for (const reward of rewardsRes.rows || []) {
    const rewardId = String(reward.id || "").trim();
    if (!rewardId) continue;
    const result = await enqueueTemplatedEmail(db, {
      to: sellerEmail,
      eventKey: "reward_unlocked",
      dedupeKey: `reward_unlocked:${sellerId}:${rewardId}`,
      vars: {
        seller_name: sellerName,
        reward_name: String(reward.name || "").trim() || "Recompensa",
      },
    }).catch(() => null);
    if (result?.ok && result.queued) rewardsQueued += 1;
  }

  return { currentRevenue, rewardsQueued };
}

export async function queueRewardSentEmail(
  db: Db,
  args: { claimId: string }
): Promise<boolean> {
  const claimId = String(args.claimId || "").trim();
  if (!claimId) return false;

  const claimRes = await db.query<{
    claim_id: string;
    seller_email: string;
    seller_name: string;
    reward_name: string;
  }>(
    `
      select
        rc.id as claim_id,
        u.email as seller_email,
        coalesce(p.name, '') as seller_name,
        coalesce(r.name, '') as reward_name
      from public.reward_claims rc
      join public.users u on u.id = rc.seller_id
      left join public.profiles p on p.user_id = rc.seller_id
      left join public.rewards r on r.id = rc.reward_id
      where rc.id = $1
        and rc.status = 'sent'
      limit 1
    `,
    [claimId]
  );
  const claim = claimRes.rows[0];
  const sellerEmail = String(claim?.seller_email || "").trim().toLowerCase();
  if (!claim || !sellerEmail) return false;

  const result = await enqueueTemplatedEmail(db, {
    to: sellerEmail,
    eventKey: "reward_sent",
    dedupeKey: `reward_sent:${claimId}:${sellerEmail}`,
    vars: {
      seller_name: String(claim.seller_name || "").trim() || "Vendedor",
      reward_name: String(claim.reward_name || "").trim() || "Recompensa",
    },
  }).catch(() => null);

  return Boolean(result?.ok && result.queued);
}

function formatBRL(value: any): string {
  const amount = Number(value || 0);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function queueOrderLifecycleEmails(
  db: Db,
  args: {
    orderId: string;
    sellerId?: string | null;
    productId?: string | null;
    productName?: string | null;
    buyerEmail?: string | null;
    buyerName?: string | null;
    amount?: number | string | null;
    status: string;
  }
): Promise<void> {
  const orderId = String(args.orderId || "").trim();
  const buyerEmail = String(args.buyerEmail || "").trim().toLowerCase();
  const buyerName = String(args.buyerName || "").trim() || "Cliente";
  const productName = String(args.productName || "").trim() || "Produto";
  const productId = String(args.productId || "").trim();
  const sellerId = String(args.sellerId || "").trim();
  const amount = formatBRL(args.amount || 0);
  const status = String(args.status || "").trim().toLowerCase();

  if (status === "approved" && buyerEmail) {
    await enqueueTemplatedEmail(db, {
      to: buyerEmail,
      eventKey: "purchase_approved",
      dedupeKey: `order:purchase_approved:${orderId}:${buyerEmail}`,
      vars: { user_name: buyerName, amount, product_name: productName },
    }).catch(() => {});
    const itemRes = await db.query<{ product_id: string }>(
      "select product_id from public.order_items where order_id = $1",
      [orderId]
    ).catch(() => ({ rows: [] as { product_id: string }[] }));
    const productIds = [...new Set([productId, ...(itemRes.rows || []).map((row) => String(row.product_id || "").trim())].filter(Boolean))];
    await queueCourseAccessGrantedEmails(db, {
      orderId,
      buyerEmail,
      buyerName,
      productIds,
    }).catch(() => {});
  }

  if (status === "pending" && buyerEmail) {
    await enqueueTemplatedEmail(db, {
      to: buyerEmail,
      eventKey: "purchase_pending",
      dedupeKey: `order:purchase_pending:${orderId}:${buyerEmail}`,
      vars: { user_name: buyerName, amount, product_name: productName },
    }).catch(() => {});
  }

  if (status === "refunded" && buyerEmail) {
    await enqueueTemplatedEmail(db, {
      to: buyerEmail,
      eventKey: "purchase_refunded",
      dedupeKey: `order:purchase_refunded:${orderId}:${buyerEmail}`,
      vars: { user_name: buyerName, amount, product_name: productName },
    }).catch(() => {});
  }

  if (status === "approved" && sellerId) {
    const sellerRes = await db.query<{ email: string; name: string }>(
      `
        select u.email, coalesce(p.name,'') as name
        from public.users u
        left join public.profiles p on p.user_id = u.id
        where u.id = $1
        limit 1
      `,
      [sellerId]
    );
    const seller = sellerRes.rows[0];
    const sellerEmail = String(seller?.email || "").trim().toLowerCase();
    if (sellerEmail) {
      await enqueueTemplatedEmail(db, {
        to: sellerEmail,
        eventKey: "new_sale",
        dedupeKey: `order:new_sale:${orderId}:${sellerEmail}`,
        vars: {
          seller_name: String(seller?.name || "").trim() || "Vendedor",
          amount,
          product_name: productName,
        },
      }).catch(() => {});
    }
    await queueRewardUnlockedEmails(db, { sellerId }).catch(() => {});
  }
}
