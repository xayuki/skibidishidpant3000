-- Prevent recursive RLS evaluation when validating message replies.
-- The helper is kept in the private schema and only returns true for a
-- parent message in a conversation the current authenticated user belongs to.

create or replace function private.reply_target_in_conversation(
  p_reply_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and private.is_dm_member(p_conversation_id, (select auth.uid()))
    and exists (
      select 1
      from public.messages parent
      where parent.id = p_reply_id
        and parent.conversation_id = p_conversation_id
    );
$function$;

revoke all on function private.reply_target_in_conversation(uuid, uuid) from public, anon;
grant execute on function private.reply_target_in_conversation(uuid, uuid) to authenticated;

drop policy if exists "dm members send messages" on public.messages;

create policy "dm members send messages"
on public.messages
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and private.is_dm_member(conversation_id, (select auth.uid()))
  and (
    reply_to is null
    or private.reply_target_in_conversation(reply_to, conversation_id)
  )
);
