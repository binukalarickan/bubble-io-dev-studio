const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Fail packaging before creating distributables if the macOS bundle signature is invalid.
module.exports = async function verifyMacSignature(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    stdio: 'inherit'
  });
};
