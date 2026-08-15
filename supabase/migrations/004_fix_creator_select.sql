-- Permitir que el creador de una alcanzia siempre pueda verla,
-- para evitar errores al momento de crearla con Supabase "returning *"
-- ya que el trigger AFTER inserta al miembro DESPUÉS de evaluar la política SELECT.
drop policy if exists "Members can view their alcanzias" on public.alcanzias;
create policy "Members can view their alcanzias" on public.alcanzias
  for select using (
    creator_id = auth.uid() or public.is_alcanzia_member(id)
  );
