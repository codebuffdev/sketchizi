-- Enable Postgres change events for shared architecture reviews.
-- Supabase Realtime must be enabled for the project; this migration adds the
-- table to the standard publication when that publication is available.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'architecture_review_collaborations'
     ) then
    alter publication supabase_realtime add table public.architecture_review_collaborations;
  end if;
end $$;
