// electron-builder afterPack hook: ad-hoc sign the macOS .app.
// Unsigned apps are killed by Gatekeeper/AMFI on Apple Silicon, so even for
// "unsigned" internal sharing the app needs at least an ad-hoc signature.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  console.log(`  • afterPack: ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
