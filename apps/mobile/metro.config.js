// Expo detects the pnpm workspace automatically (watchFolders + node_modules lookup).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
