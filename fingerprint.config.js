// npm scripts don't affect the native build, so editing one must not change the
// runtime version (which would cut installed APKs off from OTA updates).
const { SourceSkips } = require('expo/fingerprint');

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun | SourceSkips.PackageJsonScriptsAll,
};
