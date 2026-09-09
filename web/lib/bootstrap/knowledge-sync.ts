/** Refresh only unchanged managed files; all writes stay in pinned Linux directories. */
export const KNOWLEDGE_SYNC_SCRIPT = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [source, runtime] = process.argv.slice(1);
const MAX_FILE_BYTES = 1024 * 1024, MAX_MANIFEST_BYTES = 512 * 1024, MAX_READ_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 2000, MAX_DEPTH = 12;
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
let readBytes = 0, visited = 0, installed = 0, preserved = 0;
const warnings = new Set();
function at(fd, name = '') {
  if (name && (name === '.' || name === '..' || name.includes('/') || name.includes('\0'))) throw new Error('Invalid knowledge path component.');
  return '/proc/self/fd/' + fd + (name ? '/' + name : '');
}
function statAt(parent, name) {
  try {
    const info = fs.lstatSync(at(parent, name));
    if (info.isSymbolicLink()) throw new Error('Knowledge sync refuses symlink: ' + name);
    return info;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directory(parent, name, create = false) {
  if (create && !statAt(parent, name)) {
    try { fs.mkdirSync(at(parent, name), {mode: 0o700}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  statAt(parent, name);
  return fs.openSync(at(parent, name), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
}
function rootDirectory(absolute, create) {
  let fd = fs.openSync('/', fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    for (const name of path.resolve(absolute).split('/').filter(Boolean)) {
      const next = directory(fd, name, create);
      fs.closeSync(fd); fd = next;
    }
    return fd;
  } catch (error) { fs.closeSync(fd); throw error; }
}
function same(a, b) {
  return !!a && !!b && a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function readAt(parent, name, limit) {
  const before = statAt(parent, name);
  if (!before) return null;
  if (!before.isFile()) throw new Error('Knowledge path is not a file: ' + name);
  if (before.size > limit) throw new Error('Knowledge file exceeds its byte limit: ' + name);
  const fd = fs.openSync(at(parent, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || !same(before, opened)) throw new Error('Knowledge file changed during read: ' + name);
    const chunks = [];
    let length = 0;
    while (length <= limit) {
      const buffer = Buffer.alloc(Math.min(65536, limit + 1 - length));
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) {
        if (!same(opened, fs.fstatSync(fd))) throw new Error('Knowledge file changed during read: ' + name);
        return {body: Buffer.concat(chunks, length), info: opened};
      }
      readBytes += count;
      if (readBytes > MAX_READ_BYTES) throw new Error('Knowledge sync exceeded its total read budget.');
      chunks.push(buffer.subarray(0, count)); length += count;
    }
    throw new Error('Knowledge file exceeds its byte limit: ' + name);
  } finally { fs.closeSync(fd); }
}
function atomicWrite(parent, name, bytes, expected) {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Knowledge output exceeds its byte limit.');
  const temporary = '.knowledge-' + crypto.randomBytes(16).toString('hex');
  let fd;
  try {
    fd = fs.openSync(at(parent, temporary), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, expected ? expected.mode & 0o777 : 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    const current = statAt(parent, name);
    if (expected) {
      if (!same(current, expected)) throw new Error('Knowledge destination changed before commit: ' + name);
      // rename replaces the final entry; it never follows a final symlink.
      fs.renameSync(at(parent, temporary), at(parent, name));
    } else {
      // Atomic create-if-absent: a newly created Worker file always wins.
      fs.linkSync(at(parent, temporary), at(parent, name));
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(at(parent, temporary)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function manifest(bytes) {
  const parsed = bytes ? JSON.parse(bytes.toString('utf8')) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid knowledge ownership manifest.');
  const keys = Object.keys(parsed), result = Object.create(null);
  if (keys.length > MAX_ENTRIES) throw new Error('Knowledge manifest exceeds its entry limit.');
  for (const relative of keys) {
    const parts = relative.split('/');
    if (relative.length > 512 || !['skills','crons','mcps'].includes(parts[0]) || parts.length < 2 ||
        parts.some(name => !name || name === '.' || name === '..' || name.includes('\0')) ||
        typeof parsed[relative] !== 'string' || !/^[a-f0-9]{64}$/i.test(parsed[relative])) throw new Error('Invalid knowledge ownership manifest entry.');
    result[relative] = parsed[relative].toLowerCase();
  }
  return result;
}
if (process.platform !== 'linux' || !fs.existsSync('/proc/self/fd')) throw new Error('Safe knowledge sync requires a Linux Worker with /proc/self/fd.');
let sourceRoot, runtimeRoot;
try {
  sourceRoot = rootDirectory(source, false);
  runtimeRoot = rootDirectory(runtime, true);
  const previousFile = readAt(runtimeRoot, '.knowledge-manifest.json', MAX_MANIFEST_BYTES);
  const previous = manifest(previousFile && previousFile.body);
  const next = Object.assign(Object.create(null), previous);
  function sync(sourceParent, runtimeParent, name, relative, canonical = false, depth = 0) {
    if (++visited > MAX_ENTRIES || depth > MAX_DEPTH || relative.length > 512) { warnings.add('Knowledge file/depth limit reached; remaining files were preserved.'); return; }
    const sourceInfo = statAt(sourceParent, name);
    if (!sourceInfo) return;
    const destination = statAt(runtimeParent, name);
    if (sourceInfo.isDirectory()) {
      const from = directory(sourceParent, name);
      let to, entries;
      try {
        to = directory(runtimeParent, name, true);
        entries = fs.opendirSync(at(from));
        let entry;
        while (visited <= MAX_ENTRIES && (entry = entries.readSync()) !== null) sync(from, to, entry.name, relative + '/' + entry.name, false, depth + 1);
        const linked = statAt(runtimeParent, name), pinned = fs.fstatSync(to);
        if (!linked || linked.ino !== pinned.ino || linked.dev !== pinned.dev) throw new Error('Knowledge directory changed during sync.');
      } finally { if (entries) entries.closeSync(); if (to !== undefined) fs.closeSync(to); fs.closeSync(from); }
      return;
    }
    if (!sourceInfo.isFile()) return;
    if (destination && !destination.isFile()) throw new Error('Knowledge destination is not a file: ' + relative);
    if (canonical && destination) { preserved++; return; }
    if (sourceInfo.size > MAX_FILE_BYTES || (destination && destination.size > MAX_FILE_BYTES)) {
      warnings.add('Oversized knowledge files were preserved without reading them.'); preserved++; return;
    }
    const body = readAt(sourceParent, name, MAX_FILE_BYTES).body, hash = digest(body);
    const current = destination ? readAt(runtimeParent, name, MAX_FILE_BYTES) : null;
    if (current) {
      const currentHash = digest(current.body);
      if (currentHash !== hash && currentHash !== previous[relative]) { preserved++; return; }
      if (currentHash === hash) { if (!canonical) next[relative] = hash; preserved++; return; }
    }
    try { atomicWrite(runtimeParent, name, body, current && current.info); }
    catch (error) {
      if (error.code === 'EEXIST') { preserved++; return; }
      throw error;
    }
    if (!canonical) next[relative] = hash;
    installed++;
  }
  for (const folder of ['skills', 'crons', 'mcps']) sync(sourceRoot, runtimeRoot, folder, folder);
  for (const name of ['SOUL.md', 'USER.md', 'MEMORY.md', 'AGENTS.md']) sync(sourceRoot, runtimeRoot, name, name, true);
  const encoded = Buffer.from(JSON.stringify(next));
  if (encoded.length > MAX_MANIFEST_BYTES || Object.keys(next).length > MAX_ENTRIES) throw new Error('Knowledge manifest exceeds its storage limit.');
  atomicWrite(runtimeRoot, '.knowledge-manifest.json', encoded, previousFile && previousFile.info);
  for (const warning of warnings) console.log('[reload] warning: ' + warning);
  console.log('[reload] installed ' + installed + ' bundled files; preserved ' + preserved + ' Worker-owned files.');
} finally { if (runtimeRoot !== undefined) fs.closeSync(runtimeRoot); if (sourceRoot !== undefined) fs.closeSync(sourceRoot); }
`;

export function knowledgeSyncCommand(source: string, runtime: string): string {
	const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
	return `node -e ${quote(KNOWLEDGE_SYNC_SCRIPT)} ${quote(source)} ${quote(runtime)}`;
}
