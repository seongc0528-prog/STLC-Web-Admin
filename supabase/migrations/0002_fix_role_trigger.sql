-- Fix: prevent_role_escalation() blocked admin bootstrap via SQL Editor /
-- service-role connections, because auth.uid() is NULL there and the
-- original check treated that as "not an admin".

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role <> old.role or new.is_active <> old.is_active then
      raise exception 'Only admins can change role or is_active';
    end if;
  end if;
  return new;
end;
$$;
