CREATE TABLE IF NOT EXISTS public.dingitalpay_whatsapp_chat_histories (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL CHECK (length(trim(session_id)) > 0),
  message jsonb NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  remote_jid text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dingitalpay_whatsapp_chat_histories_session_created_idx
  ON public.dingitalpay_whatsapp_chat_histories (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dingitalpay_whatsapp_chat_histories_remote_jid_idx
  ON public.dingitalpay_whatsapp_chat_histories (remote_jid, created_at DESC);

DROP TRIGGER IF EXISTS update_dingitalpay_whatsapp_chat_histories_updated_at ON public.dingitalpay_whatsapp_chat_histories;
CREATE TRIGGER update_dingitalpay_whatsapp_chat_histories_updated_at
  BEFORE UPDATE ON public.dingitalpay_whatsapp_chat_histories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dingitalpay_whatsapp_chat_histories TO dingitalpay_app;
GRANT USAGE, SELECT ON SEQUENCE public.dingitalpay_whatsapp_chat_histories_id_seq TO dingitalpay_app;
