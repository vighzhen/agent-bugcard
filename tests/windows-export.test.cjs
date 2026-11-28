'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');

const root = path.resolve(__dirname, '..');
const args = ['bin/agent-bugcard.cjs', 'examples/claude.synthetic.jsonl', '--lang', 'zh-Hans', '--call', '3', '--exit-codes', '--format', 'svg'];
const quote = value => "'" + value.replace(/'/g, "''") + "'";
const heading = '退出码 127';

function run(executable, args) {
  return spawnSync(executable, args, {cwd:root, windowsHide:true});
}
function assertSuccess(result) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, String(result.stderr));
  return result.stdout;
}
function psCommand(shell, command) {
  return run(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(command, 'utf16le').toString('base64')]);
}
function psVersion(shell) {
  const result = psCommand(shell, '$PSVersionTable.PSVersion.ToString()');
  if (result.error?.code === 'ENOENT') return null;
  return String(assertSuccess(result)).trim();
}

test('localized CLI SVG has UTF-8 bytes and the expected Chinese heading', () => {
  const svg = assertSuccess(run(process.execPath, args));
  assert.equal(svg.subarray(0, 4).toString('hex'), '3c737667');
  assert.match(new TextDecoder('utf-8', {fatal:true}).decode(svg), /退出码 127/);
});

test('Windows PowerShell and modern PowerShell redirect localized SVG differently', {skip:process.platform !== 'win32'}, t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bugcard-export-'));
  t.after(() => fs.rmSync(folder, {recursive:true, force:true}));
  const output = path.join(folder, 'receipt.svg');
  const baseline = assertSuccess(run(process.execPath, args));
  function redirect(shell) {
    assertSuccess(psCommand(shell, `& ${[process.execPath, ...args].map(quote).join(' ')} > ${quote(output)}; exit $LASTEXITCODE`));
    return fs.readFileSync(output);
  }

  const legacyVersion = psVersion('powershell.exe');
  if (legacyVersion?.startsWith('5.1.')) {
    const actual = redirect('powershell.exe');
    const bom = actual.subarray(0, 2).toString('hex');
    assert.equal(bom, 'fffe');
    const text = new TextDecoder('utf-16le', {fatal:true}).decode(actual);
    assert.ok(text.startsWith('<svg'));
    t.diagnostic(`Windows PowerShell ${legacyVersion}: BOM=${bom}; Chinese heading preserved=${text.includes(heading)}`);
  } else {
    t.diagnostic('Windows PowerShell 5.1 unavailable; skipped legacy comparison');
  }

  const currentVersion = psVersion('pwsh.exe');
  const [major, minor] = (currentVersion ?? '').split('.').map(Number);
  if (major > 7 || (major === 7 && minor >= 4)) {
    const actual = redirect('pwsh.exe');
    assert.deepEqual(actual, baseline);
    assert.ok(new TextDecoder('utf-8', {fatal:true}).decode(actual).includes(heading));
    t.diagnostic(`PowerShell ${currentVersion}: UTF-8 bytes identical to native stdout; Chinese heading preserved`);
  } else {
    t.diagnostic('PowerShell 7.4+ unavailable; skipped modern comparison');
  }
});
