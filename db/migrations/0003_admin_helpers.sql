-- Admin helpers (authorization must be enforced by the API, not the database)

CREATE OR REPLACE FUNCTION public.admin_delete_user_cascade(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Notifications
  DELETE FROM notifications WHERE user_id = _user_id;

  -- Integrations
  DELETE FROM zapier_logs WHERE integration_id IN (SELECT id FROM zapier_integrations WHERE seller_id = _user_id);
  DELETE FROM zapier_integrations WHERE seller_id = _user_id;

  DELETE FROM webhook_logs WHERE endpoint_id IN (SELECT id FROM webhook_endpoints WHERE seller_id = _user_id);
  DELETE FROM webhook_endpoints WHERE seller_id = _user_id;

  DELETE FROM whatsapp_instances WHERE seller_id = _user_id;

  -- Finance/withdrawals
  DELETE FROM withdrawal_status_history WHERE withdrawal_id IN (SELECT id FROM withdrawals WHERE seller_id = _user_id);
  DELETE FROM withdrawals WHERE seller_id = _user_id;

  -- Rewards
  DELETE FROM reward_claims WHERE seller_id = _user_id;

  -- Courses/progress
  DELETE FROM course_progress WHERE user_id = _user_id;

  -- Orders
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE seller_id = _user_id);
  DELETE FROM orders WHERE seller_id = _user_id;

  -- Products and related
  DELETE FROM product_pixels WHERE product_id IN (SELECT id FROM products WHERE seller_id = _user_id);
  DELETE FROM product_domains WHERE product_id IN (SELECT id FROM products WHERE seller_id = _user_id);
  DELETE FROM product_offers WHERE product_id IN (SELECT id FROM products WHERE seller_id = _user_id);
  DELETE FROM product_coupons WHERE product_id IN (SELECT id FROM products WHERE seller_id = _user_id);
  DELETE FROM product_checkout_config WHERE product_id IN (SELECT id FROM products WHERE seller_id = _user_id);
  DELETE FROM product_upsell_config WHERE product_id IN (SELECT id FROM products WHERE seller_id = _user_id);
  DELETE FROM product_delivery_config WHERE product_id IN (SELECT id FROM products WHERE seller_id = _user_id);

  -- Course data via products
  DELETE FROM course_lessons WHERE module_id IN (
    SELECT cm.id FROM course_modules cm
    JOIN courses c ON c.id = cm.course_id
    JOIN products p ON p.id = c.product_id
    WHERE p.seller_id = _user_id
  );
  DELETE FROM course_modules WHERE course_id IN (
    SELECT c.id FROM courses c
    JOIN products p ON p.id = c.product_id
    WHERE p.seller_id = _user_id
  );
  DELETE FROM courses WHERE product_id IN (SELECT id FROM products WHERE seller_id = _user_id);

  DELETE FROM products WHERE seller_id = _user_id;

  -- Auth tables
  DELETE FROM sessions WHERE user_id = _user_id;
  DELETE FROM password_reset_tokens WHERE user_id = _user_id;
  DELETE FROM email_verification_tokens WHERE user_id = _user_id;

  -- Profile and role
  DELETE FROM profiles WHERE user_id = _user_id;
  DELETE FROM user_roles WHERE user_id = _user_id;

  -- User itself
  DELETE FROM public.users WHERE id = _user_id;
END;
$$;
