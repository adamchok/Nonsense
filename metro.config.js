// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Split the production web bundle per route (see metro.transformer.js for why this is not
// set in app.json). Native bundles are unaffected.
config.transformer.babelTransformerPath = require.resolve('./metro.transformer.js');

module.exports = config;
