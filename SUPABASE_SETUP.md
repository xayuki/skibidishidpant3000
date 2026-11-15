# Supabase setup

This repository is a static HTML/CSS/JavaScript app. The backend is intentionally isolated in its own Supabase project.

## Provisioning

1. Create a dedicated Supabase project for this app (do not point it at the separate Xaynet project).
2. Apply `supabase/migrations/20261115000000_initial_platform.sql`.
3. In Supabase Auth settings, disable **Confirm email**. Account registration is username/password only; the app maps the normalized handle to a reserved synthetic address under `.invalid` for Supabase Auth's required email/password provider. Users never enter or see an email address, and no email can be delivered to that reserved domain.
4. Enable password sign-in. Keep leaked-password protection enabled if available.
5. Copy the project URL and publishable key into `supabase-config.js`.
6. Add the deployed website origin to Auth's allowed URL list.

## Username-only account mapping

The browser normalizes the handle and derives `<handle>@accounts.xaynet.invalid`. It calls Supabase Auth with that internal identifier and the user's password. The database trigger creates a public profile from Auth metadata. No email input is part of the sign-up form. Since no email is collected, users cannot use an email reset flow; add recovery codes or a verified recovery method before production use.

## Database and security

- All application tables use RLS.
- Private direct messages are restricted to their two members.
- Typing indicators and presence are Realtime ephemeral messages; message history, reactions, requests, read markers, and notifications are persisted.
- Attachments use a private bucket and a conversation-scoped object path.
- Never put a service-role or secret key in the browser. Only the publishable key belongs in `supabase-config.js`.

## Feature coverage

The schema includes profiles, friend requests/friendships, blocks, one-to-one DM conversations, replies, reactions, read receipts, live notifications, private message attachments, ephemeral typing, and global presence. Voice/video call signaling and actual WebRTC calling require a later client media layer and should not be represented as working until that layer is implemented and tested.
