import crypto from 'node:crypto';
import https from 'node:https';
import { logServiceFailure } from '../utils/service-error.js';

const base64url = (value) => Buffer.from(value).toString('base64url');
const fromBase64url = (value) => Buffer.from(String(value || ''), 'base64url');
const utf8 = (value) => Buffer.from(value, 'utf8');

function hkdfExtract(salt, inputKeyMaterial) {
  return crypto.createHmac('sha256', salt).update(inputKeyMaterial).digest();
}

function hkdfExpand(pseudorandomKey, info, length) {
  const blocks = [];
  let previous = Buffer.alloc(0);
  let generated = 0;
  for (let counter = 1; generated < length; counter += 1) {
    previous = crypto.createHmac('sha256', pseudorandomKey)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    blocks.push(previous);
    generated += previous.length;
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function loadVapidKeys() {
  const publicValue = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateValue = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicValue || !privateValue) return null;

  const publicBytes = fromBase64url(publicValue);
  const privateBytes = fromBase64url(privateValue);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error('Invalid VAPID key format.');
  }

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(publicBytes.subarray(1, 33)),
    y: base64url(publicBytes.subarray(33, 65)),
    d: base64url(privateBytes)
  };
  const privateKey = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const derivedPublic = crypto.createPublicKey(privateKey).export({ format: 'jwk' });
  if (derivedPublic.x !== jwk.x || derivedPublic.y !== jwk.y) {
    throw new Error('VAPID public/private keys do not match.');
  }

  return {
    publicKey: publicValue,
    privateKey,
    subject: String(process.env.VAPID_SUBJECT || 'mailto:notifications@zorona.com').trim()
  };
}

function signVapidToken(audience, keys) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64url(utf8(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: keys.subject
  })));
  const unsigned = header + '.' + claims;
  const signature = crypto.sign('sha256', utf8(unsigned), {
    key: keys.privateKey,
    dsaEncoding: 'ieee-p1363'
  });
  return unsigned + '.' + base64url(signature);
}

function encryptPayload(subscription, payload) {
  const clientPublicKey = fromBase64url(subscription.keys.p256dh);
  const authSecret = fromBase64url(subscription.keys.auth);
  if (clientPublicKey.length !== 65 || clientPublicKey[0] !== 4 || authSecret.length < 16 || authSecret.length > 32) {
    throw new Error('Invalid Web Push subscription encryption keys.');
  }

  const ecdh = crypto.createECDH('prime256v1');
  const ephemeralPublicKey = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(clientPublicKey);
  const keyInfo = Buffer.concat([
    utf8('WebPush: info\0'),
    clientPublicKey,
    ephemeralPublicKey
  ]);
  const inputKeyMaterial = hkdfExpand(hkdfExtract(authSecret, sharedSecret), keyInfo, 32);
  const salt = crypto.randomBytes(16);
  const contentKey = hkdfExpand(
    hkdfExtract(salt, inputKeyMaterial),
    utf8('Content-Encoding: aes128gcm\0'),
    16
  );
  const nonce = hkdfExpand(
    hkdfExtract(salt, inputKeyMaterial),
    utf8('Content-Encoding: nonce\0'),
    12
  );

  const plaintext = Buffer.concat([utf8(JSON.stringify(payload)), Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', contentKey, nonce, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(ephemeralPublicKey.length, 20);
  return Buffer.concat([header, ephemeralPublicKey, ciphertext]);
}

function postPush(endpoint, body, keys) {
  const target = new URL(endpoint);
  const host = target.hostname.toLowerCase();
  const supportedHost = host === 'fcm.googleapis.com' ||
    host === 'web.push.apple.com' ||
    host === 'notify.windows.com' ||
    host.endsWith('.notify.windows.com') ||
    host === 'push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com');
  if (target.protocol !== 'https:' || target.username || target.password || !supportedHost) {
    throw new Error('Web Push endpoint is not a supported HTTPS push service.');
  }

  const token = signVapidToken(target.origin, keys);
  return new Promise((resolve, reject) => {
    const request = https.request(target, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${token}, k=${keys.publicKey}`,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': body.length,
        TTL: '86400',
        Urgency: 'normal'
      },
      timeout: 10000
    }, (response) => {
      let responseText = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        if (responseText.length < 600) responseText += chunk;
      });
      response.on('end', () => resolve({
        status: Number(response.statusCode || 0),
        responseText,
        expired: response.statusCode === 404 || response.statusCode === 410
      }));
    });
    request.on('timeout', () => request.destroy(new Error('Web Push request timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}

export function createWebPushService({ listSubscriptions, removeSubscription }) {
  let cachedKeys = null;
  let checkedKeys = false;

  function keys() {
    if (checkedKeys) return cachedKeys;
    checkedKeys = true;
    try {
      cachedKeys = loadVapidKeys();
    } catch (error) {
      logServiceFailure(error, { service: 'push', operation: 'validate-vapid-config' });
      cachedKeys = null;
    }
    return cachedKeys;
  }

  async function sendOne(subscription, message, vapid) {
    try {
      const payload = {
        title: String(message.title || 'ZORONA').slice(0, 100),
        body: String(message.body || 'اكتشف الجديد في ZORONA.').slice(0, 240),
        url: typeof message.url === 'string' && message.url.startsWith('/') && !message.url.startsWith('//')
          ? message.url.slice(0, 180)
          : '/'
      };
      const body = encryptPayload({
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload);
      const result = await postPush(subscription.endpoint, body, vapid);
      if (result.expired) {
        await removeSubscription(subscription.endpoint);
        return { sent: false, expired: true };
      }
      return { sent: result.status >= 200 && result.status < 300, status: result.status };
    } catch (error) {
      logServiceFailure(error, { service: 'push', operation: 'send-notification' });
      return { sent: false, error: true };
    }
  }

  async function notifyAll(message) {
    const vapid = keys();
    if (!vapid) return { configured: false, sent: 0, failed: 0 };
    try {
      const subscriptions = await listSubscriptions();
      let sent = 0;
      let failed = 0;
      for (let offset = 0; offset < subscriptions.length; offset += 10) {
        const batch = subscriptions.slice(offset, offset + 10);
        const results = await Promise.all(batch.map(subscription => sendOne(subscription, message, vapid)));
        sent += results.filter(result => result.sent).length;
        failed += results.filter(result => !result.sent && !result.expired).length;
      }
      console.log(JSON.stringify({
        event: 'web_push_broadcast',
        sent,
        failed,
        expired: subscriptions.length - sent - failed
      }));
      return { configured: true, sent, failed };
    } catch (error) {
      logServiceFailure(error, { service: 'push', operation: 'broadcast' });
      return { configured: true, sent: 0, failed: 0, error: true };
    }
  }

  return {
    isConfigured: () => Boolean(keys()),
    publicKey: () => keys()?.publicKey || '',
    notifyAll
  };
}
