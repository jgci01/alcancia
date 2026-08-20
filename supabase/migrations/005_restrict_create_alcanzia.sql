-- Restringir la creación de alcanzias solo para usuarios que tengan is_superadmin = true
drop policy if exists "Authenticated users can create alcanzias" on public.alcanzias;
drop policy if exists "SuperAdmins can create alcanzias" on public.alcanzias;

create policy "SuperAdmins can create alcanzias"
  on public.alcanzias for insert
  with check (
    auth.uid() = creator_id and 
    exists (select 1 from public.profiles where id = auth.uid() and is_superadmin = true)
  );
