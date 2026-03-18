ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_token_hash text,
  ADD COLUMN IF NOT EXISTS payment_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_payment_token_expires_at
  ON public.orders(payment_token_expires_at);
