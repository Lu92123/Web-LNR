-- ============================================================
-- WebLiga - Llaves y posiciones de la segunda TV
-- Ejecutar una sola vez en Supabase: SQL Editor > New query
--
-- IMPORTANTE: antes de ejecutar, reemplazá el texto ADMIN_EMAIL por el correo
-- del administrador (aparece 3 veces dentro de las políticas, ya entre
-- comillas y lower()). Tiene que ser el mismo correo que usaste en schema.sql
-- y avisos.sql.
-- ============================================================

create table if not exists public.llaves (
    id integer primary key default 1,
    datos jsonb not null default '{}'::jsonb,
    actualizado_por text,
    actualizado_en timestamptz not null default now(),

    constraint llaves_fila_unica check (id = 1)
);

comment on table public.llaves is
    'Datos de la pantalla de llaves y posiciones (brackets.html).';

-- ------------------------------------------------------------
-- Seguridad: todos leen, solo el administrador escribe
-- ------------------------------------------------------------

alter table public.llaves enable row level security;

drop policy if exists "Lectura publica" on public.llaves;
create policy "Lectura publica"
    on public.llaves
    for select
    using (true);

drop policy if exists "Admin inserta" on public.llaves;
create policy "Admin inserta"
    on public.llaves
    for insert
    to authenticated
    with check (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

drop policy if exists "Admin actualiza" on public.llaves;
create policy "Admin actualiza"
    on public.llaves
    for update
    to authenticated
    using (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'))
    with check (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

drop policy if exists "Admin borra" on public.llaves;
create policy "Admin borra"
    on public.llaves
    for delete
    to authenticated
    using (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

grant select on public.llaves to anon, authenticated;
grant insert, update, delete on public.llaves to authenticated;

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

drop trigger if exists llaves_marcar_actualizacion on public.llaves;
create trigger llaves_marcar_actualizacion
    before insert or update on public.llaves
    for each row
    execute function public.webliga_marcar_actualizacion();

-- ------------------------------------------------------------
-- Realtime: avisa a la segunda TV cuando cambian las llaves
-- ------------------------------------------------------------

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'llaves'
    ) then
        alter publication supabase_realtime add table public.llaves;
    end if;
end
$$;

-- ------------------------------------------------------------
-- Fila única (se completa desde el panel de administración)
-- ------------------------------------------------------------

insert into public.llaves (id, datos)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Verificación (opcional)
-- ------------------------------------------------------------

-- select id, actualizado_en, actualizado_por, jsonb_array_length(datos->'categorias') as categorias
-- from public.llaves;
