import { randomBytes } from 'node:crypto';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(now, len) {
  let out = '';
  for (let i = len - 1; i >= 0; i--) {
    out = B32[now % 32] + out;
    now = Math.floor(now / 32);
  }
  return out;
}

function encodeRandom(len) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += B32[bytes[i] % 32];
  return out;
}

/** Lexicographically sortable 26-char id (ULID shape). */
export function ulid() {
  return encodeTime(Date.now(), 10) + encodeRandom(16);
}

export const isUlid = (v) => typeof v === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(v);

/** Opaque, unguessable share token. */
export function shareToken() {
  return randomBytes(24).toString('base64url');
}

export const isToken = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
