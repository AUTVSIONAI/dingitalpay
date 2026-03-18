-- Generated init schema for self-host Postgres (no Supabase).
-- Source: legacy schema (sanitized)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Users (replaces auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  disabled BOOLEAN NOT NULL DEFAULT false,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Enum de roles
CREATE TYPE public.app_role AS ENUM ('admin', 'seller', 'buyer');

-- Tabela de profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  cpf TEXT DEFAULT '',
  birth_date DATE,
  bio TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  country TEXT DEFAULT 'Brasil',
  company TEXT DEFAULT '',
  website TEXT DEFAULT '',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  avatar_url TEXT,
  email_notifications BOOLEAN DEFAULT false,
  sms_notifications BOOLEAN DEFAULT false,
  marketing_emails BOOLEAN DEFAULT true,
  two_factor_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de roles (separada por segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- RLS em profiles

-- Função SECURITY DEFINER para checar role sem recursão
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Função para pegar role do user
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS Policies para profiles

-- RLS Policies para user_roles

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para auto-criar profile e role ao registrar

-- Hotfix: normalize nullable auth token fields that break GoTrue user scan
-- Based on Supabase troubleshooting for "Scan error on column confirmation_token"

-- ==========================================
-- ETAPA 1: PRODUTOS — Schema completo
-- ==========================================

-- Enum para tipo de produto
CREATE TYPE public.product_type AS ENUM ('ebook', 'course', 'physical');

-- Enum para status de produto
CREATE TYPE public.product_status AS ENUM ('active', 'inactive', 'draft');

-- ==========================================
-- 1. PRODUCTS (tabela principal)
-- ==========================================
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  name TEXT NOT NULL,
  short_description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  type product_type NOT NULL DEFAULT 'ebook',
  status product_status NOT NULL DEFAULT 'draft',
  image_url TEXT DEFAULT '',
  sales INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS

-- Trigger updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 2. PRODUCT_OFFERS (ofertas/links de pagamento)
-- ==========================================
CREATE TABLE public.product_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  slug TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 3. PRODUCT_PIXELS (rastreamento)
-- ==========================================
CREATE TABLE public.product_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  pixel_id TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 4. PRODUCT_DOMAINS (domínios personalizados)
-- ==========================================
CREATE TABLE public.product_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 5. PRODUCT_CHECKOUT_CONFIG (config do checkout)
-- ==========================================
CREATE TABLE public.product_checkout_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  payment_methods JSONB NOT NULL DEFAULT '{"pix": true, "credit_card": true, "boleto": true}'::jsonb,
  required_fields JSONB NOT NULL DEFAULT '{"name": true, "email": true, "cpf": true, "phone": false}'::jsonb,
  countdown_enabled BOOLEAN NOT NULL DEFAULT false,
  countdown_minutes INTEGER NOT NULL DEFAULT 15,
  banner_url TEXT DEFAULT '',
  colors JSONB NOT NULL DEFAULT '{"primary": "#8B5CF6", "background": "#ffffff", "text": "#1a1a2e"}'::jsonb,
  buy_button_text TEXT NOT NULL DEFAULT 'Finalizar compra',
  order_bump_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  social_proof_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_support TEXT DEFAULT '',
  thank_you_config JSONB NOT NULL DEFAULT '{"title": "Compra realizada com sucesso!", "message": "Você receberá os detalhes por e-mail.", "redirect_url": ""}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_product_checkout_config_updated_at
  BEFORE UPDATE ON public.product_checkout_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- Storage bucket para imagens de produto
-- ==========================================
-- Notify PostgREST
-- Fix: All RLS policies were created as RESTRICTIVE (AND logic) instead of PERMISSIVE (OR logic).
-- This causes queries to fail when multiple policies exist because ALL restrictive policies must pass.
-- We need to drop all restrictive policies and recreate them as PERMISSIVE.

-- ======================== PRODUCTS ========================

-- ======================== PRODUCT_OFFERS ========================

-- ======================== PRODUCT_PIXELS ========================

-- ======================== PRODUCT_DOMAINS ========================

-- ======================== PRODUCT_CHECKOUT_CONFIG ========================

-- Enum for order status
CREATE TYPE public.order_status AS ENUM ('pending', 'approved', 'refunded', 'chargeback', 'abandoned');

-- Enum for payment method
CREATE TYPE public.payment_method AS ENUM ('pix', 'boleto', 'credit_card');

-- Orders table
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  buyer_email text NOT NULL,
  buyer_name text NOT NULL DEFAULT '',
  buyer_phone text DEFAULT '',
  buyer_cpf text DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  method public.payment_method NOT NULL DEFAULT 'pix',
  status public.order_status NOT NULL DEFAULT 'pending',
  transaction_id text DEFAULT '',
  utm jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS

-- RLS: Sellers can view their own orders

-- RLS: Sellers can insert orders (for manual creation / test)

-- RLS: Sellers can update their own orders

-- RLS: Buyers can view their own purchases by email (via function)

-- RLS: Admins can manage all orders

-- Order items table (for order bumps, future multi-product orders)
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  is_order_bump boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: Access same as parent order

-- Trigger for updated_at on orders
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enum for withdrawal status
CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'in_review', 'approved', 'rejected');

-- Enum for withdrawal method
CREATE TYPE public.withdrawal_method AS ENUM ('PIX', 'TED');

-- Withdrawals table
CREATE TABLE public.withdrawals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  method public.withdrawal_method NOT NULL DEFAULT 'PIX',
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  bank_info jsonb NOT NULL DEFAULT '{}',
  rejection_reason text DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies

-- Withdrawal status history table
CREATE TABLE public.withdrawal_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  withdrawal_id uuid NOT NULL REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  status public.withdrawal_status NOT NULL,
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: Access via parent withdrawal

-- Trigger for updated_at
CREATE TRIGGER update_withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Courses table
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  image_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Course modules
CREATE TABLE public.course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Course lessons
CREATE TABLE public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid REFERENCES public.course_modules(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  duration text DEFAULT '00:00',
  video_url text DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Buyer progress tracking
CREATE TABLE public.course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid REFERENCES public.course_lessons(id) ON DELETE CASCADE NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

-- RLS

-- Courses: sellers manage via product ownership, buyers read if they purchased

-- Modules: inherit from course access

-- Lessons: inherit from module access

-- Progress: users manage their own

-- Triggers
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Webhook Endpoints
CREATE TABLE public.webhook_endpoints (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL DEFAULT 'whsec_' || substr(md5(random()::text), 1, 12),
  active boolean NOT NULL DEFAULT true,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz,
  success_rate integer NOT NULL DEFAULT 100
);

-- Webhook Logs
CREATE TABLE public.webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  status_code integer NOT NULL DEFAULT 200,
  response_time integer NOT NULL DEFAULT 0,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT true
);

-- WhatsApp Instances
CREATE TABLE public.whatsapp_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'qr_pending',
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz,
  messages_sent_24h integer NOT NULL DEFAULT 0,
  delivery_rate integer NOT NULL DEFAULT 100,
  last_message_at timestamptz
);

