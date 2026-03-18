-- Backfill missing roles for legacy/test users.
-- Ensures auth context never has role=null (security + correctness).

insert into public.user_roles(user_id, role)
select
  u.id as user_id,
  case lower(coalesce(u.raw_user_meta_data->>'role','buyer'))
    when 'admin' then 'admin'
    when 'seller' then 'seller'
    when 'buyer' then 'buyer'
    else 'buyer'
  end::public.app_role as role
from public.users u
left join public.user_roles r on r.user_id = u.id
where r.user_id is null
on conflict do nothing;
