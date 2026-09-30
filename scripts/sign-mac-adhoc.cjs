const path = require('node:path');
const { signAsync } = require('@electron/osx-sign');

// Community builds have no Developer ID. Seal every nested binary and the app
// with an ad-hoc signature; this does not confer Apple trust or notarization.
module.exports = async function signMacAdhoc(context) {
  if (context.electronPlatformName !== 'darwin') return;
  await signAsync({
    app: path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`),
    platform: 'darwin',
    identity: '-',
    identityValidation: false,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    // Ad-hoc code has no Team ID for Hardened Runtime library validation.
    optionsForFile: () => ({ timestamp: 'none', hardenedRuntime: false })
  });
};
