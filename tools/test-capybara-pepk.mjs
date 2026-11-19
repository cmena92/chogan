// Isolated workflow-shell tests: no secrets, network, real keystore or Git history.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, '.pepk-validation'), { recursive: true });
const scratch = fs.mkdtempSync(path.join(root, '.pepk-validation/run-'));
const workflow = fs.readFileSync(path.join(root, '.github/workflows/pepk-export.yml'), 'utf8');
const fingerprint = '601f619e5e1555f31a2c9038063450f2aafa9e95d218edd87e18f10673882b41';
const archive = 'capybara-play-signing-key.zip';
let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed++; }
}
function command(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: scratch, encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${file}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function stage(fragment) {
  const blocks = workflow.split(/^      - name: /m).slice(1);
  const block = blocks.find(value => value.split('\n')[0].includes(fragment));
  assert.ok(block, `stage ${fragment} exists`);
  const script = block.match(/        run: \|\n([\s\S]*)/);
  if (script) return script[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  return block.match(/        run: (.*)/)[1];
}
const scripts = {
  pin: stage('Download and verify'), pem: stage('encryption public key'),
  restore: stage('Restore'), gate: stage('Check the key'), export: stage('Export with'),
  cleanup: stage('Remove the key'),
};
for (const [name, script] of Object.entries(scripts)) {
  fs.writeFileSync(path.join(scratch, `${name}.sh`), script);
  test(`${name}: bash syntax`, () => command('bash', ['-n', path.join(scratch, `${name}.sh`)]));
}
test('source certificate gate pins Capybara', () => {
  assert.ok(scripts.gate.includes(fingerprint));
});
test('ZIP certificate gate pins Capybara', () => {
  assert.ok(scripts.export.includes(`"${fingerprint}"`));
  assert.ok(!workflow.includes('c3f70a1a'));
});
test('Capybara names and every ZIP reference', () => {
  assert.ok(workflow.includes('permanent Capybara key'));
  assert.ok(!workflow.includes('Chogan') && !workflow.includes('chogan-play'));
  assert.match(workflow, /name: capybara-play-signing-key\n/);
  assert.match(workflow, /path: capybara-play-signing-key\.zip\n/);
});
test('retained safety policy', () => {
  assert.match(workflow, /PEPK_SHA256: aaccc0774b240aa5304bdad2a49865e92f229ca73209ecb6eaafe75dc858e24e/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /--rsa-aes-encryption/);
  assert.match(workflow, /--include-cert/);
  assert.equal((workflow.match(/inputs\.encryption_key/g) || []).length, 1);
  assert.match(workflow, /ENCRYPTION_KEY: \$\{\{ inputs.encryption_key \}\}/);
  const triggers = workflow.match(/\non:\n([\s\S]*?)\npermissions:/)[1];
  assert.match(triggers, /workflow_dispatch:/);
  assert.doesNotMatch(triggers, /\b(push|pull_request|schedule|release):/);
  assert.doesNotMatch(workflow, /contents: write|gh release|play-api/);
});

// Public certificate and private test key never leave ignored scratch.
command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=PEPK TEST ONLY',
  '-days', '1', '-keyout', 'test-only.key', '-out', 'test-cert.pem']);
