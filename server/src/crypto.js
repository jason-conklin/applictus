const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_LENGTH = 12;

function getKey() {
  const key = process.env.JOBTRACK_TOKEN_ENC_KEY;
  if (!key) {
    throw new Error('TOKEN_ENC_KEY_REQUIRED');
  }
  const buffer = Buffer.from(key, 'base64');
  if (buffer.length !== 32) {
    throw new Error('TOKEN_ENC_KEY_INVALID');
  }
  return buffer;
}

function encryptText(value) {
  if (!value) {
    return null;
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), ciphertext.toString('base64'), tag.toString('base64')].join(
    ':'
  );
}

function decryptText(payload) {
  if (!payload) {
    return null;
  }
  const [version, ivB64, cipherB64, tagB64] = payload.split(':');
  if (version !== VERSION) {
    throw new Error('TOKEN_ENC_VERSION_UNSUPPORTED');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

function isEncryptionReady() {
  try {
    getKey();
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  encryptText,
  decryptText,
  isEncryptionReady
};
