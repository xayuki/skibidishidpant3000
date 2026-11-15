-- Create direct conversations through a narrowly scoped SECURITY DEFINER RPC.
-- This avoids the client INSERT policy path while preserving explicit friendship checks.
create or replace function public.create_direct_conversation(peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  first_user uuid;
  second_user uuid;
  conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if peer_id is null or peer_id = current_user_id then
    raise exception 'Invalid conversation participant';
  end if;

  if not private.are_friends(current_user_id, peer_id) then
    raise exception 'You can only message accepted friends';
  end if;

  first_user := least(current_user_id, peer_id);
  second_user := greatest(current_user_id, peer_id);

  insert into public.dm_conversations(user_a, user_b, created_by)
  values (first_user, second_user, current_user_id)
  on conflict (user_a, user_b) do nothing;

  select id into conversation_id
  from public.dm_conversations
  where user_a = first_user and user_b = second_user
  limit 1;

  if conversation_id is null then
    raise exception 'Could not create conversation';
  end if;

  return conversation_id;
end;
$$;

revoke all on function public.create_direct_conversation(uuid) from public;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
