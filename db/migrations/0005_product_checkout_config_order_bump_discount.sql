-- Align schema with Supabase: product_checkout_config.order_bump_discount
ALTER TABLE public.product_checkout_config
  ADD COLUMN IF NOT EXISTS order_bump_discount integer NOT NULL DEFAULT 30;

