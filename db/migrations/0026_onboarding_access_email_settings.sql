CREATE TABLE IF NOT EXISTS public.onboarding_access_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  onboarding_url text NOT NULL DEFAULT 'https://app.dingitalpay.com/entrar',
  subject text NOT NULL DEFAULT 'Seu acesso ao onboarding da DingitalPay esta pronto',
  body_html text NOT NULL DEFAULT '<p>Ola {{customer_name}},</p><p>Sua compra foi aprovada e o seu acesso ao onboarding da DingitalPay ja esta liberado.</p><p><strong>Pagina do onboarding:</strong> <a href="{{onboarding_url}}">{{onboarding_url}}</a><br /><strong>Login:</strong> {{login_email}}<br /><strong>Senha:</strong> {{onboarding_password}}</p><p>Guarde estes dados em local seguro. Se precisar de ajuda, responda este e-mail ou fale com {{support_email}}.</p>',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'onboarding_access_email_settings'
      AND indexname = 'onboarding_access_email_settings_product_uidx'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX onboarding_access_email_settings_product_uidx
        ON public.onboarding_access_email_settings (product_id);
    EXCEPTION
      WHEN insufficient_privilege THEN
        NULL;
    END;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'onboarding_access_email_settings'
      AND t.tgname = 'update_onboarding_access_email_settings_updated_at'
      AND NOT t.tgisinternal
  ) THEN
    BEGIN
      CREATE TRIGGER update_onboarding_access_email_settings_updated_at
        BEFORE UPDATE ON public.onboarding_access_email_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION
      WHEN insufficient_privilege THEN
        NULL;
    END;
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.onboarding_access_email_settings (product_id)
    SELECT p.id
    FROM public.products p
    WHERE p.id = 'a5a0c1fa-7d47-403b-a262-47f07a93d3ec'
    ON CONFLICT (product_id) DO NOTHING;
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onboarding_access_email_settings TO dingitalpay_app;
  EXCEPTION
    WHEN insufficient_privilege OR undefined_object THEN
      NULL;
  END;
END
$$;
