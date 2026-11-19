import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflow = readFileSync(`${root}.github/workflows/build-apk.yml`, 'utf8');
const javaHome = process.env.JAVA_HOME;
assert.ok(javaHome, 'Set JAVA_HOME to an installed JDK 21 before running these checks');
const jdk = `${javaHome}/bin`;
const pinned = '601f619e5e1555f31a2c9038063450f2aafa9e95d218edd87e18f10673882b41';
function shell(name) {
  const section = workflow.split(`      - name: ${name}\n`)[1];
  assert.ok(section, `Missing step: ${name}`);
  return section.split('        run: |\n')[1].split(/\n(?=      - name:)/)[0]
    .split('\n').filter(line => line.startsWith('          ')).map(line => line.slice(10)).join('\n') + '\n';
}
function command(exe, args, options = {}) {
  return spawnSync(exe, args, { encoding: 'utf8', timeout: 20000, ...options });
}
function ok(result) {
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
}

test('optional mode preserves debug and gates signing on explicit manual dispatch', () => {
  assert.match(workflow, /default: debug/);
  assert.match(workflow, /required: false/);
  assert.match(workflow, /options: \[debug, signed-aab\]/);
  assert.match(workflow, /branches: \['rebrand\/\*\*', 'feature\/\*\*'\]/);
  assert.match(workflow, /if: github.event_name != 'workflow_dispatch' \|\| inputs.mode != 'signed-aab'/);
  assert.match(workflow, /if: github.event_name == 'workflow_dispatch' && inputs.mode == 'signed-aab'/);
  assert.match(workflow, /gradle --no-daemon assembleDebug/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /if: always\(\)\n        run: rm -f "\$RUNNER_TEMP\/release.jks"/);
  assert.ok(workflow.indexOf('Remove raw key') < workflow.indexOf('Verify signed bundle'));
  const signed = workflow.split('\n  signed-aab:\n')[1];
  assert.match(signed, /runs-on: ubuntu-latest/);
  assert.match(signed, /java-version: '21'/);
  assert.match(signed, /gradle-version: \$\{\{ steps.gradleversion.outputs.version }}/);
  assert.match(signed, /cache-disabled: true/);
  assert.doesNotMatch(signed, /play-api|PLAY_SERVICE_ACCOUNT|download-artifact|set -x/);
  assert.match(signed, /path: \|\n            aab-artifact\/capybara-play-test.aab\n            aab-artifact\/SHA256SUMS/);
});

test('all inline shell blocks parse, pinned download is checked before execution', () => {
  for (const match of workflow.matchAll(/        run: \|\n((?:          .*\n|\n)*)/g)) {
    ok(command('bash', ['-n'], { input: match[1].replace(/^          /gm, '') }));
  }
  const download = shell('Download pinned bundletool');
  assert.match(download, /releases\/download\/1\.18\.3\/bundletool-all-1\.18\.3.jar/);
  assert.match(download, /a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29/);
  assert.match(download, /sha256sum --check --strict/);
  assert.ok(workflow.indexOf('Download pinned bundletool') < workflow.indexOf('java -jar'));
});

