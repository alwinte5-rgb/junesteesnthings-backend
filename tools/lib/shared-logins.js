'use strict';

/* Shared logins, one view each (owner, 2026-10-16: "build the shared logins
 * box ... can we add the selfdestruct part. they dont need them constantly as
 * they should save them after use").
 *
 * The owner shares a login with one helper. It is kept encrypted (AES-256-GCM
 * under SHARED_LOGIN_KEY, a dedicated 32-byte hex secret on the server, never
 * a fallback) until the helper opens it once, or until it expires; either way
 * the sealed copy is erased and only who / which site / when is kept. The
 * helper saves it in their own password manager. Chat, email and texts stay
 * free of passwords.
 *
 * The share's id is the AES-GCM associated data, so a sealed value copied onto
 * another row does not open. */

const crypto = require('node:crypto');

const LIMITS = { site: 100, username: 200, password: 500, note: 300 };
/* How long a share waits to be opened. */
const EXPIRY = { '1h': { label: '1 hour', ms: 3600e3 }, '1d': { label: '1 day', ms: 86400e3 }, '3d': { label: '3 days', ms: 3 * 86400e3 } };
const DEFAULT_EXPIRY = '1d';

/** The 32-byte key from SHARED_LOGIN_KEY (64 hex characters), or null: then
 *  the feature is switched off and says so, rather than using a weaker key. */
function keyFrom(env = process.env) {
  const hex = String(env.SHARED_LOGIN_KEY || '').trim();
  return /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null;
}

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);

/** The form, cleaned: { site, username, password, note, expiry } or { error }. */
function fromForm(b) {
  const o = b && typeof b === 'object' ? b : {};
  const out = {
    site: clip(o.site, LIMITS.site).replace(/[\r\n]+/g, ' '),
    username: clip(o.username, LIMITS.username).replace(/[\r\n]+/g, ' '),
    /* A password is kept exactly as typed apart from control characters. */
    password: String(o.password == null ? '' : o.password).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, LIMITS.password),
    note: clip(o.note, LIMITS.note),
    expiry: Object.hasOwn(EXPIRY, String(o.expiry)) ? String(o.expiry) : DEFAULT_EXPIRY,
  };
  if (!out.site) return { error: 'Say which site or tool it is for.' };
  if (!out.password) return { error: 'Type the password to share.' };
  if (String(o.password || '').length > LIMITS.password) return { error: 'That password is too long.' };
  return out;
}

/** Sealed text "v1.<iv>.<tag>.<data>" (base64url) of { username, password }. */
function seal(secret, key, id) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(String(id)));
  const data = Buffer.concat([c.update(JSON.stringify({ u: secret.username || '', p: secret.password || '' }), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** { username, password } from a sealed value; throws on a wrong key, a
 *  tampered value or another row's value. */
function open(sealed, key, id) {
  const [v, iv, tag, data] = String(sealed || '').split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('not a sealed login');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(String(id)));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  const o = JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8'));
  return { username: String(o.u || ''), password: String(o.p || '') };
}

/** Where a share stands, for the owner's list. */
function statusOf(r, now = Date.now()) {
  if (r.viewed_at) return 'opened';
  if (r.cancelled_at) return 'cancelled';
  if (new Date(r.expires_at).getTime() <= now) return 'expired';
  return 'waiting';
}

module.exports = { LIMITS, EXPIRY, DEFAULT_EXPIRY, keyFrom, fromForm, seal, open, statusOf };
