// Babel transformer wrapper that turns on Expo Router async routes (one JS chunk per route)
// for production web bundles only.
//
// The supported switch is `extra.router.asyncRoutes` in app.json, but the Expo config is a
// runtime-fingerprint source, so flipping it there would change the Android runtime version
// and cut installed builds off from OTA updates. The flag only matters to the web client
// bundle, so it is injected here instead, where the fingerprint does not look.
//
// Native bundles and server (static-render) bundles are passed through untouched; the
// expo-router babel plugin also ignores the flag for them.
const path = require('path');

// @expo/metro-config is a dependency of `expo`, not of this project, so resolve it from there.
const upstream = require(
  require.resolve('@expo/metro-config/babel-transformer', {
    paths: [path.dirname(require.resolve('expo/package.json'))],
  })
);

function transform(args) {
  const { options } = args;
  const custom = options.customTransformOptions || {};
  const isWebClient =
    options.platform === 'web' && !options.dev && !custom.environment;
  if (!isWebClient) {
    return upstream.transform(args);
  }
  return upstream.transform({
    ...args,
    options: {
      ...options,
      customTransformOptions: { ...custom, asyncRoutes: 'true' },
    },
  });
}

module.exports = { ...upstream, transform };
