// Executed unchanged locally on Linux and in the disposable provider QA guest.
// The tested program is the exact exported production capture script.
module.exports = function verifyWorkspaceCapture(script) {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const reports = [];
  if (process.platform !== 'linux') return { skipped: 'Linux directory descriptors required' };
  const test = (name, fn) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'am-capture-fixture-'));
    try {
      fs.mkdirSync(path.join(home, 'agent-machines')); fs.mkdirSync(path.join(home, 'work'));
      const run = (phase, limits, fault = '') => {
        const encoded = Buffer.from(JSON.stringify({ phase, home, id: 'a'.repeat(32), runKey: 'fixture-run', limits })).toString('base64');
        const processResult = spawnSync(process.execPath, ['-e', fault + '\n' + script, encoded], { encoding: 'utf8', timeout: 15000 });
        assert.equal(processResult.status, 0, processResult.stderr);
        return JSON.parse(processResult.stdout);
      };
      const put = (file, text) => { const destination = path.join(home, file); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, text); };
      fn({home, run, put}); reports.push(name);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  };
  test('immutable new/changed outputs with provenance, unchanged omitted', ({home, run, put}) => {
    put('work/edited.txt', 'before'); put('agent-machines/unchanged.txt', 'same');
    assert.equal(run('before').ok, true);
    put('work/edited.txt', 'after'); put('work/report one.md', '# Evidence\n');
    const result = run('after'); assert.equal(result.ok, true); assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.artifacts.map(a=>a.name).sort(), ['edited.txt', 'report-one.md']);
    const artifact = result.artifacts.find(a=>a.name === 'report-one.md');
    assert.equal(artifact.runKey, 'fixture-run'); assert.equal(artifact.sourcePath, path.join(home, 'work/report one.md'));
    const stored = path.join(home, '.agent-machines/artifacts', artifact.id, artifact.name);
    put('work/report one.md', 'changed later'); assert.equal(fs.readFileSync(stored, 'utf8'), '# Evidence\n');
    assert.equal(artifact.sha256, require('node:crypto').createHash('sha256').update('# Evidence\n').digest('hex'));
  });
  test('credential, hidden, dependency, symlink and hardlink exclusions', ({home, run, put}) => {
    put('private-source.txt', 'secret'); run('before');
    for (const name of ['.env','credentials.json','api-key.txt','private-key.pem','node_modules/pkg/file.txt']) put('work/' + name, 'secret');
    fs.symlinkSync(path.join(home, 'private-source.txt'), path.join(home, 'work/linked.txt'));
    fs.linkSync(path.join(home, 'private-source.txt'), path.join(home, 'work/hardlinked.txt'));
    fs.symlinkSync(home, path.join(home, 'work/linked-dir'));
    assert.deepEqual(run('after').artifacts, []);
  });
  test('per-file bound emits warning without silent truncation', ({run, put}) => {
    run('before'); put('work/large.txt', '12345');
    const result = run('after', {maxFileBytes:4});
    assert.deepEqual(result.artifacts, []); assert.match(result.warnings.join(' '), /per-file/);
  });
  test('incomplete baseline cannot attribute previously unseen files', ({run, put}) => {
    put('work/a.txt','a'); put('work/b.txt','b');
    assert.match(run('before', {maxFiles:1}).warnings.join(' '), /file-count/);
    const result = run('after'); assert.deepEqual(result.artifacts, []); assert.match(result.warnings.join(' '), /pre-run scan was incomplete/);
  });
  test('symlinked destination fails closed', ({home, run}) => {
    fs.mkdirSync(path.join(home, '.agent-machines'));
    fs.symlinkSync(path.join(home, 'work'), path.join(home, '.agent-machines/artifacts'));
    assert.equal(run('before').ok, false);
  });
  test('symlinked workspace and broad HOME never scanned', ({home, run, put}) => {
    fs.rmSync(path.join(home, 'work'), {recursive:true}); fs.symlinkSync(home, path.join(home, 'work'));
    assert.ok(run('before').warnings.length); put('outside.txt','secret'); assert.deepEqual(run('after').artifacts, []);
  });
  test('parent swap cannot redirect source read to credentials', ({home, run, put}) => {
    run('before'); put('work/nested/report.txt','public evidence'); put('outside/report.txt','SECRET MUST NOT LEAK');
    const fault = `const attackFs = require('node:fs'); const originalOpen = attackFs.openSync; let fired = false;
      attackFs.openSync = function(file, ...args) {
        if (!fired && typeof file === 'string' && file.endsWith('/report.txt')) {
          fired = true; attackFs.renameSync(${JSON.stringify(path.join(home,'work/nested'))}, ${JSON.stringify(path.join(home,'moved-original'))});
          attackFs.symlinkSync(${JSON.stringify(path.join(home,'outside'))}, ${JSON.stringify(path.join(home,'work/nested'))});
          attackFs.writeFileSync(${JSON.stringify(path.join(home,'fault-fired'))},'yes');
        }
        return originalOpen.call(this,file,...args);
      };`;
    const result = run('after', undefined, fault); assert.equal(fs.existsSync(path.join(home,'fault-fired')), true);
    assert.equal(result.ok, true); assert.equal(result.artifacts.length, 1);
    const artifact = result.artifacts[0];
    assert.equal(fs.readFileSync(path.join(home,'.agent-machines/artifacts',artifact.id,artifact.name),'utf8'),'public evidence');
    assert.equal(JSON.stringify(result).includes('SECRET MUST NOT LEAK'), false);
  });
  test('parent swap cannot redirect immutable destination writes', ({home, run, put}) => {
    run('before'); put('work/report.txt','public evidence'); fs.mkdirSync(path.join(home,'outside'));
    const fault = `const attackFs = require('node:fs'); const originalWrite = attackFs.writeFileSync; let fired = false;
      attackFs.writeFileSync = function(file, ...args) {
        if (!fired && typeof file === 'string' && file.startsWith('/proc/self/fd/') && file.endsWith('/report.txt')) {
          fired = true; const parent = file.slice(0,file.lastIndexOf('/')); const original = attackFs.realpathSync(parent);
          attackFs.renameSync(original,original+'-moved'); attackFs.symlinkSync(${JSON.stringify(path.join(home,'outside'))},original);
          originalWrite(${JSON.stringify(path.join(home,'fault-fired'))},'yes');
        }
        return originalWrite.call(this,file,...args);
      };`;
    const result = run('after', undefined, fault);
    assert.equal(fs.existsSync(path.join(home,'fault-fired')), true); assert.equal(result.ok, false);
    assert.deepEqual(fs.readdirSync(path.join(home,'outside')), []); assert.deepEqual(result.artifacts, []); assert.ok(result.warnings.length);
  });
  return { passed: reports.length, cases: reports };
};
