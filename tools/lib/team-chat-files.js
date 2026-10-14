'use strict';

/* Files sent in Team chat (owner, 2026-10-14: "send files to each other
   through the chat"). The browser uploads straight to Cloudinary with a
   signature from /admin/api/chat-file-signature, into FOLDER, then sends the
   message with the file's address. The server keeps only addresses that are
   this shop's Cloudinary, in FOLDER, with an allowed extension, so a message
   can never link somewhere else. Kept apart from the SQL so it can be tested. */

const FOLDER = 'team_chat';
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
const EXTS = [...IMAGE_EXTS, 'pdf', 'ai', 'eps', 'svg', 'psd', 'tif', 'tiff', 'dst', 'pes', 'emb', 'exp',
  'zip', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'mp4', 'mov'];
const ACCEPT = EXTS.map((e) => '.' + e).join(',');
const NAME_MAX = 120;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** { type, ext } for a chat file this shop's Cloudinary holds, or null. */
function parse(url, cloud) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return null;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/(image|raw)/upload/(?:v\\d+/)?' + FOLDER + '/[A-Za-z0-9_-]{1,120}\\.([A-Za-z0-9]{2,5})$').exec(url);
  if (!m) return null;
  const ext = m[2].toLowerCase();
  return EXTS.includes(ext) ? { type: m[1], ext } : null;
}
function fileUrlOk(url, cloud) { return !!parse(url, cloud); }

/** The name shown for the file: one line, no markup characters, capped. */
function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NAME_MAX);
}

/** What a message row shows for its file, or null for none (or one that no
 *  longer passes the address check). Images show as a picture. */
function fileOf(row, cloud) {
  const p = row && row.file_url ? parse(row.file_url, cloud) : null;
  if (!p) return null;
  return { url: row.file_url, name: cleanName(row.file_name) || 'File',
    image: p.type === 'image' && IMAGE_EXTS.includes(p.ext) && !['heic', 'heif'].includes(p.ext) };
}

/** What Cloudinary's signed download API needs to hand back the file. The
 *  plain delivery address is refused for PDFs and ZIPs on this account, so
 *  anything that is not shown as a picture is opened through the server
 *  (GET /admin/team-chat/file/...), as the job page's files are. */
function downloadSource(url, cloud) {
  const p = parse(url, cloud);
  if (!p) return null;
  const file = /\/upload\/(?:v\d+\/)?(.+)$/.exec(url)[1];
  return p.type === 'raw'
    ? { resourceType: 'raw', publicId: file, format: '', ext: p.ext }
    : { resourceType: 'image', publicId: file.replace(/\.[A-Za-z0-9]+$/, ''), format: p.ext, ext: p.ext };
}

module.exports = { FOLDER, EXTS, ACCEPT, NAME_MAX, fileUrlOk, cleanName, fileOf, downloadSource };
