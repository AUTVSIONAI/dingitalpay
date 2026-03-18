-- Normalize buyer_email to lowercase to avoid case-sensitive mismatches in buyer dashboards.

CREATE OR REPLACE FUNCTION public.orders_lowercase_buyer_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.buyer_email IS NOT NULL THEN
    NEW.buyer_email := lower(trim(NEW.buyer_email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_lowercase_buyer_email ON public.orders;
CREATE TRIGGER orders_lowercase_buyer_email
BEFORE INSERT OR UPDATE OF buyer_email ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_lowercase_buyer_email();

UPDATE public.orders
SET buyer_email = lower(trim(buyer_email))
WHERE buyer_email IS NOT NULL
  AND buyer_email <> lower(trim(buyer_email));

