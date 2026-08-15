-- Agregar columna is_superadmin a profiles
alter table public.profiles
add column if not exists is_superadmin boolean not null default false;

-- Asignar is_superadmin = true al correo jgci01@gmail.com
update public.profiles
set is_superadmin = true
where email = 'jgci01@gmail.com';

-- Obtener todos los usuarios para el super admin
create or replace function public.get_superadmin_users()
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.profiles where profiles.id = auth.uid() and is_superadmin = true) then
    raise exception 'Unauthorized';
  end if;

  return query
  select p.id, p.full_name, p.email, p.phone, p.created_at
  from public.profiles p
  order by p.created_at desc;
end;
$$;

-- Obtener todas las alcanzias para el super admin
create or replace function public.get_superadmin_alcanzias()
returns table (
  id uuid,
  title text,
  goal_amount numeric,
  currency public.currency_code,
  is_active boolean,
  balance numeric,
  last_movement_date timestamptz
)
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.profiles where profiles.id = auth.uid() and is_superadmin = true) then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    a.id,
    a.title,
    a.goal_amount,
    a.currency,
    a.is_active,
    public.get_alcanzia_balance(a.id) as balance,
    (
      select max(m.fecha) from public.movimientos_alcanzia m where m.alcanzia_id = a.id
    ) as last_movement_date
  from public.alcanzias a
  order by a.created_at desc;
end;
$$;

-- Activar o desactivar alcanzias
create or replace function public.toggle_alcanzia_active(p_alcanzia_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.profiles where profiles.id = auth.uid() and is_superadmin = true) then
    raise exception 'Unauthorized';
  end if;

  update public.alcanzias
  set is_active = p_is_active
  where id = p_alcanzia_id;
end;
$$;
