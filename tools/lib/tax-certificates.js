'use strict';

/* Sales-tax exemption certificates — what one is, and when a sale needs one.

   Illinois taxes the RETAILER on gross receipts. An exempt sale still goes on
   the ST-1 as a receipt and is then deducted, and the deduction only holds if
   the shop can produce the buyer's certificate for that sale. Before this, the
   only evidence was a free-text box on the quote; the two exempt quotes in
   flight on 2026-09-28 held a single word each, not a certificate number, and
   nothing stopped a customer paying an untaxed quote with nothing on file.

   Two kinds cover the shop's exempt buyers:

     e_number  An Illinois tax-exempt organisation: school, church, charity,
               government. The Department of Revenue issues an exemption
               letter with the number (it starts with E) and an EXPIRY date.
     resale    A business buying to resell, on Form CRT-61, with its Illinois
               account ID or resale number. CRT-61 carries no expiry date of
               its own, so one is optional here.

   Shipping out of state is not an exemption and needs no certificate: the
   evidence is where it went, recorded as a note. The same for "other".

   The file is stored in Postgres, not on a CDN: a certificate carries a tax ID
   and a signature, and a public URL is the wrong place for either. */

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MIN_FILE_BYTES = 100;

const CERT_KINDS = {
  e_number: {
    label: 'Illinois tax-exempt organisation (E-number)',
    short: 'E-number',
    expiryRequired: true,
  },
  resale: {
    label: 'Resale (Form CRT-61)',
    short: 'Resale',
    expiryRequired: false,
  },
};

/* Why a quote charges no tax. Stored on the quote, because "untaxed" alone
   cannot say which line of the ST-1 the sale is deducted on, or what evidence
   it needs. */
const EXEMPT_REASONS = {
  e_number:     { label: 'Tax-exempt organisation (E-number)', certificate: true },
  resale:       { label: 'Bought for resale (CRT-61)',         certificate: true },
  out_of_state: { label: 'Shipped outside Illinois',           certificate: false },
  other:        { label: 'Other — say why',                    certificate: false },
};

const REVIEW_STATES = ['pending', 'approved', 'rejected'];

/** YYYY-MM-DD for a DATE column, a Date, or a string; '' when there is none. */
function isoDay(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    /* node-pg turns a DATE into local midnight. Read it back in local time, so
       the day that was stored is the day that comes out, whatever TZ the
       process runs in. */
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Today in the shop's timezone, as YYYY-MM-DD. */
function shopToday(now = new Date(), tz = 'America/Chicago') {
  return now.toLocaleDateString('en-CA', { timeZone: tz });
}

/** The file's real type, from its first bytes. Never from the name or the
 *  browser's claim: both are whatever the uploader says they are. */
function sniffFileType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** A certificate number as it should be stored, or an error a buyer can act on. */
function normaliseNumber(kind, raw) {
  const v = String(raw == null ? '' : raw).toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
  if (!v) return { error: 'Enter the number from the certificate.' };
  if (v.length > 30) return { error: 'That number is too long for a certificate number.' };
  if (kind === 'e_number') {
    const digits = v.replace(/\D/g, '').length;
    if (!/^E[0-9-]+$/.test(v) || digits < 8 || digits > 12) {
      return { error: 'An Illinois exemption number starts with E, followed by numbers. ' +
        'It is printed on the exemption letter from the Illinois Department of Revenue.' };
    }
    return { value: v };
  }
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(v) || v.replace(/[^A-Z0-9]/g, '').length < 4) {
    return { error: 'Enter the Illinois account ID or resale number from the certificate.' };
  }
  return { value: v };
}

/**
 * Check an uploaded certificate and turn it into what gets stored.
 *
 * `input` is what a form or the studio sends: kind, number, holder,
 * expires_on (YYYY-MM-DD), file_b64, file_name. Returns { cert } or
 * { error }, where the error is written for the buyer, not a developer.
 */
