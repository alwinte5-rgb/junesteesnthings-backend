'use strict';

/* Inbound texts from Twilio.

   Signature: Twilio signs base64(HMAC-SHA1(authToken, url + each POST param
   sorted by name as name+value)). The URL must be byte-for-byte the one set in
   the Twilio console, which is why server.js builds it from a fixed base rather
   than from request headers a proxy may rewrite.

   Keywords follow the carrier-standard lists. Twilio itself answers STOP/HELP/
   START on toll-free numbers; we only RECORD what the customer said, so our own
   consent log agrees with Twilio's block list. */

const crypto = require('node:crypto');

function twilioSignature(authToken, url, params) {
  const data = Object.keys(params || {}).sort().reduce((acc, k) => acc + k + String(params[k]), url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

function verifyTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const a = Buffer.from(twilioSignature(authToken, url, params));
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];
const START_WORDS = ['START', 'UNSTOP', 'YES', 'SUBSCRIBE'];
const HELP_WORDS = ['HELP', 'INFO'];

// 'stop' | 'start' | 'help' | 'message'
function classifyInbound(text) {
  const w = String(text || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (STOP_WORDS.includes(w)) return 'stop';
  if (START_WORDS.includes(w)) return 'start';
  if (HELP_WORDS.includes(w)) return 'help';
  return 'message';
}

module.exports = { twilioSignature, verifyTwilioSignature, classifyInbound };
