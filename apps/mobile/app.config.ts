import type { ConfigContext, ExpoConfig } from 'expo/config';

// Values come from apps/mobile/.env (see .env.example). EXPO_PUBLIC_* are inlined into the app bundle.
const GOOGLE_MAPS_ANDROID_KEY = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const GOOGLE_MAPS_IOS_KEY = process.env.GOOGLE_MAPS_IOS_API_KEY ?? '';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Gadget Galli',
  slug: 'gadget-galli',
  owner: process.env.EXPO_OWNER || undefined,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'gadgetgalli',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'in.gadgetgalli.app',
    supportsTablet: false,
    config: GOOGLE_MAPS_IOS_KEY ? { googleMapsApiKey: GOOGLE_MAPS_IOS_KEY } : undefined,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Gadget Galli uses your location to show shops that deliver to you.',
      NSCameraUsageDescription: 'Take photos of your shop, products, packages and reviews.',
      NSPhotoLibraryUsageDescription: 'Choose photos of your shop, products and reviews.',
      LSApplicationQueriesSchemes: ['whatsapp', 'upi', 'tez', 'phonepe', 'paytmmp', 'gpay', 'porter', 'rapido', 'uber', 'comgooglemaps'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'in.gadgetgalli.app',
    adaptiveIcon: {
      backgroundColor: '#4F46E5',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'VIBRATE', 'POST_NOTIFICATIONS'],
    config: GOOGLE_MAPS_ANDROID_KEY ? { googleMaps: { apiKey: GOOGLE_MAPS_ANDROID_KEY } } : undefined,
    intentFilters: [
      {
        action: 'VIEW',
        data: [{ scheme: 'gadgetgalli' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#4F46E5', image: './assets/images/splash-icon.png', imageWidth: 220, dark: { backgroundColor: '#1E1B4B' } },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#4F46E5',
        sounds: ['./assets/sounds/new_order.wav'],
      },
    ],
    ['expo-location', { locationWhenInUsePermission: 'Gadget Galli uses your location to show shops that deliver to you.' }],
    ['expo-image-picker', { photosPermission: 'Choose photos of your shop, products and reviews.', cameraPermission: 'Take photos of your shop, products and packages.' }],
    'expo-font',
    'expo-localization',
    'expo-audio',
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: false,
  },
  extra: {
    eas: EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined,
  },
});
