-- Xaynet / standalone Discord-style backend
-- Apply to a fresh Supabase project. All public tables use RLS.

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null,
  display_name text not null,
  avatar_path text,
  banner_path text,
  bio text not null default '',
  status_text text not null default '',
  presence text not null default 'offline' check (presence in ('online','idle','dnd','invisible','offline')),
  theme jsonb not null default '{"mode":"oled","color1":"#111111","color2":"#343434","angle":135}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create unique index if not exists profiles_handle_lower_uidx on public.profiles (lower(handle));
create index if not exists profiles_display_name_idx on public.profiles (lower(display_name));

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (sender_id <> receiver_id)
);
create unique index if not exists friend_requests_one_pending_uidx
  on public.friend_requests(sender_id, receiver_id) where state = 'pending';
create index if not exists friend_requests_receiver_pending_idx
  on public.friend_requests(receiver_id, created_at desc) where state = 'pending';
create index if not exists friend_requests_sender_pending_idx
  on public.friend_requests(sender_id, created_at desc) where state = 'pending';

create table if not exists public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_canonical_order check (user_a < user_b)
);
create index if not exists friendships_user_b_idx on public.friendships(user_b, user_a);

create table if not exists public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind = 'direct'),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint dm_conversations_canonical_order check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists dm_conversations_user_a_idx on public.dm_conversations(user_a, created_at desc);
create index if not exists dm_conversations_user_b_idx on public.dm_conversations(user_b, created_at desc);

create table if not exists public.dm_members (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists dm_members_user_idx on public.dm_members(user_id, conversation_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  reply_to uuid references public.messages(id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_nonempty check (char_length(trim(content)) > 0 or jsonb_array_length(attachments) > 0),
  constraint messages_content_limit check (char_length(content) <= 4000)
);
create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at desc, id desc);
create index if not exists messages_author_created_idx on public.messages(author_id, created_at desc);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists message_reactions_message_idx on public.message_reactions(message_id);

create table if not exists public.dm_read_states (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default 'epoch',
  primary key (conversation_id, user_id)
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('friend_request','friend_accepted','dm_message')),
  friend_request_id uuid references public.friend_requests(id) on delete cascade,
  conversation_id uuid references public.dm_conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists user_notifications_inbox_idx
  on public.user_notifications(recipient_id, created_at desc) where read_at is null;
create index if not exists user_notifications_history_idx
  on public.user_notifications(recipient_id, created_at desc);

-- Internal membership helper. Kept in a non-exposed schema.
create or replace function private.is_dm_member(p_conversation uuid, p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dm_members m
    where m.conversation_id = p_conversation and m.user_id = p_user
  );
$$;
revoke all on function private.is_dm_member(uuid, uuid) from public, anon;
grant execute on function private.is_dm_member(uuid, uuid) to authenticated;

create or replace function private.are_friends(p_user_a uuid, p_user_b uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where (f.user_a = least(p_user_a,p_user_b) and f.user_b = greatest(p_user_a,p_user_b))
  );
$$;
revoke all on function private.are_friends(uuid, uuid) from public, anon;
grant execute on function private.are_friends(uuid, uuid) to authenticated;

-- Create a profile automatically when Supabase Auth creates an account.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_handle text := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)));
  v_display text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), v_handle);
begin
  if v_handle !~ '^[a-z0-9][a-z0-9_.]{2,23}$' then
    raise exception 'Handle must be 3-24 characters using lowercase letters, numbers, underscores, or periods';
  end if;
  insert into public.profiles(id, handle, display_name)
  values (new.id, v_handle, left(v_display, 40));
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Add the two conversation members atomically whenever a DM is created.
create or replace function private.add_dm_members()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.dm_members(conversation_id, user_id)
  values (new.id, new.user_a), (new.id, new.user_b)
  on conflict do nothing;
  insert into public.dm_read_states(conversation_id, user_id)
  values (new.id, new.user_a), (new.id, new.user_b)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.add_dm_members() from public, anon, authenticated;
drop trigger if exists on_dm_conversation_created_members on public.dm_conversations;
create trigger on_dm_conversation_created_members
  after insert on public.dm_conversations
  for each row execute function private.add_dm_members();

