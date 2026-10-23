-- Shared architecture-review collaboration. Apply only after enabling Supabase Auth.
-- Membership rows are managed by trusted workspace-administration code; clients
-- must not be allowed to self-assign elevated roles.
create table if not exists public.architecture_review_workspace_members (
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'reviewer', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.architecture_review_collaborations (
  workspace_id uuid not null,
  review_id text not null check (length(review_id) between 1 and 180),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, review_id),
  constraint architecture_review_payload_id_matches check (payload->>'reviewId' = review_id)
);

create index if not exists architecture_review_collaborations_updated_idx
  on public.architecture_review_collaborations (workspace_id, updated_at desc);

create or replace function public.is_architecture_review_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.architecture_review_workspace_members m
    where m.workspace_id = target_workspace and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_architecture_review_workspace(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.architecture_review_workspace_members m
    where m.workspace_id = target_workspace and m.user_id = auth.uid()
      and m.role in ('owner', 'editor', 'reviewer')
  );
$$;

revoke all on function public.is_architecture_review_workspace_member(uuid) from public;
revoke all on function public.can_edit_architecture_review_workspace(uuid) from public;
grant execute on function public.is_architecture_review_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_architecture_review_workspace(uuid) to authenticated;

alter table public.architecture_review_workspace_members enable row level security;
alter table public.architecture_review_collaborations enable row level security;

-- Members can read the membership roster but cannot self-insert or change roles.
drop policy if exists architecture_review_members_read on public.architecture_review_workspace_members;
create policy architecture_review_members_read on public.architecture_review_workspace_members
  for select to authenticated using (public.is_architecture_review_workspace_member(workspace_id));

-- Workspace membership controls review visibility. Reviewer/editor/owner can write;
-- viewers are read-only. The workspace membership table must be provisioned by a
-- trusted server/admin path before a user can access a workspace.
drop policy if exists architecture_review_collaboration_read on public.architecture_review_collaborations;
create policy architecture_review_collaboration_read on public.architecture_review_collaborations
  for select to authenticated using (public.is_architecture_review_workspace_member(workspace_id));

drop policy if exists architecture_review_collaboration_insert on public.architecture_review_collaborations;
create policy architecture_review_collaboration_insert on public.architecture_review_collaborations
  for insert to authenticated with check (public.can_edit_architecture_review_workspace(workspace_id) and created_by = auth.uid() and updated_by = auth.uid());

drop policy if exists architecture_review_collaboration_update on public.architecture_review_collaborations;
create policy architecture_review_collaboration_update on public.architecture_review_collaborations
  for update to authenticated using (public.can_edit_architecture_review_workspace(workspace_id))
  with check (public.can_edit_architecture_review_workspace(workspace_id) and updated_by = auth.uid());

grant select on public.architecture_review_workspace_members to authenticated;
grant select, insert, update on public.architecture_review_collaborations to authenticated;

create or replace function public.touch_architecture_review_collaboration()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists architecture_review_collaboration_touch on public.architecture_review_collaborations;
create trigger architecture_review_collaboration_touch
  before update on public.architecture_review_collaborations
  for each row execute function public.touch_architecture_review_collaboration();
