'use strict';

/* Files sent in Team chat (owner, 2026-10-14: "send files to each other
   through the chat"). The browser uploads straight to Cloudinary with a
   signature from /admin/api/chat-file-signature, into FOLDER, then sends the
   message with the file's address. The server keeps only addresses that are
   this shop's Cloudinary, in FOLDER, with an allowed extension, so a message
   can never link somewhere else. Kept apart from the SQL so it can be tested. */

const FOLDER = 'team_chat';
/* Files on staff tasks (owner, 2026-10-14) follow the same rules in their own folder. */
const TASK_FOLDER = 'task_files';
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
const EXTS = [...IMAGE_EXTS, 'pdf', 'ai', 'eps', 'svg', 'psd', 'tif', 'tiff', 'dst', 'pes', 'emb', 'exp',
  'zip', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'mp4', 'mov'];
const ACCEPT = EXTS.map((e) => '.' + e).join(',');
const NAME_MAX = 120;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** { type, ext } for a chat file this shop's Cloudinary holds, or null. */
function parse(url, cloud, folder = FOLDER) {
  if (typeof url !== 'string' || url.length > 400 || !cloud || ![FOLDER, TASK_FOLDER].includes(folder)) return null;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/(image|raw)/upload/(?:v\\d+/)?' + folder + '/[A-Za-z0-9_-]{1,120}\\.([A-Za-z0-9]{2,5})$').exec(url);
  if (!m) return null;
  const ext = m[2].toLowerCase();
  return EXTS.includes(ext) ? { type: m[1], ext } : null;
}
function fileUrlOk(url, cloud, folder = FOLDER) { return !!parse(url, cloud, folder); }

/** Files posted with a task form: a JSON list of { url, name }, each in the
 *  task folder of our own cloud. Returns { files, error }; at most `max`. */
function pickTaskFiles(posted, cloud, max = 10) {
  if (!String(posted || '').trim()) return { files: [] };
  let list;
  try { list = JSON.parse(String(posted)); } catch { return { files: [], error: 'bad' }; }
  if (!Array.isArray(list) || list.length > max) return { files: [], error: list && list.length > max ? 'too-many' : 'bad' };
  const files = [];
  for (const it of list) {
    const url = String((it && it.url) || '');
    if (!fileUrlOk(url, cloud, TASK_FOLDER)) return { files: [], error: 'bad' };
    if (!files.some((f) => f.url === url)) files.push({ url, name: cleanName(it.name) || 'File' });
  }
  return { files };
}

/** The name shown for the file: one line, no markup characters, capped. */
function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NAME_MAX);
}

/** What a message row shows for its file, or null for none (or one that no
 *  longer passes the address check). Images show as a picture. */
function fileOf(row, cloud, folder = FOLDER) {
  const p = row && row.file_url ? parse(row.file_url, cloud, folder) : null;
  if (!p) return null;
  return { url: row.file_url, name: cleanName(row.file_name) || 'File',
    image: p.type === 'image' && IMAGE_EXTS.includes(p.ext) && !['heic', 'heif'].includes(p.ext) };
}

/** What Cloudinary's signed download API needs to hand back the file. The
 *  plain delivery address is refused for PDFs and ZIPs on this account, so
 *  anything that is not shown as a picture is opened through the server
 *  (GET /admin/team-chat/file/...), as the job page's files are. */
function downloadSource(url, cloud, folder = FOLDER) {
  const p = parse(url, cloud, folder);
  if (!p) return null;
  const file = /\/upload\/(?:v\d+\/)?(.+)$/.exec(url)[1];
  return p.type === 'raw'
    ? { resourceType: 'raw', publicId: file, format: '', ext: p.ext }
    : { resourceType: 'image', publicId: file.replace(/\.[A-Za-z0-9]+$/, ''), format: p.ext, ext: p.ext };
}

module.exports = { FOLDER, TASK_FOLDER, pickTaskFiles, EXTS, ACCEPT, NAME_MAX, fileUrlOk, cleanName, fileOf, downloadSource };