-- Accepting a request creates the canonical friendship and notifies the sender.
create or replace function private.on_friend_request_updated()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.state = 'pending' and new.state = 'accepted' then
    insert into public.friendships(user_a, user_b)
    values (least(new.sender_id,new.receiver_id), greatest(new.sender_id,new.receiver_id))
    on conflict do nothing;
    insert into public.user_notifications(recipient_id, actor_id, kind, friend_request_id)
    values (new.sender_id, new.receiver_id, 'friend_accepted', new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.on_friend_request_updated() from public, anon, authenticated;
drop trigger if exists on_friend_request_accepted on public.friend_requests;
create trigger on_friend_request_accepted
  after update of state on public.friend_requests
  for each row execute function private.on_friend_request_updated();

create or replace function private.notify_friend_request()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.user_notifications(recipient_id, actor_id, kind, friend_request_id)
  values (new.receiver_id, new.sender_id, 'friend_request', new.id);
  return new;
end;
$$;
revoke all on function private.notify_friend_request() from public, anon, authenticated;
drop trigger if exists on_friend_request_created_notification on public.friend_requests;
create trigger on_friend_request_created_notification
  after insert on public.friend_requests
  for each row execute function private.notify_friend_request();

create or replace function private.notify_dm_members()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.user_notifications(recipient_id, actor_id, kind, conversation_id, message_id)
  select m.user_id, new.author_id, 'dm_message', new.conversation_id, new.id
  from public.dm_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.author_id;
  return new;
end;
$$;
revoke all on function private.notify_dm_members() from public, anon, authenticated;
drop trigger if exists on_dm_message_notification on public.messages;
create trigger on_dm_message_notification
  after insert on public.messages
  for each row execute function private.notify_dm_members();

-- RLS for all user-facing records.
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.blocked_users enable row level security;
alter table public.dm_conversations enable row level security;
alter table public.dm_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.dm_read_states enable row level security;
alter table public.user_notifications enable row level security;

create policy "signed in users can view profiles"
  on public.profiles for select to authenticated using (true);
create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "participants view friend requests"
  on public.friend_requests for select to authenticated
  using (sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));
create policy "users send friend requests"
  on public.friend_requests for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and state = 'pending'
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = receiver_id)
         or (b.blocker_id = receiver_id and b.blocked_id = (select auth.uid()))
    )
    and not exists (
      select 1 from public.friendships f
      where f.user_a = least((select auth.uid()), receiver_id)
        and f.user_b = greatest((select auth.uid()), receiver_id)
    )
  );
create policy "receivers respond to pending requests"
  on public.friend_requests for update to authenticated
  using (receiver_id = (select auth.uid()) and state = 'pending')
  with check (receiver_id = (select auth.uid()) and state in ('accepted','declined'));
create policy "senders cancel pending requests"
  on public.friend_requests for delete to authenticated
  using (sender_id = (select auth.uid()) and state = 'pending');

create policy "friends visible to participants"
  on public.friendships for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));
create policy "users remove their friendships"
  on public.friendships for delete to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

create policy "users see their blocks"
  on public.blocked_users for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "users block accounts"
  on public.blocked_users for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy "users unblock accounts"
  on public.blocked_users for delete to authenticated
  using (blocker_id = (select auth.uid()));

create policy "users create direct conversations with friends"
  on public.dm_conversations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and user_a < user_b
    and ((user_a = (select auth.uid())) or (user_b = (select auth.uid())))
    and private.are_friends(user_a, user_b)
  );
create policy "dm members can see their conversations"
  on public.dm_conversations for select to authenticated
  using (private.is_dm_member(id, (select auth.uid())));
create policy "dm members can see membership"
  on public.dm_members for select to authenticated
  using (private.is_dm_member(conversation_id, (select auth.uid())));

create policy "dm members read messages"
  on public.messages for select to authenticated
  using (private.is_dm_member(conversation_id, (select auth.uid())));
create policy "dm members send messages"
  on public.messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.is_dm_member(conversation_id, (select auth.uid()))
    and (reply_to is null or exists (
      select 1 from public.messages parent
      where parent.id = reply_to and parent.conversation_id = messages.conversation_id
    ))
  );
create policy "authors edit their messages"
  on public.messages for update to authenticated
  using (author_id = (select auth.uid()) and deleted_at is null)
  with check (author_id = (select auth.uid()));

create policy "members read reactions for visible messages"
  on public.message_reactions for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id and private.is_dm_member(m.conversation_id, (select auth.uid()))
  ));
create policy "members add their own reactions"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id and private.is_dm_member(m.conversation_id, (select auth.uid()))
    )
  );
create policy "users remove their own reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "dm members see read states"
  on public.dm_read_states for select to authenticated
  using (private.is_dm_member(conversation_id, (select auth.uid())));
create policy "users update their own read states"
  on public.dm_read_states for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_dm_member(conversation_id, (select auth.uid())));
create policy "users advance their own read states"
  on public.dm_read_states for update to authenticated
  using (user_id = (select auth.uid()) and private.is_dm_member(conversation_id, (select auth.uid())))
  with check (user_id = (select auth.uid()) and private.is_dm_member(conversation_id, (select auth.uid())));

create policy "users read their notifications"
  on public.user_notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "users mark their notifications read"
  on public.user_notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
