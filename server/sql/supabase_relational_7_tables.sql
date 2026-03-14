-- TrackFlow relational schema (7 tables)
-- Designed from current app domain:
-- 1) coaches
-- 2) groups
-- 3) athletes
-- 4) gym_exercises
-- 5) seasons
-- 6) coach_calendar_entries
-- 7) athlete_calendar_entries

create extension if not exists "pgcrypto";

create table if not exists public.coaches (
  id text primary key,
  auth_user_id uuid unique,
  name text not null,
  password_plain text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(trim(id)) > 0),
  check (char_length(trim(name)) > 0)
);

create table if not exists public.groups (
  id text primary key,
  coach_id text not null references public.coaches(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (coach_id, name),
  check (char_length(trim(id)) > 0),
  check (char_length(trim(name)) > 0)
);

create index if not exists idx_groups_coach on public.groups (coach_id, is_active, position, name);

create table if not exists public.athletes (
  id text primary key,
  coach_id text not null references public.coaches(id) on delete cascade,
  auth_user_id uuid unique,
  name text not null,
  password_plain text not null default '1234',
  avatar text,
  primary_group_id text references public.groups(id) on delete set null,
  group_ids jsonb not null default '[]'::jsonb,
  exercise_maxes jsonb not null default '{}'::jsonb,
  week_kms jsonb not null default '[]'::jsonb,
  competitions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (coach_id, name),
  check (char_length(trim(id)) > 0),
  check (char_length(trim(name)) > 0)
);

create index if not exists idx_athletes_coach on public.athletes (coach_id, is_active, name);
create index if not exists idx_athletes_groups_json on public.athletes using gin (group_ids);

create table if not exists public.gym_exercises (
  id text primary key,
  coach_id text not null references public.coaches(id) on delete cascade,
  name text not null,
  exercise_type text not null default 'reps'
    check (exercise_type in ('weight', 'reps', 'time_reps')),
  category text,
  muscles text,
  default_payload jsonb not null default '{}'::jsonb,
  image_url text,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (coach_id, name),
  check (char_length(trim(id)) > 0),
  check (char_length(trim(name)) > 0)
);

create index if not exists idx_exercises_coach on public.gym_exercises (coach_id, is_active, position, name);

create table if not exists public.seasons (
  id text primary key,
  coach_id text not null references public.coaches(id) on delete cascade,
  label text not null,
  week_one_start date not null,
  started_at timestamptz,
  finalized_at timestamptz,
  archive_payload jsonb,
  is_locked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (coach_id, label),
  check (char_length(trim(id)) > 0),
  check (char_length(trim(label)) > 0)
);

create index if not exists idx_seasons_coach on public.seasons (coach_id, is_locked, week_one_start);

create table if not exists public.coach_calendar_entries (
  id text primary key,
  coach_id text not null references public.coaches(id) on delete cascade,
  season_id text references public.seasons(id) on delete set null,
  week_number integer not null check (week_number > 0 and week_number < 200),
  day_index smallint not null check (day_index between 0 and 6),
  day_date date,
  slot text not null check (slot in ('am', 'pm', 'gym')),
  target_type text not null default 'all' check (target_type in ('all', 'group', 'athlete')),
  target_group_id text references public.groups(id) on delete set null,
  target_athlete_id text references public.athletes(id) on delete set null,
  title text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  position integer not null default 0,
  updated_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(trim(id)) > 0),
  check (char_length(trim(title)) > 0)
);

create index if not exists idx_coach_calendar_coach_day
  on public.coach_calendar_entries (coach_id, day_date, week_number, day_index, slot, position);
create index if not exists idx_coach_calendar_status
  on public.coach_calendar_entries (coach_id, status, week_number);
create index if not exists idx_coach_calendar_target
  on public.coach_calendar_entries (target_type, target_group_id, target_athlete_id);