test('actual shell guards with disposable JDK signatures (manifest tool is mocked)', async t => {
  const scratch = `${root}.aab-validation`;
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(`${scratch}/fixtures-`);
  const env = { ...process.env, HOME: dir, LC_ALL: 'C', PATH: `${dir}/bin:${jdk}:/usr/bin:/bin` };
  const run = (exe, args, options = {}) => command(exe, args, { cwd: dir, env, ...options });
  try {
    mkdirSync(`${dir}/bin`);
    mkdirSync(`${dir}/content`);
    writeFileSync(`${dir}/content/payload.txt`, 'original signed content');
    for (const alias of ['release', 'wrong']) {
      ok(run(`${jdk}/keytool`, ['-genkeypair', '-alias', alias, '-keystore', `${dir}/fixture.jks`,
        '-storepass', 'fixture-only', '-keypass', 'fixture-only', '-dname', `CN=${alias}`,
        '-keyalg', 'RSA', '-validity', '30']));
    }
    ok(run(`${jdk}/keytool`, ['-exportcert', '-alias', 'release', '-keystore', 'fixture.jks',
      '-storepass', 'fixture-only', '-file', 'signer.der']));
    const cert = run(`${jdk}/keytool`, ['-J-Duser.language=en', '-printcert', '-file', 'signer.der']);
    ok(cert);
    const fingerprint = cert.stdout.match(/SHA256: ([A-F0-9:]+)/)[1].replaceAll(':', '').toLowerCase();
    ok(run(`${jdk}/jar`, ['--create', '--file', 'unsigned.aab', '-C', 'content', 'payload.txt']));
    for (const alias of ['release', 'wrong']) {
      copyFileSync(`${dir}/unsigned.aab`, `${dir}/${alias}.aab`);
      ok(run(`${jdk}/jarsigner`, ['-keystore', 'fixture.jks', '-storepass', 'fixture-only',
        `${alias}.aab`, alias]));
    }
    copyFileSync(`${dir}/release.aab`, `${dir}/tamper.aab`);
    writeFileSync(`${dir}/content/payload.txt`, 'tampered content');
    ok(run(`${jdk}/jar`, ['--update', '--file', 'tamper.aab', '-C', 'content', 'payload.txt']));
    copyFileSync(`${dir}/release.aab`, `${dir}/extra.aab`);
    writeFileSync(`${dir}/content/extra.txt`, 'unsigned extra');
    ok(run(`${jdk}/jar`, ['--update', '--file', 'extra.aab', '-C', 'content', 'extra.txt']));
    // Only bundletool is stubbed. keytool/jarsigner verify real disposable signatures.
    writeFileSync(`${dir}/bin/java`, '#!/bin/bash\nset -eu\ncase "$3" in\nvalidate) exit 0;;\ndump) /usr/bin/printf "%s" "$MOCK_MANIFEST";;\n*) exit 90;;\nesac\n', { mode: 0o700 });
    writeFileSync(`${dir}/bin/gradle`, '#!/bin/bash\nexit "${GRADLE_EXIT:-0}"\n', { mode: 0o700 });
    let serial = 0;
    const version = readFileSync(`${root}www/version.js`, 'utf8');
    const name = version.match(/APP_VERSION\s*=\s*['"]([^'"]+)/)[1];
    const code = version.match(/APP_VERSION_CODE\s*=\s*(\d+)/)[1];
    const manifest = (pkg = 'com.webcomcr.capybara', vn = name, vc = code, perm = 'android.permission.VIBRATE') =>
      `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${pkg}" android:versionName="${vn}" android:versionCode="${vc}"><uses-permission android:name="${perm}"/><uses-permission android:name="com.webcomcr.capybara.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"/></manifest>`;
    function setup() {
      const cwd = `${dir}/case-${serial++}`;
      mkdirSync(`${cwd}/android/app/build/outputs/bundle/release`, { recursive: true });
      mkdirSync(`${cwd}/www`);
      mkdirSync(`${cwd}/temp`);
      writeFileSync(`${cwd}/www/version.js`, version);
      copyFileSync(`${dir}/signer.der`, `${cwd}/temp/signer.der`);
      return { cwd, env: { ...env, RUNNER_TEMP: `${cwd}/temp` } };
    }
    async function verify(label, fixture, xml, expected, message) {
      await t.test(label, () => {
        const options = setup();
        copyFileSync(`${dir}/${fixture}.aab`, `${options.cwd}/android/app/build/outputs/bundle/release/app-release.aab`);
        options.env.MOCK_MANIFEST = xml;
        const result = run('bash', ['-c', shell('Verify signed bundle and merged manifest').replaceAll(pinned, fingerprint)], options);
        if (expected) {
          ok(result);
          assert.match(result.stdout, /Merged permissions:.*DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION/);
          assert.equal(readFileSync(`${options.cwd}/aab-artifact/capybara-play-test.aab`).compare(readFileSync(`${dir}/${fixture}.aab`)), 0);
          ok(command('sha256sum', ['--check', 'SHA256SUMS'], { cwd: `${options.cwd}/aab-artifact` }));
        } else {
          assert.notEqual(result.status, 0);
          assert.equal(result.error, undefined);
          if (message) assert.match(result.stdout + result.stderr, message);
          assert.equal(existsSync(`${options.cwd}/aab-artifact`), false);
        }
      });
    }
    await t.test('unverified bundletool download is rejected by actual checksum guard', () => {
      const options = setup();
      writeFileSync(`${dir}/bin/curl`, '#!/bin/bash\nprintf "unverified download" > "${@: -1}"\n', { mode: 0o700 });
      const result = run('bash', ['-c', shell('Download pinned bundletool')], options);
      assert.notEqual(result.status, 0);
      assert.equal(result.error, undefined);
      assert.match(result.stdout + result.stderr, /FAILED/);
    });
    await verify('trusted self-signed fixture and internal receiver permission accepted', 'release', manifest(), true);
    await verify('wrong bundle cert', 'wrong', manifest(), false, /Wrong bundle certificate/);
    await verify('tampered signed content', 'tamper', manifest(), false);
    await verify('unsigned extra content', 'extra', manifest(), false);
    await verify('entirely unsigned archive', 'unsigned', manifest(), false, /Wrong bundle certificate/);
    await verify('wrong package', 'release', manifest('wrong.package'), false, /Wrong package/);
    await verify('wrong versionName', 'release', manifest(undefined, 'wrong'), false, /Wrong versionName/);
    await verify('wrong versionCode', 'release', manifest(undefined, undefined, '999'), false, /Wrong versionCode/);
    await verify('INTERNET permission', 'release', manifest(undefined, undefined, undefined, 'android.permission.INTERNET'), false, /INTERNET forbidden/);
    for (const [label, expectedCert, buildExit, expected] of [
      ['source cert accepted and key cleaned', fingerprint, '0', 0],
      ['wrong source cert and key cleaned', pinned, '0', 1],
      ['failed Gradle and key cleaned', fingerprint, '7', 7],
    ]) {
      await t.test(label, () => {
        const options = setup();
        Object.assign(options.env, {
          ANDROID_KEYSTORE_BASE64: readFileSync(`${dir}/fixture.jks`).toString('base64'),
          ANDROID_KEYSTORE_FILE: `${options.cwd}/temp/release.jks`, ANDROID_KEYSTORE_PASSWORD: 'fixture-only',
          ANDROID_KEY_ALIAS: 'release', ANDROID_KEY_PASSWORD: 'fixture-only', GRADLE_EXIT: buildExit,
        });
        const result = run('bash', ['-c', shell('Build with existing release key').replaceAll(pinned, expectedCert)], options);
        assert.equal(result.status, expected, result.stdout + result.stderr);
        assert.equal(existsSync(options.env.ANDROID_KEYSTORE_FILE), false);
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
