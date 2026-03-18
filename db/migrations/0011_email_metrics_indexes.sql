-- Improve performance for email metrics aggregations (admin dashboards).

-- Metrics by template_event_key (templated emails)
CREATE INDEX IF NOT EXISTS email_outbox_template_status_created_idx
  ON public.email_outbox (template_event_key, status, created_at)
  WHERE template_event_key IS NOT NULL AND template_event_key <> '';

-- Metrics by campaign_id (campaign sends)
CREATE INDEX IF NOT EXISTS email_outbox_campaign_status_created_idx
  ON public.email_outbox (campaign_id, status, created_at)
  WHERE campaign_id IS NOT NULL;

