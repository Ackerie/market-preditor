import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ackerie.nexustrade",
  appName: "NexusTrade",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
};

export default config;