create table if not exists public.athlete_calendar_entries (
  id text primary key,
  athlete_id text not null references public.athletes(id) on delete cascade,
  coach_entry_id text references public.coach_calendar_entries(id) on delete set null,
  season_id text references public.seasons(id) on delete set null,
  day_date date not null,
  week_number integer,
  slot text not null check (slot in ('am', 'pm', 'gym', 'competition')),
  source_type text not null check (source_type in ('group', 'personal', 'competition')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  completion_status text not null default 'none'
    check (completion_status in ('none', 'partial', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(trim(id)) > 0),
  check (char_length(trim(title)) > 0)
);

create index if not exists idx_athlete_calendar_athlete_day
  on public.athlete_calendar_entries (athlete_id, day_date, slot);
create index if not exists idx_athlete_calendar_completion
  on public.athlete_calendar_entries (athlete_id, completion_status, day_date);
create index if not exists idx_athlete_calendar_source
  on public.athlete_calendar_entries (source_type, coach_entry_id);

create or replace function public.tf_set_updated_at_relational()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists tg_coaches_updated_at on public.coaches;
create trigger tg_coaches_updated_at before update on public.coaches
for each row execute function public.tf_set_updated_at_relational();

drop trigger if exists tg_groups_updated_at on public.groups;
create trigger tg_groups_updated_at before update on public.groups
for each row execute function public.tf_set_updated_at_relational();

drop trigger if exists tg_athletes_updated_at on public.athletes;
create trigger tg_athletes_updated_at before update on public.athletes
for each row execute function public.tf_set_updated_at_relational();

drop trigger if exists tg_exercises_updated_at on public.gym_exercises;
create trigger tg_exercises_updated_at before update on public.gym_exercises
for each row execute function public.tf_set_updated_at_relational();

drop trigger if exists tg_seasons_updated_at_rel on public.seasons;
create trigger tg_seasons_updated_at_rel before update on public.seasons
for each row execute function public.tf_set_updated_at_relational();

drop trigger if exists tg_coach_calendar_updated_at on public.coach_calendar_entries;
create trigger tg_coach_calendar_updated_at before update on public.coach_calendar_entries
for each row execute function public.tf_set_updated_at_relational();

drop trigger if exists tg_athlete_calendar_updated_at on public.athlete_calendar_entries;
create trigger tg_athlete_calendar_updated_at before update on public.athlete_calendar_entries
for each row execute function public.tf_set_updated_at_relational();

create or replace function public.tf_block_locked_season_updates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_locked then
    raise exception 'Season % is locked and cannot be modified', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_block_locked_seasons on public.seasons;
create trigger tg_block_locked_seasons
before update on public.seasons
for each row
when (old.is_locked = true)
execute function public.tf_block_locked_season_updates();

create or replace function public.tf_is_coach_owner(p_coach_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.coaches c
    where c.id = p_coach_id
      and c.auth_user_id = auth.uid()
      and c.is_active = true
  );
$$;

create or replace function public.tf_is_any_coach()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.coaches c
    where c.auth_user_id = auth.uid()
      and c.is_active = true
  );
$$;

create or replace function public.tf_is_athlete_owner(p_athlete_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and a.auth_user_id = auth.uid()
      and a.is_active = true
  );
$$;

alter table public.coaches enable row level security;
alter table public.groups enable row level security;
alter table public.athletes enable row level security;
alter table public.gym_exercises enable row level security;
alter table public.seasons enable row level security;
alter table public.coach_calendar_entries enable row level security;
alter table public.athlete_calendar_entries enable row level security;

drop policy if exists coaches_self_manage on public.coaches;
create policy coaches_self_manage on public.coaches
for all to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

drop policy if exists groups_coach_manage on public.groups;
create policy groups_coach_manage on public.groups
for all to authenticated
using (public.tf_is_coach_owner(coach_id))
with check (public.tf_is_coach_owner(coach_id));

drop policy if exists athletes_coach_manage on public.athletes;
create policy athletes_coach_manage on public.athletes
for all to authenticated
using (public.tf_is_coach_owner(coach_id))
with check (public.tf_is_coach_owner(coach_id));

drop policy if exists athletes_self_read on public.athletes;
create policy athletes_self_read on public.athletes
for select to authenticated
using (public.tf_is_athlete_owner(id));

drop policy if exists exercises_coach_manage on public.gym_exercises;
create policy exercises_coach_manage on public.gym_exercises
for all to authenticated
using (public.tf_is_coach_owner(coach_id))
with check (public.tf_is_coach_owner(coach_id));

drop policy if exists seasons_coach_manage on public.seasons;
create policy seasons_coach_manage on public.seasons
for all to authenticated
using (public.tf_is_coach_owner(coach_id))
with check (public.tf_is_coach_owner(coach_id));

drop policy if exists coach_calendar_coach_manage on public.coach_calendar_entries;
create policy coach_calendar_coach_manage on public.coach_calendar_entries
for all to authenticated
using (public.tf_is_coach_owner(coach_id))
with check (public.tf_is_coach_owner(coach_id));

drop policy if exists coach_calendar_published_read on public.coach_calendar_entries;
create policy coach_calendar_published_read on public.coach_calendar_entries
for select to authenticated
using (status = 'published');

drop policy if exists athlete_calendar_coach_manage on public.athlete_calendar_entries;
create policy athlete_calendar_coach_manage on public.athlete_calendar_entries
for all to authenticated
using (
  exists (
    select 1
    from public.athletes a
    where a.id = athlete_calendar_entries.athlete_id
      and public.tf_is_coach_owner(a.coach_id)
  )
)
with check (
  exists (
    select 1
    from public.athletes a
    where a.id = athlete_calendar_entries.athlete_id
      and public.tf_is_coach_owner(a.coach_id)
  )
);

drop policy if exists athlete_calendar_self_manage on public.athlete_calendar_entries;
create policy athlete_calendar_self_manage on public.athlete_calendar_entries
for all to authenticated
using (public.tf_is_athlete_owner(athlete_id))
with check (public.tf_is_athlete_owner(athlete_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coach_calendar_entries'
  ) then
    alter publication supabase_realtime add table public.coach_calendar_entries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'athlete_calendar_entries'
  ) then
    alter publication supabase_realtime add table public.athlete_calendar_entries;
  end if;
exception
  when undefined_object then
    null;
end $$;
