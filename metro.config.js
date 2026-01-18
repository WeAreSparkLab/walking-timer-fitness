const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure public files are copied to output
config.resolver = {
  ...config.resolver,
  assetExts: [...(config.resolver?.assetExts || []), 'webmanifest'],
};

module.exports = config;