function validateCertificate(input, { today = shopToday() } = {}) {
  const b = input || {};
  const kind = String(b.kind || '').trim();
  if (!CERT_KINDS[kind]) return { error: 'Choose which kind of certificate this is.' };

  const num = normaliseNumber(kind, b.number);
  if (num.error) return { error: num.error };

  const holder = String(b.holder == null ? '' : b.holder)
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (holder.length < 2) return { error: 'Enter the organisation or business named on the certificate.' };
  if (holder.length > 120) return { error: 'That name is too long. Enter it as it appears on the certificate.' };

  let expires = '';
  const rawExpiry = String(b.expires_on == null ? '' : b.expires_on).trim();
  if (rawExpiry) {
    expires = isoDay(rawExpiry);
    const d = expires ? new Date(expires + 'T12:00:00Z') : null;
    if (!d || Number.isNaN(d.getTime()) || isoDay(d.toISOString()) !== expires) {
      return { error: 'Enter the expiry date as it appears on the certificate.' };
    }
    if (expires < today) return { error: 'That certificate has expired. Upload the current one.' };
  } else if (CERT_KINDS[kind].expiryRequired) {
    return { error: 'Enter the expiry date printed on the exemption letter.' };
  }

  const b64 = String(b.file_b64 == null ? '' : b.file_b64).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!b64) return { error: 'Attach the certificate: a PDF, or a clear photo of it.' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: 'That file did not arrive intact. Try attaching it again.' };
  const file = Buffer.from(b64, 'base64');
  if (file.length > MAX_FILE_BYTES) return { error: 'That file is larger than 8 MB. A photo or a PDF of the certificate is plenty.' };
  if (file.length < MIN_FILE_BYTES) return { error: 'That file is empty. Try attaching it again.' };
  const type = sniffFileType(file);
  if (!type) return { error: 'Attach the certificate as a PDF, JPG, PNG or WebP.' };

  const name = String(b.file_name == null ? '' : b.file_name)
    .split(/[\\/]/).pop().replace(/[^\w .()-]/g, '').trim().slice(0, 120)
    || `certificate.${type.split('/')[1].replace('jpeg', 'jpg')}`;

  return {
    cert: {
      kind, number: num.value, holder, expires_on: expires || null,
      file, file_type: type, file_name: name,
      file_sha256: require('crypto').createHash('sha256').update(file).digest('hex'),
    },
  };
}

/** Why a quote charges no tax, or null when it charges tax or nobody said. */
function exemptReasonOf(q) {
  const r = q && q.tax_exempt_reason;
  return r && EXEMPT_REASONS[r] ? r : null;
}

/**
 * Does this quote need a certificate on file before it can be paid?
 *
 * Only a quote the shop explicitly left UNtaxed (`taxable === false`). A quote
 * from before that flag existed (`taxable` NULL) is left alone: it was never
 * put to the question, and locking its balance would stop real money arriving
 * over a record nobody could have kept. It still shows as undocumented.
 *
 * An explicit exemption with no reason given is treated as needing one, which
 * is what an exemption usually is; the shop can say "shipped out of state"
 * instead and the lock lifts.
 */
function quoteNeedsCertificate(q) {
  if (!q || q.taxable !== false) return false;
  const r = exemptReasonOf(q);
  return r === null || EXEMPT_REASONS[r].certificate;
}

/** Whether a certificate can stand behind a sale today. */
function certificateUsable(cert, today = shopToday()) {
  if (!cert || cert.status === 'rejected') return false;
  const exp = isoDay(cert.expires_on);
  return !exp || exp >= today;
}

/** Card payment is refused, and the pay buttons hidden, while this is true. */
function quotePayLocked(q, cert, today = shopToday()) {
  return quoteNeedsCertificate(q) && !certificateUsable(cert, today);
}

/** Why a locked quote is locked, in the customer's terms. */
function lockReason(cert, today = shopToday()) {
  if (!cert) return 'missing';
  if (cert.status === 'rejected') return 'rejected';
  const exp = isoDay(cert.expires_on);
  if (exp && exp < today) return 'expired';
  return '';
}

/**
 * Has this exempt sale got its evidence? Used for the ST-1 deduction count.
 * Certificate reasons need a certificate that was not refused. Out of state
 * and "other" need the note saying where or why. A sale from before reasons
 * existed counts as documented if either kind of evidence is there.
 */
function exemptionDocumented(q, cert) {
  const note = String((q && q.tax_exempt_ref) || '').trim();
  const certOk = !!cert && cert.status !== 'rejected';
  const r = exemptReasonOf(q);
  if (r === null) return certOk || !!note;
  return EXEMPT_REASONS[r].certificate ? certOk : !!note;
}

/** "E-number E1234-5678 · Lincoln High School", for lists and exports. */
function certificateLabel(cert) {
  if (!cert) return '';
  const k = CERT_KINDS[cert.kind];
  return `${k ? k.short : cert.kind} ${cert.number}${cert.holder ? ' · ' + cert.holder : ''}`;
}

module.exports = {
  MAX_FILE_BYTES, CERT_KINDS, EXEMPT_REASONS, REVIEW_STATES,
  isoDay, shopToday, sniffFileType, normaliseNumber, validateCertificate,
  exemptReasonOf, quoteNeedsCertificate, certificateUsable, quotePayLocked, lockReason,
  exemptionDocumented, certificateLabel,
};