command('openssl', ['pkey', '-in', 'test-only.key', '-pubout', '-out', 'test-public.pem']);
const realOpenSSL = command('which', ['openssl']);
const cert = fs.readFileSync(path.join(scratch, 'test-cert.pem'), 'utf8');
const pub = fs.readFileSync(path.join(scratch, 'test-public.pem'), 'utf8');
const bin = path.join(scratch, 'bin');
fs.mkdirSync(bin);
function stub(name, text) {
  fs.writeFileSync(path.join(bin, name), `#!/bin/bash\nset -euo pipefail\n${text}\n`, { mode: 0o700 });
}
stub('keytool', 'printf "SHA256: %s\\n" "$TEST_KEY_FP"');
// Parse the real disposable certificate; map only its digest to the production
// identity so the unchanged workflow can exercise its success branch.
const testFP = command(realOpenSSL, ['x509', '-in', 'test-cert.pem', '-noout', '-fingerprint', '-sha256']).split('=')[1];
stub('openssl', `if [ "$1" != x509 ]; then exec "${realOpenSSL}" "$@"; fi
output=$("${realOpenSSL}" "$@")
if [ "\${TEST_ZIP_CERT:-valid}" = valid ]; then
  printf '%s\\n' "\${output//${testFP}/${fingerprint}}"
else
  printf '%s\\n' "$output"
fi`);
// Do not delete fixtures: record the actual unconditional cleanup command.
stub('rm', 'printf "%s\\n" "$@" > "$RUNNER_TEMP/cleanup.args"');
// Java's output argument is located by name, not positional assumptions.
stub('java', 'printf "%s\\n" "$@" > "$RUNNER_TEMP/java.args"\nfor arg in "$@"; do\n  case "$arg" in --output=*) cp "$TEST_ZIP" "${arg#--output=}" ;; esac\ndone');
let scenarioNumber = 0;
function runScenario({ entries = ['encryptedPrivateKey', 'certificate.pem'], empty = '', key = fingerprint,
  zipCert = 'valid', corruptCert = false, pem = pub,
  base64 = Buffer.from('FAKE KEYSTORE').toString('base64'), jar = true } = {}) {
  const dir = path.join(scratch, `case-${++scenarioNumber}`);
  fs.mkdirSync(dir);
  const fixtures = path.join(dir, 'fixtures');
  fs.mkdirSync(fixtures);
  for (const entry of entries) {
    fs.writeFileSync(path.join(fixtures, entry), entry === empty ? '' : entry === 'certificate.pem' ? (corruptCert ? 'INVALID CERTIFICATE' : cert) : 'TEST ONLY CIPHERTEXT');
  }
  const zip = path.join(dir, 'fixture.zip');
  command('zip', ['-q', zip, ...entries], { cwd: fixtures });
  fs.writeFileSync(path.join(dir, 'pepk.jar'), 'TEST ONLY JAR');
  const env = { ...process.env, LC_ALL: 'C', PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: dir,
    ENCRYPTION_KEY: pem, ANDROID_KEYSTORE_BASE64: base64, ANDROID_KEYSTORE_PASSWORD: 'fake-store-pass',
    ANDROID_KEY_ALIAS: 'fake-alias', ANDROID_KEY_PASSWORD: 'fake-key-pass',
    TEST_KEY_FP: key, TEST_ZIP: zip, TEST_ZIP_CERT: zipCert };
  const results = [];
  if (!jar) {
    // Execute actual checksum stage with a deterministic local download stub.
    env.PEPK_SHA256 = '0'.repeat(64);
    env.PEPK_URL = 'test-only:no-network';
  }
  for (const name of [...(!jar ? ['pin'] : []), 'pem', 'restore', 'gate', 'export']) {
    const result = spawnSync('bash', [path.join(scratch, `${name}.sh`)], { cwd: dir, env, encoding: 'utf8' });
    results.push({ name, ...result });
    if (result.status !== 0) break;
  }
  const cleanup = spawnSync('bash', [path.join(scratch, 'cleanup.sh')], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(cleanup.status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'cleanup.args'), 'utf8'), `-f\n${dir}/release.jks\n${dir}/cert.txt\n`);
  const success = results.every(result => result.status === 0);
  // Upload action is reachable only after all shell gates succeed.
  const uploaded = success ? fs.existsSync(path.join(dir, archive)) : false;
  const logs = results.map(result => `${result.name}: ${result.status}\n${result.stdout}${result.stderr}`).join('\n');
  fs.writeFileSync(path.join(dir, 'result.log'), logs);
  assert.ok(!logs.includes('fake-store-pass') && !logs.includes('fake-key-pass'));
  return { success, uploaded, exported: fs.existsSync(path.join(dir, 'java.args')), logs, dir };
}
stub('curl', 'printf "TEST ONLY JAR" > "$RUNNER_TEMP/pepk.jar"');
function rejects(name, options, message, beforeExport = false) {
  test(name, () => {
    const result = runScenario(options);
    assert.equal(result.success, false);
    assert.equal(result.uploaded, false);
    if (beforeExport) assert.equal(result.exported, false);
    assert.match(result.logs, message);
  });
}
rejects('wrong source cert stops before export/upload', { key: '0'.repeat(64) }, /not the permanent Capybara key/, true);
rejects('wrong ZIP cert blocks upload', { zipCert: 'wrong' }, /not the Capybara key/);
rejects('malformed ZIP certificate blocks upload', { corruptCert: true }, /Could not (read|find) certificate|Unable to load certificate/);
rejects('missing encrypted entry', { entries: ['certificate.pem'] }, /ZIP must contain only/);
rejects('missing certificate', { entries: ['encryptedPrivateKey'] }, /ZIP must contain only/);
rejects('plaintext private key entry', { entries: ['encryptedPrivateKey', 'certificate.pem', 'privateKey'] }, /ZIP must contain only/);
rejects('raw keystore entry', { entries: ['encryptedPrivateKey', 'certificate.pem', 'release.jks'] }, /ZIP must contain only/);
rejects('password entry', { entries: ['encryptedPrivateKey', 'certificate.pem', 'password.txt'] }, /ZIP must contain only/);
for (const empty of ['encryptedPrivateKey', 'certificate.pem']) {
  rejects(`empty ${empty}`, { empty }, /Empty ZIP entry/);
}
rejects('malformed PEM with valid markers', { pem: '-----BEGIN PUBLIC KEY-----\ninvalid\n-----END PUBLIC KEY-----' }, /does not parse/, true);
rejects('missing PEM markers', { pem: 'invalid' }, /not a PEM public key/, true);
rejects('missing keystore secret', { base64: '' }, /not set/, true);
rejects('wrong JAR checksum', { jar: false }, /FAILED/, true);
test('valid test-only flow and exact artifact', () => {
  const result = runScenario();
  assert.ok(result.success && result.exported && result.uploaded, result.logs);
  assert.deepEqual(command('unzip', ['-Z1', path.join(result.dir, archive)]).split('\n').sort(), ['certificate.pem', 'encryptedPrivateKey']);
  const args = fs.readFileSync(path.join(result.dir, 'java.args'), 'utf8');
  assert.ok(args.includes(`--output=${archive}`));
  assert.ok(args.includes('--include-cert') && args.includes('--rsa-aes-encryption'));
});
test('existing focused testPepkExport checks', () => {
  const source = fs.readFileSync(path.join(root, 'tools/test.js'), 'utf8');
  const fn = source.match(/function testPepkExport\(\) \{[\s\S]*?\n\}/)[0];
  let checks = 0;
  vm.runInNewContext(`${fn}\ntestPepkExport();`, { fs, path, ROOT: root, head() {},
    ok(condition, message) { assert.ok(condition, message); checks++; } });
  assert.equal(checks, 10);
});
console.log(`${passed} passed; ${failed} failed; logs/fixtures: ${scratch}`);
process.exitCode = failed ? 1 : 0;
