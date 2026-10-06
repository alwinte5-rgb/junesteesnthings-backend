/* Customer artwork downloads (2026-10-06): PDFs would not open from the job
   page (Cloudinary refuses their delivery URL on this account) and there was
   no way to take every file at once. Driven against the real account by
   ~/.local/share/jtees-e2e/run-artdl.cjs (20 checks). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { PassThrough } = require('node:stream');
const ZIP = require('../tools/lib/zip-stream');
const QP = require('../tools/lib/quote-photos');

test('crc32 matches the standard check value', () => {
  assert.strictEqual(ZIP.crc32(Buffer.from('123456789')), 0xcbf43926);
  /* Fed in pieces, the same answer. */
  assert.strictEqual(ZIP.crc32(Buffer.from('6789'), ZIP.crc32(Buffer.from('12345'))), 0xcbf43926);
});

/* Reads a zip back by its central directory, the way an unzipper does. */
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > -1, 'end of central directory');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    assert.strictEqual(buf.readUInt32LE(p), 0x02014b50);
    const crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), at = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(at + 26);
    const data = buf.slice(at + 30 + lnlen, at + 30 + lnlen + size);
    files.push({ name, crc, data });
    p += 46 + nlen;
  }
  return files;
}

test('a streamed zip holds every file exactly, under its own name', async () => {
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (c) => chunks.push(c));
  const done = new Promise((r) => out.on('end', r));
  const zip = ZIP.zipWriter(out);
  const big = Buffer.alloc(300000, 7);
  async function* parts(b) { for (let i = 0; i < b.length; i += 65536) yield b.slice(i, i + 65536); }
  await zip.add('job/Team logo.pdf', parts(Buffer.from('%PDF-1.7 hello')));
  await zip.add('job/face 1.jpg', parts(big));
  await zip.add('job/émoji ✓.png', parts(Buffer.alloc(0)));
  await zip.finish();
  await done;
  const files = readZip(Buffer.concat(chunks));
  assert.deepStrictEqual(files.map((f) => f.name), ['job/Team logo.pdf', 'job/face 1.jpg', 'job/émoji ✓.png']);
  assert.strictEqual(files[0].data.toString(), '%PDF-1.7 hello');
  assert.ok(files[1].data.equals(big));
  for (const f of files) assert.strictEqual(f.crc, zlib.crc32 ? zlib.crc32(f.data) : ZIP.crc32(f.data));
});

test('names in one zip are unique and safe', () => {
  const n = ZIP.uniqueNames();
  assert.deepStrictEqual(['face.jpg', 'Face.JPG', 'face.jpg', 'a/b:c.png', ''].map(n),
    ['face.jpg', 'Face (2).JPG', 'face (3).jpg', 'a_b_c.png', 'file']);
});

test('the original comes from the download API; the name is the customer\'s, with its extension', () => {
  const cloud = 'demo';
  assert.deepStrictEqual(QP.downloadSource(`https://res.cloudinary.com/demo/image/upload/v1/quote_photos/abc123.pdf`, cloud),
    { resourceType: 'image', publicId: 'quote_photos/abc123', format: 'pdf' });
  assert.deepStrictEqual(QP.downloadSource(`https://res.cloudinary.com/demo/raw/upload/v9/quote_photos/abc123.dst`, cloud),
    { resourceType: 'raw', publicId: 'quote_photos/abc123.dst', format: '' });
  assert.strictEqual(QP.downloadSource('https://res.cloudinary.com/other/image/upload/quote_photos/x.pdf', cloud), null);
  assert.strictEqual(QP.downloadSource('https://evil.example.com/quote_photos/x.pdf', cloud), null);
  assert.strictEqual(QP.downloadName({ name: 'Team logo', ext: 'pdf' }), 'Team logo.pdf');
  assert.strictEqual(QP.downloadName({ name: 'face.JPG', ext: 'jpg' }), 'face.JPG');
  assert.strictEqual(QP.downloadName({ name: '../../etc/x', ext: 'png' }), '.._.._etc_x.png');
});

test('server: downloads are the job page\'s and the designer\'s own, signed in, never an inline SVG', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const r of ["app.get('/admin/production/:code/artwork/:n', requireAdmin, artworkFile('production'))",
    "app.get('/admin/production/:code/artwork.zip', requireAdmin, artworkZip('production'))",
    "app.get('/admin/design/:code/artwork/:n', requireAdmin, artworkFile('design'))",
    "app.get('/admin/design/:code/artwork.zip', requireAdmin, artworkZip('design'))"]) assert.ok(src.includes(r), r);
  /* A designer only reaches a job that is theirs. */
  assert.match(src, /if \(kind === 'design'\) return designJobFor\(code, currentActor\(\)\);/);
  assert.match(src, /cloudinary\.utils\.private_download_url\(src\.publicId, src\.format,/);
  assert.match(src, /\['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'\]\.includes\(photo\.ext\)/);
  /* Every file is reached before the zip starts. */
  const z = src.slice(src.indexOf('const artworkZip'));
  assert.ok(z.indexOf('for (const p of photos) opened.push(await openArtwork(p));') < z.indexOf("res.set('Content-Type', 'application/zip')"));
});
