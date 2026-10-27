-- ============================================================
-- WebLiga - Tabla de avisos del tablero
-- Ejecutar una sola vez en Supabase: SQL Editor > New query
--
-- IMPORTANTE: antes de ejecutar, reemplazá el texto ADMIN_EMAIL por el correo
-- del administrador (aparece 3 veces dentro de las políticas, ya entre
-- comillas y lower()). Tiene que ser el mismo correo que usaste en schema.sql.
-- ============================================================

create table if not exists public.avisos (
    id integer primary key default 1,
    texto text not null,
    activo boolean not null default true,
    actualizado_por text,
    actualizado_en timestamptz not null default now(),

    constraint avisos_fila_unicos check (id = 1)
);

comment on table public.avisos is
    'Aviso para notificaciones importantes que se muestra en el tablero.';

-- ------------------------------------------------------------
-- Seguridad: todos leen, solo el administrador escribe
-- ------------------------------------------------------------

alter table public.avisos enable row level security;

drop policy if exists "Lectura publica" on public.avisos;
create policy "Lectura publica"
    on public.avisos
    for select
    using (true);

drop policy if exists "Admin inserta" on public.avisos;
create policy "Admin inserta"
    on public.avisos
    for insert
    to authenticated
    with check (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

drop policy if exists "Admin actualiza" on public.avisos;
create policy "Admin actualiza"
    on public.avisos
    for update
    to authenticated
    using (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'))
    with check (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

drop policy if exists "Admin borra" on public.avisos;
create policy "Admin borra"
    on public.avisos
    for delete
    to authenticated
    using (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

grant select on public.avisos to anon, authenticated;
grant insert, update, delete on public.avisos to authenticated;

-- ------------------------------------------------------------
-- Marca de actualización automática (misma función que horarios)
-- ------------------------------------------------------------

create or replace function public.webliga_marcar_actualizacion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    new.actualizado_en := now();
    return new;
end;
$$;

drop trigger if exists avisos_marcar_actualizacion on public.avisos;
create trigger avisos_marcar_actualizacion
    before insert or update on public.avisos
    for each row
    execute function public.webliga_marcar_actualizacion();

-- ------------------------------------------------------------
-- Realtime: avisa a todos los tableros cuando cambia el aviso
-- ------------------------------------------------------------

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'avisos'
    ) then
        alter publication supabase_realtime add table public.avisos;
    end if;
end
$$;

-- ------------------------------------------------------------
-- Fila única (siempre existe, empieza apagada)
-- ------------------------------------------------------------

insert into public.avisos (id, texto, activo)
values (1, '', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Verificación (opcional)
-- ------------------------------------------------------------

-- select * from public.avisos;
