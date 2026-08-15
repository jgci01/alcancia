-- Funciones de seguridad para evitar recursión infinita en las políticas RLS
create or replace function public.is_alcanzia_member(p_alcanzia_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.alcanzia_members
    where alcanzia_id = p_alcanzia_id and user_id = auth.uid()
  );
end;
$$;

create or replace function public.is_alcanzia_admin(p_alcanzia_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.alcanzia_members
    where alcanzia_id = p_alcanzia_id and user_id = auth.uid() and role = 'admin'
  );
end;
$$;

-- Corregir políticas de ALCANZIAS
drop policy if exists "Members can view their alcanzias" on public.alcanzias;
create policy "Members can view their alcanzias" on public.alcanzias
  for select using (public.is_alcanzia_member(id));

drop policy if exists "Admins can update their alcanzias" on public.alcanzias;
create policy "Admins can update their alcanzias" on public.alcanzias
  for update using (public.is_alcanzia_admin(id));

-- Corregir políticas de ALCANZIA_MEMBERS
drop policy if exists "Members can view other members of same alcanzia" on public.alcanzia_members;
create policy "Members can view other members of same alcanzia" on public.alcanzia_members
  for select using (public.is_alcanzia_member(alcanzia_id));

drop policy if exists "Admins can manage members" on public.alcanzia_members;
create policy "Admins can manage members" on public.alcanzia_members
  for all using (public.is_alcanzia_admin(alcanzia_id));

-- Corregir políticas de CONTRIBUTIONS
drop policy if exists "Members can view contributions of their alcanzias" on public.contributions;
create policy "Members can view contributions of their alcanzias" on public.contributions
  for select using (public.is_alcanzia_member(alcanzia_id));

-- Corregir políticas de WITHDRAWALS
drop policy if exists "Members can view withdrawals of their alcanzias" on public.withdrawals;
create policy "Members can view withdrawals of their alcanzias" on public.withdrawals
  for select using (public.is_alcanzia_member(alcanzia_id));

drop policy if exists "Admins can update withdrawals (approve/reject)" on public.withdrawals;
create policy "Admins can update withdrawals (approve/reject)" on public.withdrawals
  for update using (public.is_alcanzia_admin(alcanzia_id));

-- Corregir políticas de LOGS (si existen)
drop policy if exists "Members can view logs of their alcanzias" on public.alcanzia_logs;
create policy "Members can view logs of their alcanzias" on public.alcanzia_logs
  for select using (public.is_alcanzia_member(alcanzia_id));
