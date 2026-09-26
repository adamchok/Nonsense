const { SourceSkips } = require('expo/fingerprint');

module.exports = {
  sourceSkips: SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun | SourceSkips.PackageJsonScriptsAll,
};
