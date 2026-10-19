export type UploadLinkStatus = 'active' | 'expired' | 'revoked';

export type UploadLinkState = {
  expires_at: string;
  revoked_at?: string | null;
};

export function getUploadLinkStatus(link: UploadLinkState, now = Date.now()): UploadLinkStatus {
  if (link.revoked_at) return 'revoked';
  const expiresAt = Date.parse(link.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now ? 'active' : 'expired';
}

export type ConversationNotificationPreference = {
  notifications_enabled?: boolean | null;
  muted_until?: string | null;
  muted_permanently?: boolean | null;
} | null;

export function isConversationMuted(preference: ConversationNotificationPreference, now = Date.now()): boolean {
  if (preference?.muted_permanently) return true;
  if (!preference?.muted_until) return false;
  const mutedUntil = Date.parse(preference.muted_until);
  return Number.isFinite(mutedUntil) && mutedUntil > now;
}

export function shouldNotifyConversation(preference: ConversationNotificationPreference, now = Date.now()): boolean {
  return preference?.notifications_enabled !== false && !isConversationMuted(preference, now);
}
