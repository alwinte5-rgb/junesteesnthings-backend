/* Files in Team chat (owner, 2026-10-14). Only this shop's Cloudinary, in the
   chat folder, with an allowed extension, is ever kept or shown. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../tools/lib/team-chat-files');

const cloud = 'jtees';
const url = (kind, name, folder = F.FOLDER, c = cloud) => `https://res.cloudinary.com/${c}/${kind}/upload/v1712345678/${folder}/${name}`;

test('a file in the chat folder of our own cloud is accepted', () => {
  assert.ok(F.fileUrlOk(url('image', 'abc_123.png'), cloud));
  assert.ok(F.fileUrlOk(url('raw', 'brief.pdf'), cloud));
  assert.ok(F.fileUrlOk(url('raw', 'logo.ai'), cloud));
});

test('anything else is refused', () => {
  assert.ok(!F.fileUrlOk(url('image', 'a.png', 'job_art'), cloud), 'another folder');
  assert.ok(!F.fileUrlOk(url('image', 'a.png', F.FOLDER, 'someoneelse'), cloud), 'another cloud');
  assert.ok(!F.fileUrlOk('https://evil.example/team_chat/a.png', cloud), 'another host');
  assert.ok(!F.fileUrlOk('http://res.cloudinary.com/jtees/image/upload/team_chat/a.png', cloud), 'not https');
  assert.ok(!F.fileUrlOk(url('raw', 'run.exe'), cloud), 'extension not allowed');
  assert.ok(!F.fileUrlOk(url('raw', 'a.html'), cloud), 'html is not allowed');
  assert.ok(!F.fileUrlOk(url('image', 'a.png') + '?x=<script>', cloud), 'trailing junk');
  assert.ok(!F.fileUrlOk(url('image', 'a.png'), ''), 'no cloud configured');
  assert.ok(!F.fileUrlOk(null, cloud));
  assert.ok(!F.fileUrlOk('x'.repeat(500), cloud));
});

test('the file a message shows: pictures as pictures, the rest as a named link', () => {
  assert.deepStrictEqual(F.fileOf({ file_url: url('image', 'p.jpg'), file_name: 'Front mockup.jpg' }, cloud),
    { url: url('image', 'p.jpg'), name: 'Front mockup.jpg', image: true });
  assert.strictEqual(F.fileOf({ file_url: url('raw', 'p.pdf'), file_name: 'Proof.pdf' }, cloud).image, false);
  assert.strictEqual(F.fileOf({ file_url: url('raw', 'p.png'), file_name: 'big.png' }, cloud).image, false,
    'a picture Cloudinary refused as an image went up raw and cannot be shown inline');
  assert.strictEqual(F.fileOf({ file_url: url('image', 'p.heic'), file_name: 'x' }, cloud).image, false, 'browsers cannot show HEIC');
  assert.strictEqual(F.fileOf({ file_url: url('raw', 'p.pdf'), file_name: '' }, cloud).name, 'File');
  assert.strictEqual(F.fileOf({ file_url: 'https://evil.example/a.png' }, cloud), null);
  assert.strictEqual(F.fileOf({ file_url: null }, cloud), null);
});

test('file names lose markup characters and control codes, and are capped', () => {
  assert.strictEqual(F.cleanName('<img src=x>.png'), 'img src=x.png');
  assert.strictEqual(F.cleanName('a\u0000b\nc.pdf'), 'abc.pdf');
  assert.strictEqual(F.cleanName('x'.repeat(300)).length, F.NAME_MAX);
});

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the signature route is signed in, and its folder is fixed by the server', () => {
  const at = src.indexOf("app.post('/admin/api/chat-file-signature'");
  assert.ok(at > 0, 'route exists');
  const body = src.slice(at, at + 700);
  assert.match(body, /requireAdmin/);
  assert.match(body, /api_sign_request\(\{ folder: CHATFILES\.FOLDER, timestamp \}/);
  assert.match(require('../tools/lib/staff').ROUTES['POST /admin/api/chat-file-signature'], /any/);
});

test('sending checks the file address before saving it', () => {
  const at = src.indexOf("app.post('/admin/team-chat', requireAdmin");
  const body = src.slice(at, at + 1500);
  assert.match(body, /CHATFILES\.fileUrlOk\(fileUrl, QPHOTOS\.cloudName\(\)\)/);
});
