ALTER TABLE public.product_checkout_config
  ADD COLUMN IF NOT EXISTS order_bump_items jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.product_checkout_config
SET order_bump_items = jsonb_build_array(
  jsonb_build_object(
    'product_id', order_bump_product_id,
    'discount_enabled', coalesce(order_bump_discount, 0) > 0,
    'discount_percentage', coalesce(order_bump_discount, 30)
  )
)
WHERE order_bump_product_id IS NOT NULL
  AND (
    order_bump_items IS NULL
    OR order_bump_items = '[]'::jsonb
  );
