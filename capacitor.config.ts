import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ergsmartcoach.app',
  appName: 'ergcoach',
  webDir: 'dist',
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "Scanning for rowing devices...",
        cancel: "Cancel",
        availableDevices: "Available devices",
        noDeviceFound: "No devices found"
      }
    }
  }
};

export default config;