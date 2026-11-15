-- Use the caller's own friendship row for DM eligibility.
-- The friendships SELECT policy already restricts this lookup to a participant.
drop policy if exists "users create direct conversations with friends" on public.dm_conversations;
create policy "users create direct conversations with friends"
  on public.dm_conversations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and user_a < user_b
    and ((user_a = (select auth.uid())) or (user_b = (select auth.uid())))
    and exists (
      select 1
      from public.friendships f
      where f.user_a = least(dm_conversations.user_a, dm_conversations.user_b)
        and f.user_b = greatest(dm_conversations.user_a, dm_conversations.user_b)
    )
  );

drop function if exists private.are_friends(uuid, uuid);
