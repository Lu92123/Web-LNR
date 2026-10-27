-- ============================================================
-- WebLiga - Tabla de horarios compartidos
-- Ejecutar una sola vez en Supabase: SQL Editor > New query
--
-- IMPORTANTE: antes de ejecutar, reemplazá el texto ADMIN_EMAIL por el correo
-- del administrador (aparece 4 veces dentro de las políticas, ya entre
-- comillas y lower()). Ejemplo: lower('luis@escuela.edu')
-- ============================================================

create table if not exists public.horarios (
    evento_id integer primary key,
    hora_inicio text not null,
    hora_fin text not null,
    finalizado boolean not null default false,
    actualizado_por text,
    actualizado_en timestamptz not null default now(),

    constraint horarios_hora_inicio_valida
        check (hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

    constraint horarios_hora_fin_valida
        check (hora_fin ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

    constraint horarios_rango_valido
        check (hora_inicio < hora_fin)
);

comment on table public.horarios is
    'Cambios manuales del cronograma de WebLiga. Los horarios base están en datos.js.';

-- ------------------------------------------------------------
-- Seguridad: todos leen, solo el administrador escribe
-- ------------------------------------------------------------

alter table public.horarios enable row level security;

drop policy if exists "Lectura publica" on public.horarios;
create policy "Lectura publica"
    on public.horarios
    for select
    using (true);

drop policy if exists "Admin inserta" on public.horarios;
create policy "Admin inserta"
    on public.horarios
    for insert
    to authenticated
    with check (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

drop policy if exists "Admin actualiza" on public.horarios;
create policy "Admin actualiza"
    on public.horarios
    for update
    to authenticated
    using (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'))
    with check (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

drop policy if exists "Admin borra" on public.horarios;
create policy "Admin borra"
    on public.horarios
    for delete
    to authenticated
    using (lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL'));

grant select on public.horarios to anon, authenticated;
grant insert, update, delete on public.horarios to authenticated;

-- ------------------------------------------------------------
-- Marca de actualización automática
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

drop trigger if exists horarios_marcar_actualizacion on public.horarios;
create trigger horarios_marcar_actualizacion
    before insert or update on public.horarios
    for each row
    execute function public.webliga_marcar_actualizacion();

-- ------------------------------------------------------------
-- Realtime: avisar a todos los tableros cuando hay un cambio
-- ------------------------------------------------------------

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'horarios'
    ) then
        alter publication supabase_realtime add table public.horarios;
    end if;
end
$$;

-- ------------------------------------------------------------
-- Verificación (opcional)
-- ------------------------------------------------------------

-- select * from public.horarios order by evento_id;