-- Zapier Integrations
CREATE TABLE public.zapier_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL,
  name text NOT NULL,
  webhook_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz
);

-- Zapier Logs
CREATE TABLE public.zapier_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.zapier_integrations(id) ON DELETE CASCADE,
  event text NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT true
);

-- ═══════════════════════════════════════════════════════
-- ETAPA 6: Admin Avançado — Tabelas de Configuração
-- ═══════════════════════════════════════════════════════

-- 1. Platform Settings (singleton config table)
CREATE TABLE public.platform_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_name text NOT NULL DEFAULT 'Plataforma Digital',
  platform_url text NOT NULL DEFAULT '',
  support_email text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  maintenance_mode boolean NOT NULL DEFAULT false,
  registration_open boolean NOT NULL DEFAULT true,
  email_verification boolean NOT NULL DEFAULT false,
  two_factor boolean NOT NULL DEFAULT false,
  language text NOT NULL DEFAULT 'pt-BR',
  terms_of_use text NOT NULL DEFAULT '',
  privacy_policy text NOT NULL DEFAULT '',
  require_terms_acceptance boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default settings row
INSERT INTO public.platform_settings (platform_name, platform_url, support_email, description)
VALUES ('Plataforma Digital', 'https://plataforma.com.br', 'suporte@plataforma.com.br', 'Plataforma completa para venda de produtos digitais.');

