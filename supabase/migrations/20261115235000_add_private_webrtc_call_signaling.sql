-- WebRTC signaling for private one-to-one voice and video calls.
create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('offer','answer','ice','hangup','reject','busy')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint call_signals_not_self check (sender_id <> recipient_id)
);
create index if not exists call_signals_recipient_created_idx
  on public.call_signals(recipient_id,created_at desc);
alter table public.call_signals enable row level security;
revoke all on public.call_signals from public,anon;
grant select,insert,delete on public.call_signals to authenticated;
drop policy if exists "call participants receive their signals" on public.call_signals;
create policy "call participants receive their signals"
  on public.call_signals for select to authenticated
  using (recipient_id=(select auth.uid()));
drop policy if exists "conversation members send call signals" on public.call_signals;
create policy "conversation members send call signals"
  on public.call_signals for insert to authenticated
  with check (
    sender_id=(select auth.uid())
    and recipient_id<>(select auth.uid())
    and private.is_dm_member(conversation_id,(select auth.uid()))
    and private.is_dm_member(conversation_id,recipient_id)
  );
drop policy if exists "call participants clear signals" on public.call_signals;
create policy "call participants clear signals"
  on public.call_signals for delete to authenticated
  using (sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));
alter publication supabase_realtime add table public.call_signals;
