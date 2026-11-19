# Export Capybara's encrypted signing key

Owner handoff only: this manual workflow prepares an encrypted ZIP for the
owner's Play Console public key. It does **not** upload to Play, rotate a key,
publish a release, or change Play configuration.

## Authorized operator path

1. Review `fix/capybara-pepk`, including both certificate gates and the tests.
   Push the reviewed commit and wait for its actual branch CI to pass before
   dispatching `.github/workflows/pepk-export.yml` on that exact commit.
2. Supply the full `encryption_public_key.pem` from the owner's Play Console as
   the `encryption_key` input. It reaches the shell only through an environment
   variable and must parse as a public key. Do not commit the PEM or paste
   signing passwords, keystore contents, or private keys into logs or chat.
3. The GitHub-hosted ephemeral runner restores the existing signing secrets,
   verifies the source certificate, and runs the checksum-pinned PEPK tool.
   Never reproduce this with production signing material on a local machine.
4. Download the `capybara-play-signing-key` artifact before its one-day expiry.
   Its sole payload must be `capybara-play-signing-key.zip`. Confirm the run's
   ZIP checksum, exactly two nonempty entries (`encryptedPrivateKey` and
   `certificate.pem`), and the certificate fingerprint below. Reject any
   additional entries, raw keystore, passwords, or plaintext private key.
5. Hand the verified encrypted ZIP privately to the owner, identifying the
   reviewed commit, workflow run, checksum and certificate fingerprint. Do not
   attach it to public Releases. Stop here: uploading to Play or changing its
   signing configuration requires a separate owner action/authorization.

## Fixed verification values

| Check | Expected SHA256 |
|-------|-----------------|
| Source and ZIP certificate | `601f619e5e1555f31a2c9038063450f2aafa9e95d218edd87e18f10673882b41` |
| Reviewed PEPK JAR | `aaccc0774b240aa5304bdad2a49865e92f229ca73209ecb6eaafe75dc858e24e` |

The workflow retains read-only contents permission, environment-only PEM input,
RSA/AES encryption with the certificate included, and unconditional raw-keystore
cleanup even when a gate fails. A failed gate must never reach artifact upload.
No new credentials, auth scopes, Play API calls or release uploads are needed.

## Local checks without production keys

Run `node tools/test-capybara-pepk.mjs`. It executes extracted workflow shell
stages with deterministic command stubs and disposable ZIP/certificate fixtures.
OpenSSL really parses the test public key and certificate; only the disposable
certificate's fingerprint is mapped to the expected Capybara value for the
success branch. Java/keytool/download are stubs, not production export evidence.
Cleanup is recorded by a nondeleting stub and its exact arguments checked.

All fixtures, test-only private keys and per-scenario logs stay in the ignored
`.pepk-validation/` directory. Never stage them. The test also runs the existing
10-check `testPepkExport()` group in isolation, without gameplay/browser suites
or Git history. Local success does not replace branch CI or the operator's
post-export artifact verification.
