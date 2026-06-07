/// <reference types="@capacitor/push-notifications" />
import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const DEFAULT_CAPACITOR_SERVER_URL = "https://pick-it-game2026.vercel.app";
const capacitorServerUrl = process.env.CAPACITOR_SERVER_URL ?? DEFAULT_CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.semios.pickit",
  appName: "PICK-IT!",
  webDir: "native-shell/www",
  server: {
    url: capacitorServerUrl,
    cleartext: capacitorServerUrl.startsWith("http://"),
    androidScheme: "https"
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"]
    }
  }
};

export default config;
