/* Files on an email from the job page (2026-10-06). Driven against the real
   Cloudinary files by ~/.local/share/jtees-e2e/run-attach.cjs (21 checks). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const MF = require('../tools/lib/message-files');
const C = 'demo';
const u = (folder, file, type = 'image') => `https://res.cloudinary.com/${C}/${type}/upload/v1/${folder}/${file}`;

test('only our Cloudinary, only the three folders, only artwork types', () => {
  assert.deepStrictEqual(MF.parse(u('job_messages', 'abc.pdf'), C),
    { folder: 'job_messages', ext: 'pdf', resourceType: 'image', publicId: 'job_messages/abc', format: 'pdf' });
  assert.deepStrictEqual(MF.parse(u('job_art', 'abc.zip', 'raw'), C),
    { folder: 'job_art', ext: 'zip', resourceType: 'raw', publicId: 'job_art/abc.zip', format: '' });
  assert.strictEqual(MF.parse(u('elsewhere', 'abc.pdf'), C), null);
  assert.strictEqual(MF.parse(u('job_messages', 'abc.exe'), C), null);
  assert.strictEqual(MF.parse(`https://res.cloudinary.com/other/image/upload/job_messages/abc.pdf`, C), null);
  assert.strictEqual(MF.parse('https://evil.example.com/job_messages/abc.pdf', C), null);
});

test('a customer\'s or designer\'s file only when it is on THIS job; uploads from the message folder', () => {
  const job = [{ url: u('quote_photos', 'mine.jpg'), name: 'Her logo.jpg' }];
  let r = MF.pickAttachments(JSON.stringify([{ url: u('quote_photos', 'mine.jpg'), name: 'renamed.exe' }, { url: u('job_messages', 'up.png'), name: 'proof' }]), job, C);
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.files.map((f) => f.name), ['Her logo.jpg', 'proof.png'], "the job's own name wins; an upload gets its extension");
  r = MF.pickAttachments(JSON.stringify([{ url: u('quote_photos', 'someone-else.jpg') }]), job, C);
  assert.strictEqual(r.error, 'bad');
  r = MF.pickAttachments(JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ url: u('job_messages', `f${i}.png`) }))), job, C);
  assert.strictEqual(r.error, 'too-many');
  assert.strictEqual(MF.pickAttachments('not json', job, C).error, 'bad');
  assert.strictEqual(MF.pickAttachments(JSON.stringify([{ url: u('job_messages', 'a.png') }, { url: u('job_messages', 'a.png') }]), [], C).files.length, 1, 'duplicates once');
});

test('Brevo carries small files; anything bigger goes by Resend', () => {
  const MB = 1024 * 1024;
  assert.strictEqual(MF.fitsBrevo([]), true);
  assert.strictEqual(MF.fitsBrevo([3 * MB, 3 * MB]), true);
  assert.strictEqual(MF.fitsBrevo([4 * MB]), false);
  assert.strictEqual(MF.fitsBrevo([3 * MB, 3 * MB, 3 * MB, 3 * MB, 3.4 * MB]), false);
});

test('pictures show in the email, resized; other files only attach', () => {
  assert.strictEqual(MF.previewUrl(u('quote_photos', 'a.png'), 'png'),
    `https://res.cloudinary.com/${C}/image/upload/c_limit,w_600,q_auto,f_jpg/v1/quote_photos/a.jpg`);
  assert.strictEqual(MF.previewUrl(u('quote_photos', 'a.pdf'), 'pdf'), '');
  assert.strictEqual(MF.previewUrl(u('job_art', 'a.png', 'raw'), 'png'), '');
});

test('server: files checked at send time, held messages keep them, every email records them', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /const picked = MSGFILES\.pickAttachments\(attachments, await jobFilesFor\(q\), QPHOTOS\.cloudName\(\)\);/);
  assert.match(src, /JSON\.stringify\(\{ channel, subject, text, attachments \}\)/);
  assert.match(src, /attachments: typeof p\.attachments === 'string' \? p\.attachments : '\[\]'/);
  assert.match(src, /INSERT INTO client_emails \(quote_code, kind, to_email, subject, preview, status, error, sent_by, attachments\)/);
  assert.match(src, /api_sign_request\(\{ folder: MSGFILES\.FOLDER, timestamp \}, apiSecret\)/);
});
