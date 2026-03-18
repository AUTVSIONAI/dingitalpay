-- Enterprise acquirer management helpers:
-- - Cache connection test results (avoid spamming provider APIs)
-- - Audit mapping changes (method -> acquirer)

CREATE TABLE IF NOT EXISTS public.acquirer_health (
  acquirer_name text PRIMARY KEY,
  ok boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT '',
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TRIGGER update_acquirer_health_updated_at
BEFORE UPDATE ON public.acquirer_health
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.payment_method_acquirer_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id uuid,
  method text NOT NULL,
  old_acquirer_name text,
  new_acquirer_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_method_acquirer_audit_method_created_at_idx
  ON public.payment_method_acquirer_audit(method, created_at DESC);
