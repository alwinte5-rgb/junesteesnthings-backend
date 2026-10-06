'use strict';

/* A ZIP written straight to a response, one file after another (2026-10-06:
 * "Download all" on a job's customer artwork). Nothing is held in memory but
 * the chunk in flight: a job can carry 30 files of up to 20 MB each.
 *
 * Files are STORED, not compressed: artwork (JPG, PNG, PDF, ZIP) is already
 * compressed, and storing keeps the server's work to a copy and a CRC. Each
 * entry's CRC and size are only known once it has streamed, so they follow it
 * in a data descriptor (general-purpose flag bit 3), which every unzipper
 * reads. Names are UTF-8 (bit 11). No ZIP64: the totals here are far below
 * 4 GB, and add() refuses anything that would pass it. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/* MS-DOS time and date, the only clock a ZIP header has. */
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const LIMIT = 0xffffffff;

/** `out` needs write(buf) returning false under back-pressure, 'drain', and end(). */
function zipWriter(out) {
  const entries = [];
  let offset = 0;
  const write = (buf) => new Promise((resolve) => {
    offset += buf.length;
    if (out.write(buf)) resolve(); else out.once('drain', resolve);
  });

  /** Adds one file; `chunks` is any async iterable of Buffers/Uint8Arrays. */
  async function add(name, chunks, when = new Date()) {
    const fname = Buffer.from(String(name), 'utf8');
    const { time, date } = dosTime(when);
    const start = offset;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);              // version needed
    head.writeUInt16LE(0x0808, 6);          // data descriptor + UTF-8 names
    head.writeUInt16LE(0, 8);               // stored
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    // crc and sizes (14..25) stay zero: they follow in the descriptor
    head.writeUInt16LE(fname.length, 26);
    head.writeUInt16LE(0, 28);
    await write(head);
    await write(fname);
    let crc = 0, size = 0;
    for await (const chunk of chunks) {
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += b.length;
      if (size >= LIMIT || offset + b.length >= LIMIT) throw new Error('zip too large');
      crc = crc32(b, crc);
      await write(b);
    }
    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc, 4);
    desc.writeUInt32LE(size, 8);
    desc.writeUInt32LE(size, 12);
    await write(desc);
    entries.push({ fname, crc, size, time, date, start });
  }

  async function finish() {
    const cdStart = offset;
    for (const e of entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);               // made by
      c.writeUInt16LE(20, 6);               // needed
      c.writeUInt16LE(0x0808, 8);
      c.writeUInt16LE(0, 10);
      c.writeUInt16LE(e.time, 12);
      c.writeUInt16LE(e.date, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.size, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.fname.length, 28);
      // extra, comment, disk, attrs: zero
      c.writeUInt32LE(e.start, 42);
      await write(c);
      await write(e.fname);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - cdStart, 12);
    end.writeUInt32LE(cdStart, 16);
    await write(end);
    out.end();
  }

  return { add, finish };
}

/** Names unique within one zip: "logo.png", "logo (2).png", … */
function uniqueNames() {
  const seen = new Map();
  return (name) => {
    const n = String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'file';
    const key = n.toLowerCase();
    const k = (seen.get(key) || 0) + 1;
    seen.set(key, k);
    if (k === 1) return n;
    const dot = n.lastIndexOf('.');
    return dot > 0 ? `${n.slice(0, dot)} (${k})${n.slice(dot)}` : `${n} (${k})`;
  };
}

module.exports = { zipWriter, uniqueNames, crc32 };
