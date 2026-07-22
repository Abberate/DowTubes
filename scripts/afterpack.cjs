// electron-builder afterPack hook (macOS): flip Electron fuses, THEN ad-hoc sign.
// - RunAsNode off: otherwise ELECTRON_RUN_AS_NODE in the launch environment makes
//   the packaged app run as a plain Node script instead of the GUI app (and exit).
//   Also standard production hardening.
// - Ad-hoc signature: unsigned apps are killed by AMFI on Apple Silicon.
// Fuses MUST be flipped before signing (flipping mutates the binary), so we do both
// here rather than via electron-builder's electronFuses (which flips after signing).
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  const exe = join(appPath, 'Contents', 'MacOS', appName)

  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: false,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false
  })

  console.log(`  • afterPack: fuses flipped + ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
