import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getUploadLinkStatus, isConversationMuted, shouldNotifyConversation } from '../lib/avenmedia-policy';

const now = Date.parse('2026-01-01T00:00:00.000Z');
const enterpriseMigration = readFileSync(new URL('../supabase/migrations/20261017_avenmedia_chat_enterprise.sql', import.meta.url), 'utf8');

describe('Avenmedia upload-link and chat policies', () => {
  it('distinguishes active, expired, invalid-expiry, and revoked links', () => {
    expect(getUploadLinkStatus({ expires_at: '2026-01-01T00:00:01.000Z' }, now)).toBe('active');
    expect(getUploadLinkStatus({ expires_at: '2025-12-31T23:59:59.000Z' }, now)).toBe('expired');
    expect(getUploadLinkStatus({ expires_at: 'not-a-date' }, now)).toBe('expired');
    expect(getUploadLinkStatus({ expires_at: '2026-01-02T00:00:00.000Z', revoked_at: '2026-01-01T00:00:00.000Z' }, now)).toBe('revoked');
  });

  it('allows notifications by default, but respects disabled, timed, and permanent mutes', () => {
    expect(shouldNotifyConversation(null, now)).toBe(true);
    expect(shouldNotifyConversation({ notifications_enabled: false }, now)).toBe(false);
    expect(isConversationMuted({ muted_until: '2026-01-01T00:00:01.000Z' }, now)).toBe(true);
    expect(isConversationMuted({ muted_until: '2026-01-01T00:00:00.000Z' }, now)).toBe(false);
    expect(isConversationMuted({ muted_until: 'invalid' }, now)).toBe(false);
    expect(isConversationMuted({ muted_permanently: true }, now)).toBe(true);
    expect(shouldNotifyConversation({ notifications_enabled: true, muted_permanently: true }, now)).toBe(false);
  });

  it('keeps message reads member-only and does not leave baseline all-actions membership policies', () => {
    expect(enterpriseMigration).toMatch(/CREATE POLICY conversations_member_read ON public\.conversations FOR SELECT TO authenticated\s+USING \(public\.is_conversation_member\(id\)\);/);
    expect(enterpriseMigration).toMatch(/CREATE POLICY conversation_messages_member_read ON public\.conversation_messages FOR SELECT TO authenticated\s+USING \(public\.is_conversation_member\(conversation_id\)\);/);
    expect(enterpriseMigration).toContain('DROP POLICY IF EXISTS conversation_members_write ON public.conversation_members;');
    expect(enterpriseMigration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.conversation_members FROM authenticated;');
    expect(enterpriseMigration).toContain('CREATE POLICY media_shares_member_read ON public.media_shares FOR SELECT TO authenticated\n  USING (public.is_conversation_member(conversation_id));');
    expect(enterpriseMigration).toContain('CREATE POLICY client_uploads_shared_chat_read ON public.client_uploads FOR SELECT TO authenticated');
  });
});
