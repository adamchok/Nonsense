const path = require('path');

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
