// A small ZIP writer (files stored as they are, no compression) so a customer's data can be one download without adding a library.
// PDFs and photos are already compressed, and the spreadsheets are small. Pure code, tested by reading the result back.
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

// Entry names are made safe: no folders climbing out ("..") and no leading slash or backslash.
export function safeZipName(name: string): string {
  const parts = String(name ?? "").replace(/\\/g, "/").split("/").map((p) => p.replace(/[\u0000-\u001f]/g, "").trim()).filter((p) => p && p !== "." && p !== "..");
  return parts.join("/").slice(0, 200) || "file";
}

export function buildZip(entries: ZipEntry[], when: Date = new Date()): Buffer {
  const d = Number.isNaN(when.getTime()) ? new Date() : when;
  const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dosDate = ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  const chunks: Buffer[] = [], central: Buffer[] = [];
  const used = new Set<string>();
  let offset = 0;
  for (const e of entries) {
    let name = safeZipName(e.name);
    if (used.has(name)) { const dot = name.lastIndexOf("."); let n = 2; const mk = () => (dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`); while (used.has(mk())) n++; name = mk(); }
    used.add(name);
    const nameBuf = Buffer.from(name, "utf8"), data = Buffer.from(e.data), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(used.size, 8); end.writeUInt16LE(used.size, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}
