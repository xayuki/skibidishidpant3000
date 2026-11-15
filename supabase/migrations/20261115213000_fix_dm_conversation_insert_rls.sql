-- Evaluate friendship existence with a tightly scoped SECURITY DEFINER helper.
-- This avoids dm_conversations INSERT policy checks being filtered by the
-- friendships table's own RLS policy.
create or replace function private.are_friends(user_one uuid, user_two uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.friendships f
    where
      (f.user_a = user_one and f.user_b = user_two)
      or
      (f.user_a = user_two and f.user_b = user_one)
  );
$$;

revoke all on function private.are_friends(uuid, uuid) from public;
grant execute on function private.are_friends(uuid, uuid) to authenticated;

drop policy if exists "users create direct conversations with friends" on public.dm_conversations;

create policy "users create direct conversations with friends"
on public.dm_conversations
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and user_a < user_b
  and (user_a = (select auth.uid()) or user_b = (select auth.uid()))
  and private.are_friends(user_a, user_b)
);