-- 2. Rewards (gamification)
CREATE TABLE public.rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '/placeholder.svg',
  min_revenue numeric NOT NULL DEFAULT 0,
  max_revenue numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'congratulation' CHECK (type IN ('congratulation', 'delivery')),
  delivery_instructions text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Reward Claims
CREATE TABLE public.reward_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  revenue_achieved numeric NOT NULL DEFAULT 0,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Platform Updates (changelog)
CREATE TABLE public.platform_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'feature' CHECK (type IN ('feature', 'fix', 'improvement', 'maintenance')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Triggers for updated_at
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rewards_updated_at
  BEFORE UPDATE ON public.rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow anonymous/public order creation for checkout
-- The checkout page creates orders on behalf of buyers (who may not be authenticated)

-- Allow public to read product_checkout_config for active products (already exists but let's make sure)
-- Already covered by "Public can read active product checkout config"

-- Allow public to insert order_items for their orders

-- SMTP Configuration (singleton, like platform_settings)
CREATE TABLE public.smtp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL DEFAULT '',
  port text NOT NULL DEFAULT '587',
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  encryption text NOT NULL DEFAULT 'tls',
  from_name text NOT NULL DEFAULT '',
  from_email text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  emails_sent_today integer NOT NULL DEFAULT 0,
  delivery_rate text NOT NULL DEFAULT '-',
  bounces text NOT NULL DEFAULT '0',
  last_test text NOT NULL DEFAULT '-',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO public.smtp_config (host) VALUES ('');

-- DNS Records for SMTP
CREATE TABLE public.smtp_dns_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  value text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Email Templates
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'auth',
  event_key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  sent_count integer NOT NULL DEFAULT 0,
  open_rate text NOT NULL DEFAULT '-',
  click_rate text NOT NULL DEFAULT '-',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default templates
INSERT INTO public.email_templates (category, event_key, title, description, subject, body, enabled) VALUES
  ('auth', 'account_created', 'Conta criada', 'Enviado quando o usuário se cadastra na plataforma.', 'Bem-vindo à {{platform_name}}!', '<p>Olá {{user_name}},</p><p>Sua conta foi criada com sucesso.</p>', false),
  ('auth', 'password_reset', 'Recuperação de senha', 'Enviado quando o usuário solicita redefinição de senha.', 'Redefinição de senha', '<p>Olá {{user_name}},</p><p>Clique no link para redefinir sua senha: {{reset_link}}</p>', false),
  ('auth', 'email_verification', 'Verificação de e-mail', 'Enviado para confirmar o endereço de e-mail.', 'Confirme seu e-mail', '<p>Olá {{user_name}},</p><p>Confirme seu e-mail clicando aqui: {{verify_link}}</p>', false),
  ('purchases', 'purchase_approved', 'Compra aprovada', 'Enviado quando o pagamento é confirmado.', 'Compra confirmada! ✅', '<p>Olá {{user_name}},</p><p>Seu pagamento de {{amount}} para "{{product_name}}" foi aprovado.</p>', false),
  ('purchases', 'purchase_refunded', 'Compra reembolsada', 'Enviado quando um reembolso é processado.', 'Reembolso processado', '<p>Olá {{user_name}},</p><p>Seu reembolso de {{amount}} para "{{product_name}}" foi processado.</p>', false),
  ('purchases', 'purchase_pending', 'Pagamento pendente', 'Enviado quando o pagamento está aguardando confirmação.', 'Pagamento pendente ⏳', '<p>Olá {{user_name}},</p><p>Seu pagamento para "{{product_name}}" está aguardando confirmação.</p>', false),
  ('courses', 'course_access_granted', 'Acesso ao curso liberado', 'Enviado quando o acesso a um curso é liberado.', 'Seu curso está disponível! 🎓', '<p>Olá {{user_name}},</p><p>Seu acesso ao curso "{{course_name}}" foi liberado.</p>', false),
  ('courses', 'course_completed', 'Curso concluído', 'Enviado quando o aluno completa todas as aulas.', 'Parabéns! Você concluiu o curso 🏆', '<p>Olá {{user_name}},</p><p>Você concluiu o curso "{{course_name}}"!</p>', false),
  ('profile', 'profile_updated', 'Perfil atualizado', 'Enviado quando o perfil é alterado.', 'Perfil atualizado', '<p>Olá {{user_name}},</p><p>Seu perfil foi atualizado com sucesso.</p>', false),
  ('seller', 'new_sale', 'Nova venda', 'Enviado ao vendedor quando uma venda é confirmada.', 'Você fez uma venda! 🎉', '<p>Olá {{seller_name}},</p><p>Você vendeu "{{product_name}}" por {{amount}}.</p>', false),
  ('seller', 'withdrawal_approved', 'Saque aprovado', 'Enviado quando um saque é aprovado.', 'Saque aprovado ✅', '<p>Olá {{seller_name}},</p><p>Seu saque de {{amount}} foi aprovado e será processado.</p>', false),
  ('seller', 'withdrawal_rejected', 'Saque rejeitado', 'Enviado quando um saque é rejeitado.', 'Saque rejeitado ❌', '<p>Olá {{seller_name}},</p><p>Seu saque foi rejeitado. Motivo: {{reason}}</p>', false),
  ('gamification', 'reward_unlocked', 'Conquista desbloqueada', 'Enviado quando o vendedor atinge uma meta de faturamento.', 'Nova conquista desbloqueada! 🏅', '<p>Olá {{seller_name}},</p><p>Você desbloqueou a conquista "{{reward_name}}"!</p>', false),
  ('gamification', 'reward_sent', 'Premiação enviada', 'Enviado quando a premiação física é enviada.', 'Sua premiação está a caminho! 📦', '<p>Olá {{seller_name}},</p><p>Sua premiação "{{reward_name}}" foi enviada.</p>', false);

-- Triggers
CREATE TRIGGER update_smtp_config_updated_at BEFORE UPDATE ON public.smtp_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Admin full access on course_progress (missing entirely)

-- Admin full access on profiles (currently only SELECT)

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS default_subject text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_body text NOT NULL DEFAULT '';

-- Initialize defaults with current values
UPDATE public.email_templates
SET default_subject = subject, default_body = body
WHERE default_subject = '' OR default_body = '';
UPDATE public.email_templates
SET 
  body = '<p>Olá {{user_name}},</p><p>Seu pagamento de {{amount}} para "{{product_name}}" foi aprovado com sucesso! Você já pode acessar seu produto.</p>',
  default_body = '<p>Olá {{user_name}},</p><p>Seu pagamento de {{amount}} para "{{product_name}}" foi aprovado com sucesso! Você já pode acessar seu produto.</p>',
  default_subject = 'Compra confirmada! ✅'
WHERE event_key = 'purchase_approved';

-- Add new columns to platform_settings
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS favicon_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS palette text NOT NULL DEFAULT 'violet',
  ADD COLUMN IF NOT EXISTS neon_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS glow_mode boolean NOT NULL DEFAULT false;

-- Create storage bucket for platform assets
-- Allow admins to upload

-- Allow admins to update

-- Allow admins to delete

-- Public read access

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS dark_logo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS white_logo_url text NOT NULL DEFAULT '';

-- Create coupons table for product discount codes
CREATE TABLE public.product_coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percent' CHECK (type IN ('percent', 'fixed')),
  value NUMERIC NOT NULL DEFAULT 0,
  usage_limit INTEGER NOT NULL DEFAULT 100,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS

-- RLS policies

-- Index for fast lookups
CREATE INDEX idx_product_coupons_product_id ON public.product_coupons(product_id);
CREATE UNIQUE INDEX idx_product_coupons_code ON public.product_coupons(product_id, code);

-- Create email campaigns table for marketing campaigns
CREATE TABLE public.email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'canceled')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS

-- Only admins can manage campaigns

-- Trigger for updated_at
CREATE TRIGGER update_email_campaigns_updated_at
BEFORE UPDATE ON public.email_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============= Phase 3: Add missing columns to products =============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS long_description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS warranty_days INTEGER DEFAULT 7,
  ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'instant';

-- ============= Phase 2: product_upsell_config =============
CREATE TABLE public.product_upsell_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  upsell_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Espera! Temos uma oferta exclusiva pra você 🚀',
  description TEXT NOT NULL DEFAULT 'Aproveite essa condição especial disponível apenas agora.',
  image_url TEXT DEFAULT '',
  cta_text TEXT NOT NULL DEFAULT 'Sim, eu quero!',
  decline_text TEXT NOT NULL DEFAULT 'Não, obrigado',
  special_price NUMERIC DEFAULT 0,
  downsell_enabled BOOLEAN NOT NULL DEFAULT false,
  downsell_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  downsell_title TEXT DEFAULT 'Última chance! Que tal essa oferta?',
  downsell_cta_text TEXT DEFAULT 'Quero aproveitar!',
  downsell_special_price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

CREATE TRIGGER update_product_upsell_config_updated_at
  BEFORE UPDATE ON public.product_upsell_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= Phase 2: product_delivery_config =============
CREATE TABLE public.product_delivery_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delivery_method TEXT DEFAULT 'email',
  email_subject TEXT DEFAULT 'Seu produto está pronto! 📚',
  email_body TEXT DEFAULT 'Olá {nome}! Seu produto já está disponível para download.',
  download_url TEXT DEFAULT '',
  file_url TEXT DEFAULT '',
  auto_send BOOLEAN NOT NULL DEFAULT true,
  shipping_method TEXT DEFAULT 'correios',
  processing_days INTEGER DEFAULT 3,
  tracking_enabled BOOLEAN NOT NULL DEFAULT true,
  weight TEXT DEFAULT '',
  dimensions TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

CREATE TRIGGER update_product_delivery_config_updated_at
  BEFORE UPDATE ON public.product_delivery_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add missing columns to product_checkout_config for full checkout persistence
ALTER TABLE public.product_checkout_config
  ADD COLUMN IF NOT EXISTS countdown_phrase text NOT NULL DEFAULT 'Oferta por tempo limitado!',
  ADD COLUMN IF NOT EXISTS countdown_expired_phrase text NOT NULL DEFAULT 'Oferta encerrada.',
  ADD COLUMN IF NOT EXISTS notification_interval integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS notification_names jsonb NOT NULL DEFAULT '["Cláudio","Maria","Julia","Pedro","Ana"]'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_message text NOT NULL DEFAULT 'Olá! Preciso de ajuda com minha compra.',
  ADD COLUMN IF NOT EXISTS reviews_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS thank_you_redirect_delay integer NOT NULL DEFAULT 5;
-- Allow public read of active product offers (needed for slug resolution on checkout)

CREATE TABLE public.acquirer_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acquirer_name text NOT NULL UNIQUE,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TRIGGER update_acquirer_configs_updated_at
BEFORE UPDATE ON public.acquirer_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.payment_method_acquirers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  method text NOT NULL UNIQUE,
  acquirer_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TRIGGER update_payment_method_acquirers_updated_at
BEFORE UPDATE ON public.payment_method_acquirers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create bucket for product delivery files (ebooks, zips, etc.)
-- Allow sellers to upload files to their product folder

-- Allow sellers to update their product files

-- Allow public read access to product files

-- Allow sellers to delete their product files

-- Fix: Sellers INSERT policy for courses needs WITH CHECK

-- Fix: Replace public.users query with auth.email() in courses buyer policy

-- Fix orders: replace public.users with auth.email()

-- Fix order_items: replace public.users with auth.email()

-- Add preview_token to courses for magic link preview
ALTER TABLE public.courses ADD COLUMN preview_token TEXT UNIQUE;

-- Generate tokens for existing courses
UPDATE public.courses SET preview_token = encode(gen_random_bytes(16), 'hex') WHERE preview_token IS NULL;

-- Auto-generate token on insert via trigger
CREATE OR REPLACE FUNCTION public.generate_course_preview_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.preview_token IS NULL THEN
    NEW.preview_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_course_preview_token
BEFORE INSERT ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.generate_course_preview_token();

-- Allow public read access to courses via preview_token (no auth required)

-- Allow public read of modules/lessons for preview (via course access)

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;CREATE OR REPLACE FUNCTION public.generate_course_preview_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.preview_token IS NULL THEN
    NEW.preview_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$function$;ALTER TABLE public.products ALTER COLUMN status SET DEFAULT 'active'::product_status;-- Allow public read of verified product domains for custom domain resolution

-- Add access_token column for Facebook Conversions API (and future server-side pixel APIs)
ALTER TABLE public.product_pixels ADD COLUMN access_token text NOT NULL DEFAULT '';

-- Add RLS policy for public read of active pixels (needed by checkout pages)

-- Create avatars bucket
-- Anyone can view avatars (public bucket)

-- Users can upload their own avatar (folder = user_id)

-- Users can update their own avatar

-- Users can delete their own avatar

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS

-- Users can view their own notifications

-- Users can update their own notifications (mark as read)

-- Users can delete their own notifications

-- System/admins can insert notifications for any user

-- Allow service role / triggers to insert

-- Create trigger to auto-create notification on new order
CREATE OR REPLACE FUNCTION public.notify_on_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, text, reference_id)
  VALUES (
    NEW.seller_id,
    'Nova venda de ' || COALESCE(NEW.product_name, 'produto') || ' - R$ ' || to_char(NEW.amount, 'FM999G999D00'),
    NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_order_notify
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_order();

-- Add notifications cleanup to the cascade delete function

INSERT INTO public.notifications (user_id, text, read, created_at) VALUES
('d77de21b-8f39-49c9-8f9a-8a1c9b6dacf5', 'Nova venda de Curso de Marketing Digital - R$ 297,00', false, now() - interval '2 minutes'),
('d77de21b-8f39-49c9-8f9a-8a1c9b6dacf5', 'Nova venda de E-book Python Avançado - R$ 89,90', false, now() - interval '18 minutes'),
('d77de21b-8f39-49c9-8f9a-8a1c9b6dacf5', 'Nova venda de Curso de Marketing Digital - R$ 297,00', false, now() - interval '3 hours'),
('d77de21b-8f39-49c9-8f9a-8a1c9b6dacf5', 'Saque de R$ 500,00 aprovado com sucesso!', true, now() - interval '1 day'),
('d77de21b-8f39-49c9-8f9a-8a1c9b6dacf5', 'Nova venda de E-book Python Avançado - R$ 89,90', true, now() - interval '2 days');

-- Adicionar configurações de saque na tabela platform_settings
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS min_withdrawal numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_withdrawal numeric NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS withdrawal_fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawal_processing_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS withdrawal_pix_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS withdrawal_ted_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS withdrawal_fee_type text NOT NULL DEFAULT 'percent';

-- Table to configure platform transaction fees per payment method
CREATE TABLE public.platform_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  method text NOT NULL UNIQUE,
  fee_type text NOT NULL DEFAULT 'percent',
  fee_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Seed default fee configs
INSERT INTO public.platform_fees (method, fee_type, fee_value) VALUES
  ('pix', 'percent', 0.99),
  ('credit_card', 'percent', 4.99),
  ('boleto', 'fixed', 2.90);

-- Trigger for updated_at
CREATE TRIGGER update_platform_fees_updated_at
  BEFORE UPDATE ON public.platform_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Table to log each fee charged by the platform
CREATE TABLE public.platform_fee_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  withdrawal_id uuid REFERENCES public.withdrawals(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'transaction',
  method text NOT NULL DEFAULT '',
  gross_amount numeric NOT NULL DEFAULT 0,
  fee_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX idx_platform_fee_logs_created_at ON public.platform_fee_logs(created_at DESC);
CREATE INDEX idx_platform_fee_logs_seller_id ON public.platform_fee_logs(seller_id);
CREATE INDEX idx_platform_fee_logs_type ON public.platform_fee_logs(type);

-- 1. Alterar platform_fees: adicionar fee_percent e fee_fixed, migrar dados, remover fee_type/fee_value
ALTER TABLE public.platform_fees ADD COLUMN IF NOT EXISTS fee_percent numeric NOT NULL DEFAULT 0;
ALTER TABLE public.platform_fees ADD COLUMN IF NOT EXISTS fee_fixed numeric NOT NULL DEFAULT 0;

-- Migrar dados existentes
UPDATE public.platform_fees SET fee_percent = fee_value WHERE fee_type = 'percent';
UPDATE public.platform_fees SET fee_fixed = fee_value WHERE fee_type = 'fixed';

-- Remover colunas antigas
ALTER TABLE public.platform_fees DROP COLUMN IF EXISTS fee_type;
ALTER TABLE public.platform_fees DROP COLUMN IF EXISTS fee_value;

-- 2. Alterar orders: adicionar gross_amount e platform_fee
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gross_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0;

-- Preencher gross_amount para pedidos existentes (que não tinham split)
UPDATE public.orders SET gross_amount = amount WHERE gross_amount = 0 AND amount > 0;

-- Add fee tracking columns to withdrawals table
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric NOT NULL DEFAULT 0;
