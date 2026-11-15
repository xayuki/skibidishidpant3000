# Supabase setup

This repository is a static HTML/CSS/JavaScript app. Its backend lives in a dedicated Supabase project; do not connect it to the separate Xaynet project.

## Provisioning

1. Create a new Supabase project for this app (the dedicated project for this branch is already provisioned).
2. Apply every SQL migration in `supabase/migrations/` in filename order. The initial platform schema and foreign-key indexes are already applied to the dedicated project.
3. In Supabase Dashboard, open **Authentication → Providers → Email** and turn **Confirm email** off. This is required for password-only signup to return a session without asking the user to verify an email.
4. Keep password sign-in enabled and leaked-password protection enabled where available.
5. In **Realtime → Settings**, turn **Allow public access** off. The app uses private channels and relies on the RLS policies in this migration to protect typing, presence, and inbox subscriptions.
6. The dedicated project's URL and **publishable** key are already configured in `supabase-config.js`; update them only if the project or key is rotated.
7. Add the deployed website origin to Authentication's allowed URL list.

## Username-only account mapping

The browser normalizes the handle and derives `<handle>@accounts.xaynet.invalid`. Supabase Auth requires an email identifier for its email/password provider, so the app uses a reserved, non-deliverable .invalid address only as an internal identifier. This only works when Supabase's Confirm email setting is OFF; if it is on, Supabase tries to send a confirmation email and rejects the reserved domain. Users only enter a display name, handle, and password; the app does not collect or display an email.

The profile trigger stores the display name and handle. Handles are currently immutable because the handle is also the account's login identifier. Changing a handle safely needs a dedicated account-identity migration and should not be exposed as a normal profile edit.

Since there is no email address, there is no email-based password reset. Add a verified recovery method or recovery codes before opening registration to the public.

## Database and security

- All exposed application tables use row-level security.
- Direct messages are restricted to their two members.
- Typing and online presence use Realtime channels; messages, reactions, friend requests, read markers, and notifications are persisted.
- Attachments use a private bucket and conversation-scoped object paths.
- Only the publishable key belongs in browser code. Never put a service-role or secret key in `supabase-config.js`.

## Feature status

The schema/client layer covers profiles, friend requests and friendships, blocking data, one-to-one DMs, replies, reactions, read receipts, notifications, private message attachments, typing indicators, online presence, and the existing desktop/mobile layouts.

Voice/video calling is not yet implemented. The call control explains this rather than pretending a call has started; a production call feature needs a WebRTC media layer, signaling lifecycle, permissions, and connectivity testing.
