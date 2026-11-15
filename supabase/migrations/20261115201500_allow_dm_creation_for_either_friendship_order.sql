-- Keep direct-message creation tied to an accepted friendship, regardless of
-- which order the friendship row was stored in.
drop policy if exists "users create direct conversations with friends" on public.dm_conversations;

create policy "users create direct conversations with friends"
on public.dm_conversations
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and user_a < user_b
  and (user_a = (select auth.uid()) or user_b = (select auth.uid()))
  and exists (
    select 1
    from public.friendships f
    where
      (f.user_a = dm_conversations.user_a and f.user_b = dm_conversations.user_b)
      or
      (f.user_a = dm_conversations.user_b and f.user_b = dm_conversations.user_a)
  )
);
