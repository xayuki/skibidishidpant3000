-- Cover remaining foreign-key lookups to keep deletes and joins efficient.
create index if not exists blocked_users_blocked_idx
  on public.blocked_users(blocked_id);
create index if not exists dm_conversations_created_by_idx
  on public.dm_conversations(created_by);
create index if not exists dm_read_states_user_idx
  on public.dm_read_states(user_id);
create index if not exists message_reactions_user_idx
  on public.message_reactions(user_id);
create index if not exists messages_reply_to_idx
  on public.messages(reply_to);
create index if not exists user_notifications_actor_idx
  on public.user_notifications(actor_id);
create index if not exists user_notifications_conversation_idx
  on public.user_notifications(conversation_id);
create index if not exists user_notifications_friend_request_idx
  on public.user_notifications(friend_request_id);
create index if not exists user_notifications_message_idx
  on public.user_notifications(message_id);
