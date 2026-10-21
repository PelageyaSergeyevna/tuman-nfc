import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.tuman.attendance',
  appName: 'Tuman Attendance',
  webDir: 'www',
  android: {
    allowMixedContent: false,
  }
};

export default config;
