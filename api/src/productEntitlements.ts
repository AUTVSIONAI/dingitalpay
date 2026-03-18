import type { Db } from "./db.js";

export function normalizeEntitlementEmail(email: any): string {
  return String(email || "").trim().toLowerCase();
}

type ProductEntitlementSeed = {
  id: string;
  seller_id: string;
  name: string;
  price: string | number;
};

async function findUserIdByEmail(db: Db, email: string): Promise<string | null> {
  const normalizedEmail = normalizeEntitlementEmail(email);
  if (!normalizedEmail) return null;
  const res = await db.query<{ id: string }>(
    "select id from public.users where lower(email) = $1 limit 1",
    [normalizedEmail]
  );
  return res.rows[0]?.id || null;
}

async function findProductSeedById(db: Db, productId: string): Promise<ProductEntitlementSeed | null> {
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) return null;
  const res = await db.query<ProductEntitlementSeed>(
    `
      select id, seller_id, name, price
      from public.products
      where id = $1
      limit 1
    `,
    [normalizedProductId]
  );
  return res.rows[0] || null;
}

export async function attachProductEntitlementsToUser(db: Db, userId: string, email: string): Promise<number> {
  const normalizedEmail = normalizeEntitlementEmail(email);
  if (!userId || !normalizedEmail) return 0;
  const res = await db.query<{ count: string }>(
    `
      with linked as (
        update public.product_entitlements
        set user_id = $1,
            updated_at = now()
        where normalized_buyer_email = $2
          and (user_id is null or user_id = $1)
        returning id
      )
      select count(*)::text as count from linked
    `,
    [userId, normalizedEmail]
  );
  return Number(res.rows[0]?.count || 0);
}

type OrderEntitlementRow = {
  id: string;
  seller_id: string;
  product_id: string;
  buyer_email: string;
  status: string;
};

export async function syncOrderProductEntitlements(db: Db, orderId: string): Promise<{ status: string; productsSynced: number }> {
  const orderRes = await db.query<OrderEntitlementRow>(
    `
      select id, seller_id, product_id, buyer_email, status
      from public.orders
      where id = $1
      limit 1
    `,
    [orderId]
  );
  const order = orderRes.rows[0];
  if (!order) return { status: "missing", productsSynced: 0 };

  const normalizedBuyerEmail = normalizeEntitlementEmail(order.buyer_email);
  if (!normalizedBuyerEmail) return { status: String(order.status || "").trim().toLowerCase(), productsSynced: 0 };

  const itemRes = await db.query<{ product_id: string }>(
    "select product_id from public.order_items where order_id = $1",
    [orderId]
  );
  const productIds = [...new Set([order.product_id, ...itemRes.rows.map((row) => String(row.product_id || "").trim())].filter(Boolean))];
  const userId = await findUserIdByEmail(db, normalizedBuyerEmail);
  const normalizedStatus = String(order.status || "").trim().toLowerCase();

  if (normalizedStatus === "approved") {
    for (const productId of productIds) {
      await db.query(
        `
          insert into public.product_entitlements (
            order_id,
            product_id,
            seller_id,
            buyer_email,
            normalized_buyer_email,
            user_id,
            status,
            granted_at,
            revoked_at,
            revoked_reason
          )
          values ($1, $2, $3, $4, $5, $6, 'active', now(), null, '')
          on conflict (order_id, product_id)
          do update set
            seller_id = excluded.seller_id,
            buyer_email = excluded.buyer_email,
            normalized_buyer_email = excluded.normalized_buyer_email,
            user_id = coalesce(public.product_entitlements.user_id, excluded.user_id),
            status = 'active',
            revoked_at = null,
            revoked_reason = '',
            updated_at = now()
        `,
        [order.id, productId, order.seller_id, order.buyer_email, normalizedBuyerEmail, userId]
      );
    }
    return { status: normalizedStatus, productsSynced: productIds.length };
  }

  if (normalizedStatus === "refunded" || normalizedStatus === "chargeback" || normalizedStatus === "abandoned") {
    await db.query(
      `
        update public.product_entitlements
        set status = 'revoked',
            revoked_at = coalesce(revoked_at, now()),
            revoked_reason = $2,
            updated_at = now()
        where order_id = $1
          and status <> 'revoked'
      `,
      [order.id, normalizedStatus]
    );
    return { status: normalizedStatus, productsSynced: productIds.length };
  }

  return { status: normalizedStatus, productsSynced: 0 };
}

