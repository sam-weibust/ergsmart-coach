import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.ea318c35b2de484ead4b07f10d49611c',
  appName: 'ergcoach',
  webDir: 'dist',
  server: {
    url: 'https://ea318c35-b2de-484e-ad4b-07f10d49611c.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
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