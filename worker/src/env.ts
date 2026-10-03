/// <reference types="@cloudflare/workers-types" />

/**
 * Worker bindings & secrets.
 *
 * All credentials are injected at runtime via Cloudflare Secrets (NOT stored in
 * code or D1). See README.md for the full secret list.
 */
export interface Env {
  /** D1 database binding. */
  DB: D1Database;

  // ----- Auth -----
  /** Single-admin login password. */
  ADMIN_PASSWORD: string;
  /** HMAC signing key for the session cookie (>= 32 random bytes recommended). */
  SESSION_SECRET: string;

  // ----- Notification channel credentials (Secrets) -----
  RESEND_API_KEY: string;
  TG_BOT_TOKEN: string;
  TG_CHAT_ID: string;
  PUSHPLUS_TOKEN: string;
  NOTIF_WEBHOOK_URL: string;
  WECOM_WEBHOOK_URL: string;

  // ----- .cn fallback WHOIS/availability API -----
  WHOIS_API_BASE: string;
  WHOIS_API_KEY: string;
}
