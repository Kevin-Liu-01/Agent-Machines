/**
 * One on-machine inventory for uploaded snapshots and agent-written exports.
 * Linux directory descriptors anchor every operation: a renamed/symlink-swapped
 * parent cannot redirect a read or delete outside the selected artifact tree.
 */
const INVENTORY = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const args = JSON.parse(Buffer.from(process.argv[1], 'base64').toString('utf8'));
const maxEntries = 2000, maxBytes = 8 * 1024 * 1024;
const entries = [], warnings = [];
let visited = 0;
function warn(message) { if (!warnings.includes(message)) warnings.push(message); }
function at(fd, name = '') {
  if (name && (name === '.' || name === '..' || name.includes('/') || name.includes('\0'))) throw new Error('Invalid artifact path component.');
  return '/proc/self/fd/' + fd + (name ? '/' + name : '');
}
function openDir(parent, name) {
  return fs.openSync(at(parent, name), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
}
function rootDir(absolute) {
  let fd = fs.openSync('/', fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    for (const name of path.resolve(absolute).split('/').filter(Boolean)) {
      const next = openDir(fd, name);
      fs.closeSync(fd);
      fd = next;
    }
    return fd;
  } catch (error) { fs.closeSync(fd); throw error; }
}
function withParent(root, parts, fn) {
  let fd = root;
  const owned = [];
  try {
    for (const name of parts.slice(0, -1)) { fd = openDir(fd, name); owned.push(fd); }
    return fn(fd, parts[parts.length - 1]);
  } finally { for (const handle of owned.reverse()) fs.closeSync(handle); }
}
function readAt(parent, name, limit) {
  const fd = fs.openSync(at(parent, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile()) throw new Error('Artifact is not a regular file.');
    if (info.size > limit) throw new Error('This file exceeds the ' + (limit === maxBytes ? '8 MiB browser download' : 'metadata') + ' limit. Retrieve it through the Worker terminal.');
    const chunks = [];
    let length = 0;
    while (length <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - length));
      const read = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (read === 0) return Buffer.concat(chunks, length);
      chunks.push(chunk.subarray(0, read));
      length += read;
    }
    throw new Error('Artifact exceeds the browser download limit.');
  } finally { fs.closeSync(fd); }
}
function names(fd, visit) {
  const dir = fs.opendirSync(at(fd));
  try {
    let entry;
    while ((entry = dir.readSync()) !== null) if (visit(entry.name) === false) break;
  } finally { dir.closeSync(); }
}
function safeName(name) { return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'artifact'; }
function mime(name) {
  return ({'.txt':'text/plain','.md':'text/markdown','.json':'application/json','.csv':'text/csv','.ts':'text/plain','.js':'text/plain','.py':'text/plain','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf'})[path.extname(name).toLowerCase()] || 'application/octet-stream';
}
function metadata(raw, id) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.id !== id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
      typeof raw.name !== 'string' || !raw.name || raw.name.length > 512 ||
      typeof raw.mime !== 'string' || !raw.mime || raw.mime.length > 255 ||
      typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt))) throw new Error('Invalid artifact metadata.');
  const ref = {id, name: raw.name, mime: raw.mime, chatId: null, createdAt: new Date(raw.createdAt).toISOString()};
  if (typeof raw.chatId === 'string' && raw.chatId.length <= 256) ref.chatId = raw.chatId;
  if (typeof raw.sourcePath === 'string' && raw.sourcePath.length <= 4096) ref.sourcePath = raw.sourcePath;
  if (typeof raw.runKey === 'string' && raw.runKey.length <= 256) ref.runKey = raw.runKey;
  if (typeof raw.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(raw.sha256)) ref.sha256 = raw.sha256.toLowerCase();
  return ref;
}
function add(parent, name, parts, ref, removeParts = parts) {
  const info = fs.lstatSync(at(parent, name));
  if (!info.isFile() || info.isSymbolicLink()) return;
  entries.push({parts, removeParts, ref: {...ref, bytes: info.size}});
}
function walk(fd, parts = [], depth = 0) {
  if (depth > 8) { warn('Some exports are deeper than the eight-folder inventory limit.'); return; }
  names(fd, (name) => {
    if (++visited > maxEntries) { warn('Only the first 2,000 artifact entries are listed.'); return false; }
    if (name.startsWith('.') || name.startsWith('_')) return;
    try {
      const info = fs.lstatSync(at(fd, name));
      if (info.isSymbolicLink()) return;
      const nextParts = [...parts, name];
      if (info.isDirectory()) {
        const child = openDir(fd, name);
        try {
          let hasMetadata = false;
          if (depth === 0) {
            try { fs.lstatSync(at(child, '_meta.json')); hasMetadata = true; }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
          }
          if (hasMetadata) {
            try {
              const ref = metadata(JSON.parse(readAt(child, '_meta.json', 16384).toString('utf8')), name);
              add(child, safeName(ref.name), [...nextParts, safeName(ref.name)], ref, nextParts);
            } catch { warn('An artifact has missing or invalid metadata and could not be listed.'); }
          } else walk(child, nextParts, depth + 1);
        } finally { fs.closeSync(child); }
      } else if (info.isFile()) {
        const relative = nextParts.join('/');
        add(fd, name, nextParts, {id: 'export-' + crypto.createHash('sha256').update(relative).digest('hex'), name: relative, mime: mime(name), chatId: null, createdAt: info.mtime.toISOString(), sourcePath: '~/.agent-machines/artifacts/' + relative});
      }
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) warn('An artifact changed during listing. Refresh to retry.');
      else throw error;
    }
  });
}
// Delete through pinned parents, never fs.rmSync(path, {recursive:true}), which
// can resolve a swapped ancestor again during recursive traversal.
function checkDeletionBudget(parent, name, budget, depth = 0) {
  if (++budget.count > maxEntries || depth > 8) throw new Error('Artifact deletion exceeds the safe inventory limit. Use the Worker terminal.');
  const info = fs.lstatSync(at(parent, name));
  if (!info.isDirectory() || info.isSymbolicLink()) return;
  const child = openDir(parent, name);
  try { names(child, (entry) => checkDeletionBudget(child, entry, budget, depth + 1)); }
  finally { fs.closeSync(child); }
}
function removeAt(parent, name, budget, depth = 0) {
  if (++budget.count > maxEntries || depth > 8) throw new Error('Artifact deletion exceeds the safe inventory limit. Use the Worker terminal.');
  const info = fs.lstatSync(at(parent, name));
  if (!info.isDirectory() || info.isSymbolicLink()) { fs.unlinkSync(at(parent, name)); return; }
  const child = openDir(parent, name);
  try {
    const pinned = fs.fstatSync(child);
    if (pinned.ino !== info.ino || pinned.dev !== info.dev) throw new Error('Artifact changed before deletion. Refresh to retry.');
    names(child, (entry) => removeAt(child, entry, budget, depth + 1));
    const current = fs.lstatSync(at(parent, name));
    if (current.ino !== pinned.ino || current.dev !== pinned.dev || current.isSymbolicLink()) throw new Error('Artifact changed during deletion. Refresh to retry.');
    fs.rmdirSync(at(parent, name));
  } finally { fs.closeSync(child); }
}
if (process.platform !== 'linux' || !fs.existsSync('/proc/self/fd')) throw new Error('Safe artifact operations require a Linux Worker with /proc/self/fd.');
let root, dir;
try {
  try { root = rootDir(args.root); dir = openDir(root, 'artifacts'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (dir !== undefined) walk(dir);
  if (args.action === 'list') {
    console.log(JSON.stringify({artifacts: entries.map(e => e.ref).sort((a,b) => b.createdAt.localeCompare(a.createdAt)), warnings}));
  } else {
    const found = entries.find(e => e.ref.id === args.id);
    if (!found) console.log(JSON.stringify({found: false}));
    else if (args.action === 'read') {
      const bytes = withParent(dir, found.parts, (parent, name) => readAt(parent, name, maxBytes));
      console.log(JSON.stringify({found: true, ref: {...found.ref, bytes: bytes.length}, body: bytes.toString('base64')}));
    } else if (args.action === 'delete') {
      withParent(dir, found.removeParts, (parent, name) => {
        checkDeletionBudget(parent, name, {count: 0});
        removeAt(parent, name, {count: 0});
      });
      console.log(JSON.stringify({found: true}));
    } else throw new Error('Unknown artifact action.');
  }
} finally { if (dir !== undefined) fs.closeSync(dir); if (root !== undefined) fs.closeSync(root); }
`;

export function artifactInventoryScript(args: { root: string; action: "list" | "read" | "delete"; id?: string }): { script: string; encodedArgs: string } {
	return { script: INVENTORY, encodedArgs: Buffer.from(JSON.stringify(args)).toString("base64") };
}

export function artifactInventoryCommand(args: Parameters<typeof artifactInventoryScript>[0]): string {
	const { script, encodedArgs } = artifactInventoryScript(args);
	const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
	return `export PATH="$HOME/.agent-machines/node/bin:$HOME/.local/bin:$PATH"; node -e ${quote(script)} ${quote(encodedArgs)}`;
}
