const base = require('./app.json').expo;

module.exports = ({ config }) => {
  return {
    ...base,
    ...config,
    scheme: 'nodobito-matching',
    ios: { ...base.ios, ...config.ios, bundleIdentifier: 'com.nodobito.matching' },
    android: { ...base.android, ...config.android, package: 'com.nodobito.matching' },
    extra: {
      ...config.extra,
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || '',
    },
  };
};
