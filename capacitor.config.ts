/*
 * ============================================================
 * CREWSYNC MOBILE APP — BUILD & SUBMIT GUIDE
 * ============================================================
 *
 * PREREQUISITES
 * -------------
 * npm install -g @capacitor/cli
 * Xcode 15+ (iOS), Android Studio Giraffe+ (Android)
 *
 * INITIAL SETUP (one time)
 * ------------------------
 * npm run build          # build the web assets
 * npx cap add ios        # creates ios/ directory
 * npx cap add android    # creates android/ directory
 *
 * iOS PERMISSIONS — add to ios/App/App/Info.plist:
 * <key>NSBluetoothAlwaysUsageDescription</key>
 * <string>CrewSync connects to Concept2 PM5 ergs and heart rate monitors via Bluetooth.</string>
 * <key>NSBluetoothPeripheralUsageDescription</key>
 * <string>CrewSync connects to Concept2 PM5 ergs and heart rate monitors via Bluetooth.</string>
 * <key>NSLocationWhenInUseUsageDescription</key>
 * <string>Bluetooth scanning requires location permission on iOS.</string>
 *
 * ANDROID PERMISSIONS — add to android/app/src/main/AndroidManifest.xml (inside <manifest>):
 * <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
 * <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
 * <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
 * <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
 * <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
 * <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
 *
 * DAILY DEVELOPMENT
 * -----------------
 * npm run build && npx cap sync   # sync web build to native projects
 * npx cap open ios                # open Xcode
 * npx cap open android            # open Android Studio
 *
 * APP STORE SUBMIT (iOS)
 * ----------------------
 * 1. In Xcode: set Team, Bundle ID = com.crewsync.app, version/build
 * 2. Product → Archive → Distribute App → App Store Connect
 * 3. Log in at appstoreconnect.apple.com → submit for review
 *
 * GOOGLE PLAY SUBMIT (Android)
 * ----------------------------
 * 1. In Android Studio: Build → Generate Signed Bundle/APK → Android App Bundle
 * 2. Upload .aab to play.google.com/console → Production → Submit
 *
 * ENVIRONMENT VARIABLES (set in Capacitor server config or native env):
 * VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * ============================================================
 */

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.crewsync.app',
  appName: 'CrewSync',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'crewsync.app',
      '*.crewsync.app',
      'log.concept2.com',
      '*.supabase.co',
      '*.supabase.in',
    ],
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Scanning for rowing devices…',
        cancel: 'Cancel',
        availableDevices: 'Available devices',
        noDeviceFound: 'No devices found',
      },
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a1628',
      splashFullScreen: true,
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0a1628',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    backgroundColor: '#0a1628',
  },
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: false,
  },
};

export default config;