create policy "users delete their notifications"
  on public.user_notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- Private file storage. Object paths are <conversation-uuid>/<random-name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 15728640,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain'])
on conflict (id) do nothing;

create policy "dm members upload their attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and private.is_dm_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
  );
create policy "dm members download their attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and private.is_dm_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
  );
create policy "uploaders delete their attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-attachments' and owner_id = (select auth.uid())::text);

-- Realtime access: DM typing is ephemeral; global presence is available to signed-in clients.
create policy "dm members receive typing broadcasts"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'dm:%'
    and private.is_dm_member(split_part(realtime.topic(), ':', 2)::uuid, (select auth.uid()))
  );
create policy "dm members send typing broadcasts"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'dm:%'
    and private.is_dm_member(split_part(realtime.topic(), ':', 2)::uuid, (select auth.uid()))
  );
create policy "signed in users read global presence"
  on realtime.messages for select to authenticated
  using (realtime.topic() = 'presence:global');
create policy "signed in users publish global presence"
  on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'presence:global');

-- Enable database change feeds for the UI's durable data.
do $$
declare
  t text;
begin
  foreach t in array array['profiles','friend_requests','friendships','dm_conversations','messages','message_reactions','dm_read_states','user_notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.friend_requests, public.friendships, public.blocked_users,
  public.dm_conversations, public.dm_members, public.messages, public.message_reactions,
  public.dm_read_states, public.user_notifications
to authenticated;

-- Prevent tampering with request participants or message identity during updates.
alter table public.profiles
  add constraint profiles_handle_format check (handle ~ '^[a-z0-9][a-z0-9_.]{2,23}$'),
  add constraint profiles_display_name_length check (char_length(trim(display_name)) between 1 and 40);

create or replace function private.guard_friend_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sender_id <> old.sender_id or new.receiver_id <> old.receiver_id then
    raise exception 'friend request participants are immutable';
  end if;
  if old.state <> 'pending' or new.state not in ('accepted','declined') then
    raise exception 'invalid friend request transition';
  end if;
  if (select auth.uid()) <> old.receiver_id then
    raise exception 'only the receiver can respond';
  end if;
  new.responded_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function private.guard_friend_request_update() from public, anon, authenticated;
drop trigger if exists guard_friend_request_update on public.friend_requests;
create trigger guard_friend_request_update
  before update of state, sender_id, receiver_id on public.friend_requests
  for each row execute function private.guard_friend_request_update();

create or replace function private.guard_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.conversation_id <> old.conversation_id
     or new.author_id <> old.author_id
     or new.created_at <> old.created_at then
    raise exception 'message identity is immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_message_update() from public, anon, authenticated;
drop trigger if exists guard_message_update on public.messages;
create trigger guard_message_update
  before update on public.messages
  for each row execute function private.guard_message_update();

create or replace function private.guard_notification_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recipient_id <> old.recipient_id or new.actor_id is distinct from old.actor_id
     or new.kind <> old.kind or new.friend_request_id is distinct from old.friend_request_id
     or new.conversation_id is distinct from old.conversation_id
     or new.message_id is distinct from old.message_id
     or new.created_at <> old.created_at then
    raise exception 'notification data is immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_notification_update() from public, anon, authenticated;
drop trigger if exists guard_notification_update on public.user_notifications;
create trigger guard_notification_update
  before update on public.user_notifications
  for each row execute function private.guard_notification_update();

-- Public avatar media is read-only to visitors; writes are scoped to the owner's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "users upload their own profile media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users update their own profile media"
  on storage.objects for update to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users delete their own profile media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Private helper access for the RLS policies above.
grant usage on schema private to authenticated;

create or replace function private.is_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocked_users b
    where (b.blocker_id=p_user_a and b.blocked_id=p_user_b)
       or (b.blocker_id=p_user_b and b.blocked_id=p_user_a)
  );
$$;
revoke all on function private.is_blocked(uuid, uuid) from public, anon;
grant execute on function private.is_blocked(uuid, uuid) to authenticated;

drop policy if exists "users send friend requests" on public.friend_requests;
create policy "users send friend requests"
  on public.friend_requests for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and state = 'pending'
    and not private.is_blocked((select auth.uid()), receiver_id)
    and not exists (
      select 1 from public.friendships f
      where f.user_a = least((select auth.uid()), receiver_id)
        and f.user_b = greatest((select auth.uid()), receiver_id)
    )
  );

create policy "users access their own private inbox channel"
  on realtime.messages for select to authenticated
  using (realtime.topic() = 'inbox:' || (select auth.uid())::text);
create policy "users publish to their own private inbox channel"
  on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'inbox:' || (select auth.uid())::text);
