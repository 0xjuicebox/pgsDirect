const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// This tells Metro to pass your global.css through Tailwind before compiling!
module.exports = withNativeWind(config, { input: "./src/global.css" });
