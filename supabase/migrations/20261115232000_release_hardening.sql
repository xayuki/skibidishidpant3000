-- XAYNET release hardening
-- Removes anonymous RPC access, protects the private admin registry,
-- restricts client updates to fields used by the app, and enables video uploads.

REVOKE EXECUTE ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;

ALTER TABLE private.xaynet_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins can read their own registry entry" ON private.xaynet_admins;
CREATE POLICY "admins can read their own registry entry"
  ON private.xaynet_admins
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON TABLE private.xaynet_admins FROM PUBLIC, anon, authenticated;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png','image/jpeg','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime',
  'application/pdf','text/plain'
]
WHERE id = 'chat-attachments';

REVOKE UPDATE ON TABLE public.messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE (content, edited_at, deleted_at) ON TABLE public.messages TO authenticated;
DROP POLICY IF EXISTS "authors edit their messages" ON public.messages;
CREATE POLICY "authors edit their messages"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    AND deleted_at IS NULL
    AND private.is_dm_member(conversation_id, (SELECT auth.uid()))
  )
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND private.is_dm_member(conversation_id, (SELECT auth.uid()))
  );

REVOKE UPDATE ON TABLE public.friend_requests FROM PUBLIC, anon, authenticated;
GRANT UPDATE (state, responded_at) ON TABLE public.friend_requests TO authenticated;

REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (handle, display_name, bio, avatar_path, banner_path, theme, updated_at)
  ON TABLE public.profiles TO authenticated;

REVOKE UPDATE ON TABLE public.user_notifications FROM PUBLIC, anon, authenticated;
GRANT UPDATE (read_at) ON TABLE public.user_notifications TO authenticated;

CREATE INDEX IF NOT EXISTS sitewide_announcement_created_by_idx
  ON public.sitewide_announcement(created_by);
CREATE INDEX IF NOT EXISTS sitewide_effects_created_by_idx
  ON public.sitewide_effects(created_by);
