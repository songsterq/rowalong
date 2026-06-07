// electron-builder afterPack hook: ad-hoc deep-sign the .app so it launches on
// Apple Silicon under our own bundle identifier. Without a Developer ID,
// electron-builder skips signing and leaves Electron's linker signature
// (identifier "Electron"); a clean ad-hoc sign fixes the identity and re-signs
// the bundle after the Info.plist / asar edits. Local only — no notarization.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], {
    stdio: 'inherit',
  });
};
