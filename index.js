// index.js
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

if (typeof window !== 'undefined') {
  window.__EXPO_ROUTER_DEBUG = { routeInfoOverlay: false };
}
import 'expo-router/entry';
