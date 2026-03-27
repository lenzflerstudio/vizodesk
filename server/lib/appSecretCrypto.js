const crypto = require('crypto');

const SALT = 'vizo:gmail-app-password:v1';

function deriveKey() {
  const secret = String(process.env.JWT_SECRET || 'vizodesk-dev-only');
  return crypto.createHash('sha256').update(`${secret}\0${SALT}`).digest();
}

/** @param {string} plain */
function encryptAppSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** @param {string|null|undefined} b64 */
function decryptAppSecret(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encryptAppSecret, decryptAppSecret };
