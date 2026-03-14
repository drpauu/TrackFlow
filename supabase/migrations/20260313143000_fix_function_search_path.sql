-- Fix Supabase linter WARN: function_search_path_mutable
-- Compatible with PostgreSQL versions where ALTER FUNCTION does not support IF EXISTS.

do $$
begin
  if to_regprocedure('public.tg_set_updated_at()') is not null then
    execute $sql$alter function public.tg_set_updated_at() set search_path = ''$sql$;
  end if;
  if to_regprocedure('public.tg_app_kv_versioning()') is not null then
    execute $sql$alter function public.tg_app_kv_versioning() set search_path = ''$sql$;
  end if;
  if to_regprocedure('public.is_admin_user()') is not null then
    execute $sql$alter function public.is_admin_user() set search_path = ''$sql$;
  end if;

  if to_regprocedure('public.tf_set_updated_at_relational()') is not null then
    execute $sql$alter function public.tf_set_updated_at_relational() set search_path = ''$sql$;
  end if;
  if to_regprocedure('public.tf_block_locked_season_updates()') is not null then
    execute $sql$alter function public.tf_block_locked_season_updates() set search_path = ''$sql$;
  end if;
  if to_regprocedure('public.tf_is_coach_owner(text)') is not null then
    execute $sql$alter function public.tf_is_coach_owner(text) set search_path = ''$sql$;
  end if;
  if to_regprocedure('public.tf_is_any_coach()') is not null then
    execute $sql$alter function public.tf_is_any_coach() set search_path = ''$sql$;
  end if;
  if to_regprocedure('public.tf_is_athlete_owner(text)') is not null then
    execute $sql$alter function public.tf_is_athlete_owner(text) set search_path = ''$sql$;
  end if;
end $$;
