import type { ExpoConfig } from "expo/config";

// Everything install-specific comes from the environment (see `.env.example`), so a self-hosted
// build only sets variables. The scheme must be listed in the Worker's AUTH_TRUSTED_ORIGINS.
const scheme = process.env.OMNI_IOS_SCHEME || "omni";

const config: ExpoConfig = {
  name: process.env.OMNI_IOS_NAME || "Omni",
  slug: "omni",
  version: process.env.OMNI_IOS_VERSION || "0.1.0",
  icon: "./assets/icon.png",
  orientation: "portrait",
  scheme,
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: process.env.OMNI_IOS_BUNDLE_ID || "app.omni.ios",
    // Each upload to App Store Connect needs a higher build number than the last.
    buildNumber: process.env.OMNI_IOS_BUILD_NUMBER || "1",
    // Set for a signed build (the release script); empty leaves signing to Xcode.
    ...(process.env.OMNI_IOS_TEAM_ID ? { appleTeamId: process.env.OMNI_IOS_TEAM_ID } : {}),
    supportsTablet: false,
    // HTTPS only, nothing of its own: no export compliance documents to file.
    config: { usesNonExemptEncryption: false },
  },
  plugins: ["expo-router", "expo-secure-store"],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