export async function fetchActiveEntitlementCountsByEmail(
  db: Db,
  emails: string[],
  productIds: string[]
): Promise<Map<string, Map<string, number>>> {
  const normalizedEmails = [...new Set(emails.map((email) => normalizeEntitlementEmail(email)).filter(Boolean))];
  const normalizedProductIds = [...new Set(productIds.map((productId) => String(productId || "").trim()).filter(Boolean))];
  const out = new Map<string, Map<string, number>>();
  if (normalizedEmails.length === 0 || normalizedProductIds.length === 0) return out;

  const res = await db.query<{ email: string; product_id: string; total: string }>(
    `
      select normalized_buyer_email as email, product_id, count(*)::text as total
      from public.product_entitlements
      where status = 'active'
        and normalized_buyer_email = any($1::text[])
        and product_id = any($2::uuid[])
      group by 1, 2
    `,
    [normalizedEmails, normalizedProductIds]
  );

  for (const email of normalizedEmails) out.set(email, new Map<string, number>());
  for (const row of res.rows) {
    const email = normalizeEntitlementEmail(row.email);
    const productId = String(row.product_id || "").trim();
    const current = out.get(email) || new Map<string, number>();
    current.set(productId, Number.parseInt(String(row.total || "0"), 10) || 0);
    out.set(email, current);
  }

  return out;
}

export async function hasActiveEntitlementByEmail(db: Db, email: string, productId: string): Promise<boolean> {
  const normalizedEmail = normalizeEntitlementEmail(email);
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedEmail || !normalizedProductId) return false;
  const res = await db.query<{ id: string }>(
    `
      select id
      from public.product_entitlements
      where status = 'active'
        and normalized_buyer_email = $1
        and product_id = $2
      limit 1
    `,
    [normalizedEmail, normalizedProductId]
  );
  return Boolean(res.rows[0]);
}

export async function ensureManualProductEntitlement(
  db: Db,
  args: {
    productId: string;
    buyerEmail: string;
    buyerName?: string | null;
    transactionId?: string | null;
  }
): Promise<{ created: boolean; orderId: string | null }> {
  const normalizedEmail = normalizeEntitlementEmail(args.buyerEmail);
  const normalizedProductId = String(args.productId || "").trim();
  if (!normalizedEmail || !normalizedProductId) return { created: false, orderId: null };

  const alreadyGranted = await hasActiveEntitlementByEmail(db, normalizedEmail, normalizedProductId);
  if (alreadyGranted) return { created: false, orderId: null };

  const product = await findProductSeedById(db, normalizedProductId);
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  const userId = await findUserIdByEmail(db, normalizedEmail);
  const buyerName = String(args.buyerName || normalizedEmail.split("@")[0] || "").trim();
  const productName = String(product.name || "DingitalPay Platform").trim() || "DingitalPay Platform";
  const amount = Number(product.price || 0);
  const transactionId =
    String(args.transactionId || "").trim() || `manual-entitlement:${normalizedProductId}:${normalizedEmail}:${Date.now()}`;

  const orderRes = await db.query<{ id: string }>(
    `
      insert into public.orders (
        seller_id,
        product_id,
        buyer_email,
        buyer_name,
        product_name,
        amount,
        gross_amount,
        platform_fee,
        method,
        status,
        transaction_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, 0, 'pix', 'approved', $8)
      returning id
    `,
    [product.seller_id, normalizedProductId, normalizedEmail, buyerName, productName, amount, amount, transactionId]
  );

  const orderId = orderRes.rows[0]?.id || null;
  if (!orderId) {
    throw new Error("MANUAL_ORDER_INSERT_FAILED");
  }

  await db.query(
    `
      insert into public.product_entitlements (
        order_id,
        product_id,
        seller_id,
        buyer_email,
        normalized_buyer_email,
        user_id,
        status,
        granted_at,
        revoked_at,
        revoked_reason
      )
      values ($1, $2, $3, $4, $5, $6, 'active', now(), null, '')
      on conflict (order_id, product_id)
      do update set
        seller_id = excluded.seller_id,
        buyer_email = excluded.buyer_email,
        normalized_buyer_email = excluded.normalized_buyer_email,
        user_id = coalesce(public.product_entitlements.user_id, excluded.user_id),
        status = 'active',
        revoked_at = null,
        revoked_reason = '',
        updated_at = now()
    `,
    [orderId, normalizedProductId, product.seller_id, normalizedEmail, normalizedEmail, userId]
  );

  return { created: true, orderId };
}
