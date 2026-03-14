-- TrackFlow Supabase schema
-- Purpose: persist all TrackFlow mutations in Postgres and broadcast with Realtime.
-- Model: key/value state store because current frontend persists domain slices as tf_* keys.

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Profiles / roles (Supabase Auth -> app role)
-- -----------------------------------------------------------------------------

create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_profiles_is_admin on public.app_profiles (is_admin);

-- -----------------------------------------------------------------------------
-- App state store
-- -----------------------------------------------------------------------------

create table if not exists public.app_kv (
  key text primary key,
  value text not null,
  is_public boolean not null default true,
  position integer,
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  check (char_length(trim(key)) > 0)
);

-- Compatibility upgrade path for existing legacy app_kv table
alter table public.app_kv add column if not exists is_public boolean not null default true;
alter table public.app_kv add column if not exists position integer;
alter table public.app_kv add column if not exists version bigint not null default 1;
alter table public.app_kv add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.app_kv add column if not exists updated_at timestamptz not null default timezone('utc', now());
alter table public.app_kv add column if not exists updated_by text;

create index if not exists idx_app_kv_public_updated
  on public.app_kv (is_public, updated_at desc);

create index if not exists idx_app_kv_position
  on public.app_kv (position)
  where position is not null;

create index if not exists idx_app_kv_updated_by
  on public.app_kv (updated_by, updated_at desc);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists tg_app_profiles_updated_at on public.app_profiles;
create trigger tg_app_profiles_updated_at
before update on public.app_profiles
for each row execute function public.tg_set_updated_at();

create or replace function public.tg_app_kv_versioning()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version = coalesce(new.version, 1);
    new.created_at = coalesce(new.created_at, timezone('utc', now()));
  else
    new.version = coalesce(old.version, 0) + 1;
  end if;
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists tg_app_kv_versioning on public.app_kv;
create trigger tg_app_kv_versioning
before insert or update on public.app_kv
for each row execute function public.tg_app_kv_versioning();

-- -----------------------------------------------------------------------------
-- Role helpers
-- -----------------------------------------------------------------------------

create or replace function public.is_admin_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.app_profiles enable row level security;
alter table public.app_kv enable row level security;

drop policy if exists profiles_admin_manage on public.app_profiles;
create policy profiles_admin_manage
on public.app_profiles
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists profiles_self_read_or_admin on public.app_profiles;
create policy profiles_self_read_or_admin
on public.app_profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin_user());

drop policy if exists app_kv_read_public_or_admin on public.app_kv;
create policy app_kv_read_public_or_admin
on public.app_kv
for select
to anon, authenticated
using (is_public = true or public.is_admin_user());

drop policy if exists app_kv_admin_insert on public.app_kv;
create policy app_kv_admin_insert
on public.app_kv
for insert
to authenticated
with check (public.is_admin_user());

drop policy if exists app_kv_admin_update on public.app_kv;
create policy app_kv_admin_update
on public.app_kv
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists app_kv_admin_delete on public.app_kv;
create policy app_kv_admin_delete
on public.app_kv
for delete
to authenticated
using (public.is_admin_user());

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_kv'
  ) then
    alter publication supabase_realtime add table public.app_kv;
  end if;
exception
  when undefined_object then
    null;
end $$;

-- -----------------------------------------------------------------------------
-- Bootstrap note:
-- 1) Create coach user in Supabase Auth (email/password).
-- 2) Insert its row in app_profiles with is_admin = true.
-- -----------------------------------------------------------------------------
