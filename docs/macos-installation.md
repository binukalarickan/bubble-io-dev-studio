# macOS Tahoe / Apple Silicon Installation

## Current Release

**Bubble Studio v3.8.3** is a native ARM64 build for Apple Silicon Macs, including M5. It does not require Rosetta. It was built on macOS Tahoe 26.7; this is not a full hardware or feature certification across all Apple Silicon models.

- [Download the v3.8.3 DMG](https://github.com/binukalarickan/bubble-io-dev-studio/releases/download/v3.8.3/Bubble.io-Dev-Studio-3.8.3-arm64.dmg)
- [Download the v3.8.3 ZIP](https://github.com/binukalarickan/bubble-io-dev-studio/releases/download/v3.8.3/Bubble.io-Dev-Studio-3.8.3-arm64.zip)
- [Release notes](https://github.com/binukalarickan/bubble-io-dev-studio/releases/tag/v3.8.3)

The release filenames retain `Bubble.io-Dev-Studio`; the application inside is named **Bubble Studio.app**. Use v3.8.3 rather than v3.8.1, which had an incomplete signature.

## Install or Update

1. Quit any running copy of Bubble Studio.
2. Download and open the ARM64 DMG from this fork.
3. Drag **Bubble Studio** into **Applications**, replacing an older copy if prompted. Alternatively, extract the ZIP and move its app into Applications.
4. Launch `/Applications/Bubble Studio.app`.
5. If macOS blocks it, follow the troubleshooting section below.

Install updates manually for this community build. The app checks this fork's release feed, but automatic installation of ad-hoc-signed macOS updates has not been verified.

Replacing the app bundle preserves the separate user profile. Packaged builds reuse `~/Library/Application Support/Bubble.io Dev Studio/` if it exists; otherwise they normally use `~/Library/Application Support/Bubble Studio/`. Do not remove those folders when reinstalling. Development runs can use a separate `bubble-io-dev-studio` profile.

## Signing and Apple Verification

v3.8.3 has a **valid ad-hoc signature**, including its nested Electron components. This lets macOS verify that the signed bundle is internally intact, but does not establish an Apple-trusted publisher identity.

The release is **not Developer ID signed or notarized by Apple**. Gatekeeper may therefore reject a downloaded copy even when `codesign` verification succeeds. Removing that trust warning properly requires an Apple Developer Program membership, a Developer ID Application certificate and private key, and successful Apple notarization. A self-signed certificate is not a substitute.

## Troubleshooting

### “Apple could not verify” or an unidentified developer warning

After attempting to open the installed app, go to **System Settings → Privacy & Security**, locate the blocked-app message, and choose **Open Anyway** if you trust this release. Confirm the prompt. This approves the app locally; it does not notarize it.

### “Bubble Studio is damaged and can’t be opened”

In v3.8.1, skipping the signing step left an incomplete Electron signature. Both the release bundle and the installed app failed verification with:

```text
code has no resources but signature indicates they must be present
```

v3.8.2 fixes that packaging defect by signing the bundle and verifying it before producing the installer. Replace v3.8.1 with v3.8.3 first.

If the new copy is still blocked:

1. Check that it came from the release links above.
2. Open Terminal and verify the installed app:

   ```bash
   codesign --verify --deep --strict --verbose=2 "/Applications/Bubble Studio.app"
   ```

   A valid bundle reports `valid on disk` and `satisfies its Designated Requirement`. If verification fails, download and reinstall a fresh copy; do not bypass the failed check.

3. Try **Open Anyway** in Privacy & Security. If that is unavailable or the app remains blocked, and you trust this fork, use this app-specific local exception:

   ```bash
   codesign --verify --deep --strict "/Applications/Bubble Studio.app" && \
     xattr -dr com.apple.quarantine "/Applications/Bubble Studio.app"
   open "/Applications/Bubble Studio.app"
   ```

   The `&&` ensures quarantine is removed only after signature verification succeeds. This removes the download-quarantine flag from this app and its contents; it does not disable Gatekeeper globally or confer Apple trust. Do not run it against other applications or broad directories.

### Check the download itself

For the v3.8.3 DMG, run this from the folder containing the download:

```bash
shasum -a 256 Bubble.io-Dev-Studio-3.8.3-arm64.dmg
```

Expected SHA-256:

```text
9f2649690f63ea2f41c7949480f2086b9384c0ff26e2f46d3fff45cc4a1005df
```

The ZIP's SHA-256 is:

```text
a841769b53934acd3d7c00fb94a670aecc53bbc1b5912c8f6832807a30940063
```

These hashes are for the v3.8.3 release assets as built, and they match the published files only if those files are uploaded unchanged. A fresh local rebuild produces different hashes.

## Building and Verifying a Release

Build on macOS with Node.js, npm, and Xcode Command Line Tools installed:

```bash
npm ci
npm run dist:mac:arm64
```

The command builds the renderer and Electron code, then creates ARM64 DMG and ZIP assets in `release/`. The `afterPack` hook in `scripts/sign-mac-adhoc.cjs` signs the app and nested binaries. The `afterSign` hook in `scripts/verify-mac-signature.cjs` checks the signature and fails the build if it is invalid.

Verify the build-directory app:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Bubble Studio.app"
file "release/mac-arm64/Bubble Studio.app/Contents/MacOS/Bubble Studio"
```

The executable should report `arm64`. For release validation, also mount the generated DMG, verify the app inside it with the same `codesign` command, and launch-test an installed copy. Check both signature integrity and startup: either can fail independently. A local launch without quarantine does not demonstrate Gatekeeper acceptance of a downloaded app.

The v3.8.2 release passed the production build, deep signature checks of the build and DMG copies, an installed-app launch check, and a comparison of local asset hashes with GitHub's uploaded assets. The installed copy needed an app-specific quarantine exception.

The v3.8.3 build passed the production build and deep signature checks of the build-directory, DMG and ZIP copies, and its executable is ARM64. A launch check still needs to be run with no other copy of Bubble Studio open.

To move to Developer ID signing later, replace the ad-hoc signing hook/configuration with certificate signing and notarization, enable the appropriate Hardened Runtime configuration and entitlements, and verify the notarized distributable before publishing. Keep the deep signature-verification check.
