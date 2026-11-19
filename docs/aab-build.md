# Build a signed AAB without publishing

Use the existing **Build APK** workflow (id `395327785`) with the optional
`signed-aab` mode. This only builds and stores an artifact: no Google Play API,
release tags, GitHub Releases, default-branch merge, or new workflow registration.
Without a mode, manual runs still build debug APKs; existing `rebrand/**` and
`feature/**` pushes still build debug APKs and never enter the signing job.

## Owner / parent quick path

1. Complete fresh independent security review of this builder and the existing
   full runtime CI before a real build. The worker does not dispatch or use keys.
2. After the parent commits/pushes the isolated build branch, dispatch exactly:
   ```sh
   gh workflow run 395327785 --ref build/capybara-aab -f mode=signed-aab
   ```
3. Inspect the successful run; download only its `capybara-play-test` artifact.
   It contains `capybara-play-test.aab` and `SHA256SUMS`. From the extracted folder:
   ```sh
   sha256sum --check SHA256SUMS
   sha256sum capybara-play-test.aab
   ```
   Match the full digest against the CI log as well, before owner handoff.
4. Stop. Owner-controlled Play upload and a real Play-delivered manual update
   test (including preservation of existing user data) remain separate gates.

## What the build checks

The source is the already-tested release **v0.34.0-capybara.2**, with build-only
additions, not the unrelated #51/PEPK/privacy worktrees. Package must be
`com.webcomcr.capybara`; versionName and versionCode must exactly match
`www/version.js` (no bump). Java 21 and the repository wrapper's Gradle version
build `bundleRelease` on an ephemeral GitHub-hosted runner.

The existing GitHub signing secrets restore the same release key only for the
build. Source and final bundle certificates must match SHA-256
`601f619e5e1555f31a2c9038063450f2aafa9e95d218edd87e18f10673882b41`.
A shell exit trap plus an unconditional cleanup step remove the raw keystore
before verification/artifact handoff. No private-key export or rotation occurs.
Strict JDK JAR verification trusts only that pinned public certificate, rejects
modified or unsigned added content, and does not ignore self-signed errors.

CI downloads official bundletool 1.18.3, checks its pinned SHA-256 before execution,
validates the AAB, and dumps its real base manifest. Merged permissions are printed;
`android.permission.INTERNET` is forbidden. Legitimate generated internal receiver
permissions are allowed; this is not a claim that vibration is the only permission.
Only the named AAB and its checksum are uploaded, not keys or diagnostic logs.

## Local evidence and remaining gates

Set `JAVA_HOME` to an installed JDK 21, then run `node tools/test-capybara-aab.mjs`.
It uses built-in Node modules, that JDK, disposable keys/JARs, and ignored `.aab-validation/` scratch with
finally cleanup. It parses inline shell and exercises signature, source-key,
cleanup and manifest boundaries. **The mocked bundletool manifest is not real AAB
proof**; local tests do not run Gradle, Android SDK, bundletool downloads or Play.

Bundled in-app privacy text is unchanged from release .2. The corrected live web
policy exists, but source/privacy reconciliation is still required before production.
The original unavailable #51 independent verifier remains pending: this builder's
fresh review does not retry or resolve it. A successful build is not proof of a
Play-delivered update, data preservation, owner upload, or production readiness.
