-- TrackFlow Supabase schema (single project)
-- Date: 2026-03-12
--
-- This schema has 2 layers:
-- 1) Operational layer used immediately by current backend:
--    - app_kv
--    - users_csv_registry
--    - app_changes
-- 2) Normalized domain model for full migration:
--    seasons, week plans, trainings, gym routines, athletes, history, notifications, images.

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- -----------------------------------------------------------------------------
-- 1) Operational key/value layer (used by server/src/storage/providers/* now)
-- -----------------------------------------------------------------------------

create table if not exists public.app_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

create index if not exists idx_app_kv_updated_at on public.app_kv (updated_at desc);

create table if not exists public.users_csv_registry (
  id integer primary key check (id = 1),
  csv text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

insert into public.users_csv_registry (id, csv)
values (1, 'id,name,group,groups,avatar,maxW,weekKms,todayDone,competitions' || E'\n')
on conflict (id) do nothing;

create table if not exists public.app_changes (
  seq bigint generated always as identity primary key,
  key text not null,
  client_id text,
  changed_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_changes_seq on public.app_changes (seq desc);
create index if not exists idx_app_changes_client on public.app_changes (client_id);
create index if not exists idx_app_changes_key on public.app_changes (key);

-- -----------------------------------------------------------------------------
-- 2) Normalized domain model
-- -----------------------------------------------------------------------------

-- Users / Athletes / Groups
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('coach', 'athlete')),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  password_changed_once boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.athlete_profiles (
  athlete_id uuid primary key references public.app_users(id) on delete cascade,
  avatar text,
  primary_group_id uuid references public.groups(id) on delete set null,
  max_weights jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.athlete_group_memberships (
  athlete_id uuid not null references public.app_users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (athlete_id, group_id)
);

create index if not exists idx_memberships_group on public.athlete_group_memberships (group_id);

-- Seasons
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  season_code text not null unique, -- e.g. 25/26, 26/27
  week_one_start date not null, -- Monday that defines week 1
  is_active boolean not null default false,
  started_at timestamptz not null default timezone('utc', now()),
  finalized_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.season_archives (
  season_id uuid primary key references public.seasons(id) on delete cascade,
  archive_payload jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default timezone('utc', now()),
  archived_by uuid references public.app_users(id) on delete set null
);

-- Training dataset
create table if not exists public.training_dataset (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  week_types text[] not null default array['Inicial','Competitiva','Volumen']::text[],
  km_reg numeric(7,2) not null default 0,
  km_ua numeric(7,2) not null default 0,
  km_uan numeric(7,2) not null default 0,
  km_ane numeric(7,2) not null default 0,
  km_total numeric(8,2) generated always as (km_reg + km_ua + km_uan + km_ane) stored,
  custom_fields jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_training_dataset_name on public.training_dataset (name);
create index if not exists idx_training_dataset_total on public.training_dataset (km_total);
create index if not exists idx_training_dataset_week_types on public.training_dataset using gin (week_types);

-- Exercise dataset + media (one image per exercise)
create table if not exists public.exercise_dataset (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  prescription_mode text not null check (
    prescription_mode in ('time_sets', 'weight_sets_reps', 'sets_reps')
  ),
  default_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exercise_media (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null unique references public.exercise_dataset(id) on delete cascade,
  storage_bucket text not null default 'exercise-images',
  storage_path text not null unique,
  public_url text,
  mime_type text check (mime_type in ('image/svg+xml', 'image/png', 'image/jpeg')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Gym routines
create table if not exists public.gym_routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  source text not null default 'custom' check (source in ('custom', 'dataset')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gym_routine_items (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.gym_routines(id) on delete cascade,
  exercise_id uuid not null references public.exercise_dataset(id) on delete restrict,
  order_no integer not null default 1,
  sets integer,
  reps integer,
  seconds integer,
  weight_pct numeric(6,2),
  weight_kg numeric(8,2),
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_gym_items_routine_order on public.gym_routine_items (routine_id, order_no);

-- Week plans
create table if not exists public.week_plans (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  week_number integer not null check (week_number > 0 and week_number < 80),
  week_type text not null check (week_type in ('Inicial', 'Competitiva', 'Volumen')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  published_by uuid references public.app_users(id) on delete set null,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season_id, week_number)
);

create index if not exists idx_week_plans_status on public.week_plans (season_id, status, week_number);

create table if not exists public.week_plan_days (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.week_plans(id) on delete cascade,
  day_index smallint not null check (day_index between 0 and 6), -- 0 Monday ... 6 Sunday
  day_date date,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (week_plan_id, day_index)
);

create table if not exists public.planned_day_sessions (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.week_plan_days(id) on delete cascade,
  slot text not null check (slot in ('am', 'pm', 'extra_am', 'extra_pm')),
  target_scope text not null default 'all' check (target_scope in ('all', 'pequenos', '1500m', '800m')),
  training_id uuid references public.training_dataset(id) on delete set null,
  custom_training_name text,
  custom_training_payload jsonb not null default '{}'::jsonb,
  km_reg numeric(7,2) not null default 0,
  km_ua numeric(7,2) not null default 0,
  km_uan numeric(7,2) not null default 0,
  km_ane numeric(7,2) not null default 0,
  km_total numeric(8,2) generated always as (km_reg + km_ua + km_uan + km_ane) stored,
  order_no integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_day_sessions_day_slot on public.planned_day_sessions (day_id, slot, order_no);
create index if not exists idx_day_sessions_target on public.planned_day_sessions (target_scope);

create table if not exists public.planned_day_gym (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.week_plan_days(id) on delete cascade,
  target_scope text not null default 'all' check (target_scope in ('all', 'pequenos', '1500m', '800m')),
  routine_id uuid references public.gym_routines(id) on delete set null,
  custom_routine_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (day_id, target_scope)
);

-- Athlete performance history / calendar
create table if not exists public.athlete_day_history (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.app_users(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  day_date date not null,
  am_done boolean not null default false,
  pm_done boolean not null default false,
  gym_done boolean not null default false,
  completed boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (athlete_id, day_date)
);

create index if not exists idx_day_history_athlete_date on public.athlete_day_history (athlete_id, day_date desc);
create index if not exists idx_day_history_season on public.athlete_day_history (season_id, day_date);

create table if not exists public.athlete_competitions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.app_users(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  title text not null,
  competition_date date not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_competitions_athlete_date on public.athlete_competitions (athlete_id, competition_date);

create table if not exists public.athlete_notifications (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.app_users(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  week_plan_id uuid references public.week_plans(id) on delete set null,
  target_scope text not null default 'all' check (target_scope in ('all', 'pequenos', '1500m', '800m')),
  title text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz,
  dismissed_at timestamptz
);

create index if not exists idx_notifications_athlete_created on public.athlete_notifications (athlete_id, created_at desc);
create index if not exists idx_notifications_athlete_dismissed on public.athlete_notifications (athlete_id, dismissed_at);

-- Athlete max weights per exercise (coach-only edits)
create table if not exists public.athlete_exercise_maxes (
  athlete_id uuid not null references public.app_users(id) on delete cascade,
  exercise_id uuid not null references public.exercise_dataset(id) on delete cascade,
  max_weight_kg numeric(8,2) not null default 0,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (athlete_id, exercise_id)
);

create index if not exists idx_maxes_exercise on public.athlete_exercise_maxes (exercise_id);

-- Week kms summary view
create or replace view public.v_week_plan_kms as
select
  wp.id as week_plan_id,
  wp.season_id,
  wp.week_number,
  wp.week_type,
  coalesce(sum(pds.km_reg), 0)::numeric(9,2) as km_reg,
  coalesce(sum(pds.km_ua), 0)::numeric(9,2) as km_ua,
  coalesce(sum(pds.km_uan), 0)::numeric(9,2) as km_uan,
  coalesce(sum(pds.km_ane), 0)::numeric(9,2) as km_ane,
  coalesce(sum(pds.km_total), 0)::numeric(9,2) as km_total
from public.week_plans wp
left join public.week_plan_days wpd on wpd.week_plan_id = wp.id
left join public.planned_day_sessions pds on pds.day_id = wpd.id
group by wp.id, wp.season_id, wp.week_number, wp.week_type;

-- -----------------------------------------------------------------------------
-- Timestamp trigger helper
-- -----------------------------------------------------------------------------

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists tg_users_updated_at on public.app_users;
create trigger tg_users_updated_at
before update on public.app_users
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_groups_updated_at on public.groups;
create trigger tg_groups_updated_at
before update on public.groups
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_profiles_updated_at on public.athlete_profiles;
create trigger tg_profiles_updated_at
before update on public.athlete_profiles
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_seasons_updated_at on public.seasons;
create trigger tg_seasons_updated_at
before update on public.seasons
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_training_dataset_updated_at on public.training_dataset;
create trigger tg_training_dataset_updated_at
before update on public.training_dataset
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_exercise_dataset_updated_at on public.exercise_dataset;
create trigger tg_exercise_dataset_updated_at
before update on public.exercise_dataset
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_exercise_media_updated_at on public.exercise_media;
create trigger tg_exercise_media_updated_at
before update on public.exercise_media
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_gym_routines_updated_at on public.gym_routines;
create trigger tg_gym_routines_updated_at
before update on public.gym_routines
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_gym_items_updated_at on public.gym_routine_items;
create trigger tg_gym_items_updated_at
before update on public.gym_routine_items
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_week_plans_updated_at on public.week_plans;
create trigger tg_week_plans_updated_at
before update on public.week_plans
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_week_days_updated_at on public.week_plan_days;
create trigger tg_week_days_updated_at
before update on public.week_plan_days
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_day_sessions_updated_at on public.planned_day_sessions;
create trigger tg_day_sessions_updated_at
before update on public.planned_day_sessions
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_day_gym_updated_at on public.planned_day_gym;
create trigger tg_day_gym_updated_at
before update on public.planned_day_gym
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_history_updated_at on public.athlete_day_history;
create trigger tg_history_updated_at
before update on public.athlete_day_history
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_competitions_updated_at on public.athlete_competitions;
create trigger tg_competitions_updated_at
before update on public.athlete_competitions
for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Supabase Storage bucket for exercise images
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-images',
  'exercise-images',
  true,
  10485760,
  array['image/svg+xml', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read policy for exercise images
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read exercise-images'
  ) then
    create policy "Public read exercise-images"
      on storage.objects
      for select
      to public
      using (bucket_id = 'exercise-images');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Access control (RLS) + helper functions
-- -----------------------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select u.role
      from public.app_users u
      where u.id = auth.uid()
        and u.is_active = true
      limit 1
    ),
    'anonymous'
  );
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
as $$
  select public.current_user_role() = 'coach';
$$;

create or replace function public.is_active_season(p_season_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.seasons s
    where s.id = p_season_id
      and s.is_active = true
  );
$$;

create or replace function public.belongs_to_scope(p_athlete_id uuid, p_scope text)
returns boolean
language sql
stable
as $$
  select case
    when p_scope is null then false
    when lower(trim(p_scope)) = 'all' then true
    else exists (
      select 1
      from public.athlete_group_memberships agm
      join public.groups g on g.id = agm.group_id
      where agm.athlete_id = p_athlete_id
        and lower(g.code) = lower(trim(p_scope))
    )
  end;
$$;

create or replace function public.update_my_profile(
  p_display_name text default null,
  p_avatar text default null,
  p_password_changed_once boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(p_display_name), '');
  v_avatar text := nullif(trim(p_avatar), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_name is not null then
    update public.app_users
    set display_name = left(v_name, 120)
    where id = v_user_id;
  end if;

  if p_password_changed_once is not null then
    update public.app_users
    set password_changed_once = p_password_changed_once
    where id = v_user_id;
  end if;

  insert into public.athlete_profiles (athlete_id, avatar)
  values (v_user_id, v_avatar)
  on conflict (athlete_id) do update
  set avatar = coalesce(excluded.avatar, public.athlete_profiles.avatar),
      updated_at = timezone('utc', now());
end;
$$;

grant execute on function public.update_my_profile(text, text, boolean) to authenticated;

create or replace function public.enqueue_week_notification(
  p_week_plan_id uuid,
  p_event text default 'updated',
  p_scopes text[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week record;
  v_title text;
  v_message text;
  v_count integer := 0;
begin
  if not public.is_coach() then
    raise exception 'Only coach can notify athletes';
  end if;

  select
    wp.id,
    wp.season_id,
    wp.week_number,
    wp.week_type
  into v_week
  from public.week_plans wp
  where wp.id = p_week_plan_id;

  if not found then
    raise exception 'Week plan not found';
  end if;

  v_title := case
    when lower(coalesce(p_event, '')) = 'published' then 'Semana publicada'
    else 'Semana modificada'
  end;

  v_message := case
    when lower(coalesce(p_event, '')) = 'published'
      then format('Semana %s (%s) publicada.', v_week.week_number, v_week.week_type)
    else
      format('Semana %s (%s) actualizada.', v_week.week_number, v_week.week_type)
  end;

  with affected_scopes as (
    select distinct lower(trim(scope_value)) as scope_value
    from (
      select unnest(p_scopes) as scope_value
      where p_scopes is not null and array_length(p_scopes, 1) > 0
      union all
      select pds.target_scope as scope_value
      from public.week_plan_days wpd
      join public.planned_day_sessions pds on pds.day_id = wpd.id
      where wpd.week_plan_id = p_week_plan_id
      union all
      select pdg.target_scope as scope_value
      from public.week_plan_days wpd
      join public.planned_day_gym pdg on pdg.day_id = wpd.id
      where wpd.week_plan_id = p_week_plan_id
    ) x
    where scope_value is not null
      and scope_value <> ''
  ),
  target_athletes as (
    select distinct u.id as athlete_id
    from public.app_users u
    where u.role = 'athlete'
      and u.is_active = true
      and (
        exists (select 1 from affected_scopes sc where sc.scope_value = 'all')
        or exists (
          select 1
          from affected_scopes sc
          where sc.scope_value <> 'all'
            and public.belongs_to_scope(u.id, sc.scope_value)
        )
      )
  ),
  ins as (
    insert into public.athlete_notifications (
      athlete_id,
      season_id,
      week_plan_id,
      target_scope,
      title,
      message,
      payload
    )
    select
      ta.athlete_id,
      v_week.season_id,
      v_week.id,
      'all',
      v_title,
      v_message,
      jsonb_build_object(
        'event', lower(coalesce(p_event, 'updated')),
        'weekPlanId', v_week.id,
        'weekNumber', v_week.week_number,
        'weekType', v_week.week_type
      )
    from target_athletes ta
    returning 1
  )
  select count(*)::integer into v_count from ins;

  return v_count;
end;
$$;

grant execute on function public.enqueue_week_notification(uuid, text, text[]) to authenticated;

create or replace function public.publish_week(p_week_plan_id uuid)
returns public.week_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.week_plans%rowtype;
begin
  if not public.is_coach() then
    raise exception 'Only coach can publish week';
  end if;

  update public.week_plans
  set
    status = 'published',
    published_at = timezone('utc', now()),
    published_by = auth.uid(),
    updated_at = timezone('utc', now())
  where id = p_week_plan_id
  returning * into v_week;

  if v_week.id is null then
    raise exception 'Week plan not found';
  end if;

  perform public.enqueue_week_notification(v_week.id, 'published', null);
  return v_week;
end;
$$;

grant execute on function public.publish_week(uuid) to authenticated;

create or replace function public.notify_week_updated(
  p_week_plan_id uuid,
  p_scopes text[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.enqueue_week_notification(p_week_plan_id, 'updated', p_scopes);
end;
$$;

grant execute on function public.notify_week_updated(uuid, text[]) to authenticated;

create or replace function public.finalize_season(
  p_current_season_id uuid,
  p_next_season_code text,
  p_next_week_one_start date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_season_id uuid;
begin
  if not public.is_coach() then
    raise exception 'Only coach can finalize seasons';
  end if;

  if p_next_week_one_start is null then
    raise exception 'Next season week one start is required';
  end if;

  update public.seasons
  set
    is_active = false,
    finalized_at = coalesce(finalized_at, timezone('utc', now())),
    archived_at = coalesce(archived_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = p_current_season_id;

  if not found then
    raise exception 'Current season not found';
  end if;

  insert into public.season_archives (season_id, archive_payload, archived_at, archived_by)
  values (
    p_current_season_id,
    jsonb_build_object(
      'closedAt', timezone('utc', now()),
      'closedBy', auth.uid(),
      'note', 'Season closed and archived'
    ),
    timezone('utc', now()),
    auth.uid()
  )
  on conflict (season_id) do update
  set
    archive_payload = excluded.archive_payload,
    archived_at = excluded.archived_at,
    archived_by = excluded.archived_by;

  insert into public.seasons (
    season_code,
    week_one_start,
    is_active,
    started_at,
    created_by
  )
  values (
    trim(p_next_season_code),
    p_next_week_one_start,
    true,
    timezone('utc', now()),
    auth.uid()
  )
  on conflict (season_code) do update
  set
    week_one_start = excluded.week_one_start,
    is_active = true,
    started_at = coalesce(public.seasons.started_at, excluded.started_at),
    updated_at = timezone('utc', now())
  returning id into v_next_season_id;

  update public.seasons
  set is_active = false, updated_at = timezone('utc', now())
  where id <> v_next_season_id
    and is_active = true;

  return v_next_season_id;
end;
$$;

grant execute on function public.finalize_season(uuid, text, date) to authenticated;

alter table public.app_users enable row level security;
alter table public.groups enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.athlete_group_memberships enable row level security;
alter table public.seasons enable row level security;
alter table public.season_archives enable row level security;
alter table public.training_dataset enable row level security;
alter table public.exercise_dataset enable row level security;
alter table public.exercise_media enable row level security;
alter table public.gym_routines enable row level security;
alter table public.gym_routine_items enable row level security;
alter table public.week_plans enable row level security;
alter table public.week_plan_days enable row level security;
alter table public.planned_day_sessions enable row level security;
alter table public.planned_day_gym enable row level security;
alter table public.athlete_day_history enable row level security;
alter table public.athlete_competitions enable row level security;
alter table public.athlete_notifications enable row level security;
alter table public.athlete_exercise_maxes enable row level security;

drop policy if exists coach_manage_users on public.app_users;
create policy coach_manage_users
on public.app_users
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists user_read_own_row on public.app_users;
create policy user_read_own_row
on public.app_users
for select
to authenticated
using (id = auth.uid());

drop policy if exists coach_manage_groups on public.groups;
create policy coach_manage_groups
on public.groups
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists authenticated_read_groups on public.groups;
create policy authenticated_read_groups
on public.groups
for select
to authenticated
using (true);

drop policy if exists coach_manage_profiles on public.athlete_profiles;
create policy coach_manage_profiles
on public.athlete_profiles
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_own_profile on public.athlete_profiles;
create policy athlete_read_own_profile
on public.athlete_profiles
for select
to authenticated
using (athlete_id = auth.uid());

drop policy if exists coach_manage_memberships on public.athlete_group_memberships;
create policy coach_manage_memberships
on public.athlete_group_memberships
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_own_memberships on public.athlete_group_memberships;
create policy athlete_read_own_memberships
on public.athlete_group_memberships
for select
to authenticated
using (athlete_id = auth.uid());

drop policy if exists coach_manage_seasons on public.seasons;
create policy coach_manage_seasons
on public.seasons
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_active_seasons on public.seasons;
create policy athlete_read_active_seasons
on public.seasons
for select
to authenticated
using (is_active = true);

drop policy if exists coach_manage_season_archives on public.season_archives;
create policy coach_manage_season_archives
on public.season_archives
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists coach_manage_training_dataset on public.training_dataset;
create policy coach_manage_training_dataset
on public.training_dataset
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists read_training_dataset on public.training_dataset;
create policy read_training_dataset
on public.training_dataset
for select
to authenticated
using (true);

drop policy if exists coach_manage_exercise_dataset on public.exercise_dataset;
create policy coach_manage_exercise_dataset
on public.exercise_dataset
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists read_exercise_dataset on public.exercise_dataset;
create policy read_exercise_dataset
on public.exercise_dataset
for select
to authenticated
using (true);

drop policy if exists coach_manage_exercise_media on public.exercise_media;
create policy coach_manage_exercise_media
on public.exercise_media
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists read_exercise_media on public.exercise_media;
create policy read_exercise_media
on public.exercise_media
for select
to authenticated
using (true);

drop policy if exists coach_manage_gym_routines on public.gym_routines;
create policy coach_manage_gym_routines
on public.gym_routines
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists read_gym_routines on public.gym_routines;
create policy read_gym_routines
on public.gym_routines
for select
to authenticated
using (true);

drop policy if exists coach_manage_gym_items on public.gym_routine_items;
create policy coach_manage_gym_items
on public.gym_routine_items
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists read_gym_items on public.gym_routine_items;
create policy read_gym_items
on public.gym_routine_items
for select
to authenticated
using (true);

drop policy if exists coach_manage_week_plans on public.week_plans;
create policy coach_manage_week_plans
on public.week_plans
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_published_week_plans on public.week_plans;
create policy athlete_read_published_week_plans
on public.week_plans
for select
to authenticated
using (
  status = 'published'
  and public.is_active_season(season_id)
);

drop policy if exists coach_manage_week_plan_days on public.week_plan_days;
create policy coach_manage_week_plan_days
on public.week_plan_days
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_week_plan_days on public.week_plan_days;
create policy athlete_read_week_plan_days
on public.week_plan_days
for select
to authenticated
using (
  exists (
    select 1
    from public.week_plans wp
    where wp.id = week_plan_id
      and wp.status = 'published'
      and public.is_active_season(wp.season_id)
  )
);

drop policy if exists coach_manage_day_sessions on public.planned_day_sessions;
create policy coach_manage_day_sessions
on public.planned_day_sessions
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_day_sessions on public.planned_day_sessions;
create policy athlete_read_day_sessions
on public.planned_day_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.week_plan_days wpd
    join public.week_plans wp on wp.id = wpd.week_plan_id
    where wpd.id = planned_day_sessions.day_id
      and wp.status = 'published'
      and public.is_active_season(wp.season_id)
  )
  and public.belongs_to_scope(auth.uid(), target_scope)
);

drop policy if exists coach_manage_day_gym on public.planned_day_gym;
create policy coach_manage_day_gym
on public.planned_day_gym
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_day_gym on public.planned_day_gym;
create policy athlete_read_day_gym
on public.planned_day_gym
for select
to authenticated
using (
  exists (
    select 1
    from public.week_plan_days wpd
    join public.week_plans wp on wp.id = wpd.week_plan_id
    where wpd.id = planned_day_gym.day_id
      and wp.status = 'published'
      and public.is_active_season(wp.season_id)
  )
  and public.belongs_to_scope(auth.uid(), target_scope)
);

drop policy if exists coach_manage_history on public.athlete_day_history;
create policy coach_manage_history
on public.athlete_day_history
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_manage_own_active_history on public.athlete_day_history;
create policy athlete_manage_own_active_history
on public.athlete_day_history
for all
to authenticated
using (
  athlete_id = auth.uid()
  and public.is_active_season(season_id)
)
with check (
  athlete_id = auth.uid()
  and public.is_active_season(season_id)
);

drop policy if exists coach_manage_competitions on public.athlete_competitions;
create policy coach_manage_competitions
on public.athlete_competitions
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_manage_own_active_competitions on public.athlete_competitions;
create policy athlete_manage_own_active_competitions
on public.athlete_competitions
for all
to authenticated
using (
  athlete_id = auth.uid()
  and public.is_active_season(season_id)
)
with check (
  athlete_id = auth.uid()
  and public.is_active_season(season_id)
);

drop policy if exists coach_manage_notifications on public.athlete_notifications;
create policy coach_manage_notifications
on public.athlete_notifications
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_own_notifications on public.athlete_notifications;
create policy athlete_read_own_notifications
on public.athlete_notifications
for select
to authenticated
using (
  athlete_id = auth.uid()
  and (season_id is null or public.is_active_season(season_id))
);

drop policy if exists athlete_update_own_notifications on public.athlete_notifications;
create policy athlete_update_own_notifications
on public.athlete_notifications
for update
to authenticated
using (athlete_id = auth.uid())
with check (athlete_id = auth.uid());

drop policy if exists coach_manage_maxes on public.athlete_exercise_maxes;
create policy coach_manage_maxes
on public.athlete_exercise_maxes
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

drop policy if exists athlete_read_own_maxes on public.athlete_exercise_maxes;
create policy athlete_read_own_maxes
on public.athlete_exercise_maxes
for select
to authenticated
using (athlete_id = auth.uid());

-- Storage write policies for coach
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Coach write exercise-images'
  ) then
    create policy "Coach write exercise-images"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'exercise-images' and public.is_coach());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Coach update exercise-images'
  ) then
    create policy "Coach update exercise-images"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'exercise-images' and public.is_coach())
      with check (bucket_id = 'exercise-images' and public.is_coach());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Coach delete exercise-images'
  ) then
    create policy "Coach delete exercise-images"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'exercise-images' and public.is_coach());
  end if;
end $$;
