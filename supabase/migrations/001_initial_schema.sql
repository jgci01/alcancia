-- =====================================================
-- ALCANZIA DIGITAL - Migración inicial completa
-- =====================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =====================================================
-- 1. ENUMS
-- =====================================================
create type public.contribution_status as enum (
  'pending',
  'approved',
  'rejected',
  'refunded'
);

create type public.withdrawal_status as enum (
  'pending',
  'approved',
  'rejected',
  'paid',
  'cancelled'
);

create type public.member_role as enum (
  'admin',
  'member'
);

create type public.currency_code as enum (
  'ARS',
  'CLP',
  'USD',
  'BRL',
  'MXN'
);

-- =====================================================
-- 2. TABLAS
-- =====================================================

-- Perfiles (extiende auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Alcanzias (pozos de ahorro)
create table public.alcanzias (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  goal_amount numeric(14,2) not null check (goal_amount > 0),
  currency public.currency_code not null default 'ARS',
  creator_id uuid not null references public.profiles(id) on delete restrict,
  is_active boolean not null default true,
  -- Token único para invitación por URL (ej: /join/abc123...)
  invite_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  -- Usuario designado como responsable de solicitar retiros
  withdrawal_responsible_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Miembros de cada alcanzia
create table public.alcanzia_members (
  id uuid primary key default gen_random_uuid(),
  alcanzia_id uuid not null references public.alcanzias(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (alcanzia_id, user_id)
);

-- Aportes / Contribuciones
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  alcanzia_id uuid not null references public.alcanzias(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14,2) not null check (amount >= 1000), -- mínimo $1000 ARS
  currency public.currency_code not null default 'ARS',
  status public.contribution_status not null default 'pending',
  mp_preference_id text,
  mp_payment_id text,
  external_reference text unique, -- para idempotencia
  payment_date timestamptz,
  mp_fee numeric(14,2) default 0, -- comisión cobrada por MP (la paga el usuario)
  net_amount numeric(14,2), -- amount - mp_fee (lo que realmente entra al pozo)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Retiros (con flujo de aprobación)
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  alcanzia_id uuid not null references public.alcanzias(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency public.currency_code not null default 'ARS',
  description text,
  status public.withdrawal_status not null default 'pending',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Log de auditoría de retiros y cambios de estado
create table public.withdrawal_logs (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.withdrawals(id) on delete cascade,
  previous_status public.withdrawal_status,
  new_status public.withdrawal_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 3. ÍNDICES
-- =====================================================
create index idx_alcanzias_creator on public.alcanzias(creator_id);
create index idx_alcanzias_invite_token on public.alcanzias(invite_token);
create index idx_alcanzia_members_user on public.alcanzia_members(user_id);
create index idx_alcanzia_members_alcanzia on public.alcanzia_members(alcanzia_id);
create index idx_contributions_alcanzia on public.contributions(alcanzia_id);
create index idx_contributions_user on public.contributions(user_id);
create index idx_contributions_status on public.contributions(status);
create index idx_contributions_external_ref on public.contributions(external_reference);
create index idx_withdrawals_alcanzia on public.withdrawals(alcanzia_id);
create index idx_withdrawals_status on public.withdrawals(status);
create index idx_profiles_phone on public.profiles(phone);

-- =====================================================
-- 4. VISTA UNIFICADA DE MOVIMIENTOS
-- =====================================================
create or replace view public.movimientos_alcanzia
with (security_invoker = true)
as
select
  c.id,
  c.alcanzia_id,
  c.user_id,
  c.amount as monto,
  c.net_amount as monto_neto,
  c.currency,
  'aporte' as tipo,
  c.status::text as estado,
  c.payment_date as fecha,
  c.created_at,
  p.full_name as usuario_nombre,
  p.avatar_url as usuario_avatar,
  p.phone as usuario_telefono
from public.contributions c
join public.profiles p on p.id = c.user_id
where c.status = 'approved'

union all

select
  w.id,
  w.alcanzia_id,
  w.requested_by as user_id,
  -w.amount as monto, -- negativo para retiros
  -w.amount as monto_neto,
  w.currency,
  'retiro' as tipo,
  w.status::text as estado,
  coalesce(w.paid_at, w.created_at) as fecha,
  w.created_at,
  p.full_name as usuario_nombre,
  p.avatar_url as usuario_avatar,
  p.phone as usuario_telefono
from public.withdrawals w
join public.profiles p on p.id = w.requested_by
where w.status in ('approved', 'paid');

-- =====================================================
-- 5. FUNCIÓN DE BALANCE
-- =====================================================
create or replace function public.get_alcanzia_balance(p_alcanzia_id uuid)
returns numeric
language sql
stable
security invoker
as $$
  select
    coalesce(
      (select sum(net_amount) from public.contributions
       where alcanzia_id = p_alcanzia_id and status = 'approved'), 0
    )
    -
    coalesce(
      (select sum(amount) from public.withdrawals
       where alcanzia_id = p_alcanzia_id and status in ('approved', 'paid')), 0
    );
$$;

-- =====================================================
-- 6. FUNCIÓN: Unirse por token de invitación
-- =====================================================
create or replace function public.join_alcanzia_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alcanzia_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Debes estar autenticado';
  end if;

  select id into v_alcanzia_id
  from public.alcanzias
  where invite_token = p_token and is_active = true;

  if v_alcanzia_id is null then
    raise exception 'Invitación inválida o alcanzia inactiva';
  end if;

  -- Insertar solo si no es miembro aún
  insert into public.alcanzia_members (alcanzia_id, user_id, role)
  values (v_alcanzia_id, v_user_id, 'member')
  on conflict (alcanzia_id, user_id) do nothing;

  return v_alcanzia_id;
end;
$$;

-- =====================================================
-- 7. TRIGGER: Actualizar updated_at
-- =====================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger trg_alcanzias_updated_at
  before update on public.alcanzias
  for each row execute function public.handle_updated_at();

create trigger trg_contributions_updated_at
  before update on public.contributions
  for each row execute function public.handle_updated_at();

create trigger trg_withdrawals_updated_at
  before update on public.withdrawals
  for each row execute function public.handle_updated_at();

-- =====================================================
-- 8. TRIGGER: Log de cambios de estado en retiros
-- =====================================================
create or replace function public.log_withdrawal_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.status is distinct from new.status then
    insert into public.withdrawal_logs (
      withdrawal_id,
      previous_status,
      new_status,
      changed_by,
      note
    ) values (
      new.id,
      old.status,
      new.status,
      auth.uid(),
      case
        when new.status = 'rejected' then new.rejection_reason
        else null
      end
    );
  end if;
  return new;
end;
$$;

create trigger trg_withdrawal_status_log
  after update of status on public.withdrawals
  for each row execute function public.log_withdrawal_status_change();

-- =====================================================
-- 9. TRIGGER: Al crear alcanzia → agregar creator como admin
-- =====================================================
create or replace function public.handle_new_alcanzia()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.alcanzia_members (alcanzia_id, user_id, role)
  values (new.id, new.creator_id, 'admin');

  -- Por defecto el creator es también el responsable de retiros
  if new.withdrawal_responsible_id is null then
    update public.alcanzias
    set withdrawal_responsible_id = new.creator_id
    where id = new.id;
  end if;

  return new;
end;
$$;

create trigger trg_new_alcanzia
  after insert on public.alcanzias
  for each row execute function public.handle_new_alcanzia();

-- =====================================================
-- 10. TRIGGER: Validar que retiro no exceda saldo
-- =====================================================
create or replace function public.validate_withdrawal_amount()
returns trigger
language plpgsql
as $$
declare
  v_balance numeric;
begin
  v_balance := public.get_alcanzia_balance(new.alcanzia_id);

  if new.amount > v_balance then
    raise exception 'El retiro (%) supera el saldo disponible (%)',
      new.amount, v_balance;
  end if;

  return new;
end;
$$;

create trigger trg_validate_withdrawal
  before insert or update of amount, status on public.withdrawals
  for each row
  when (new.status in ('pending', 'approved', 'paid'))
  execute function public.validate_withdrawal_amount();

-- =====================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- =====================================================
alter table public.profiles enable row level security;
alter table public.alcanzias enable row level security;
alter table public.alcanzia_members enable row level security;
alter table public.contributions enable row level security;
alter table public.withdrawals enable row level security;
alter table public.withdrawal_logs enable row level security;

-- ---------- PROFILES ----------
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ---------- ALCANZIAS ----------
create policy "Members can view their alcanzias"
  on public.alcanzias for select
  using (
    exists (
      select 1 from public.alcanzia_members m
      where m.alcanzia_id = id and m.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create alcanzias"
  on public.alcanzias for insert
  with check (auth.uid() = creator_id);

create policy "Admins can update their alcanzias"
  on public.alcanzias for update
  using (
    exists (
      select 1 from public.alcanzia_members m
      where m.alcanzia_id = id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

-- ---------- ALCANZIA_MEMBERS ----------
create policy "Members can view other members of same alcanzia"
  on public.alcanzia_members for select
  using (
    exists (
      select 1 from public.alcanzia_members m
      where m.alcanzia_id = alcanzia_id and m.user_id = auth.uid()
    )
  );

create policy "Admins can manage members"
  on public.alcanzia_members for all
  using (
    exists (
      select 1 from public.alcanzia_members m
      where m.alcanzia_id = alcanzia_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

-- ---------- CONTRIBUTIONS ----------
create policy "Members can view contributions of their alcanzias"
  on public.contributions for select
  using (
    exists (
      select 1 from public.alcanzia_members m
      where m.alcanzia_id = contributions.alcanzia_id
        and m.user_id = auth.uid()
    )
  );

create policy "Members can create their own contributions"
  on public.contributions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.alcanzia_members m
      where m.alcanzia_id = alcanzia_id and m.user_id = auth.uid()
    )
  );

-- ¡Importante! Nadie puede actualizar status desde el cliente.
-- Solo la service_role (Edge Functions) puede hacerlo.
create policy "No direct updates of contributions from client"
  on public.contributions for update
  using (false);

-- ---------- WITHDRAWALS ----------
create policy "Members can view withdrawals of their alcanzias"
  on public.withdrawals for select
  using (
    exists (
      select 1 from public.alcanzia_members m
      where m.alcanzia_id = withdrawals.alcanzia_id
        and m.user_id = auth.uid()
    )
  );

create policy "Only designated responsible can request withdrawal"
  on public.withdrawals for insert
  with check (
    auth.uid() = requested_by
    and exists (
      select 1 from public.alcanzias a
      where a.id = alcanzia_id
        and a.withdrawal_responsible_id = auth.uid()
    )
  );

create policy "Admins can update withdrawals (approve/reject)"
  on public.withdrawals for update
  using (
    exists (
      select 1 from public.alcanzia_members m
      where m.alcanzia_id = withdrawals.alcanzia_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

-- ---------- WITHDRAWAL_LOGS ----------
create policy "Members can view logs of their alcanzias"
  on public.withdrawal_logs for select
  using (
    exists (
      select 1
      from public.withdrawals w
      join public.alcanzia_members m on m.alcanzia_id = w.alcanzia_id
      where w.id = withdrawal_logs.withdrawal_id
        and m.user_id = auth.uid()
    )
  );

-- =====================================================
-- 12. FUNCIÓN AUXILIAR: Crear perfil al registrarse
-- =====================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================
