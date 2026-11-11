import type { Metadata, Viewport } from "next";
import TelegramRuntime from "./telegram-runtime";
import PwaRuntime from "./pwa-runtime";
import "./globals.css";

export const metadata: Metadata = {
  title: "TUNE ARENA · Turbo Vote",
  description: "Community-voted automotive tuning contests. Your garage, on every screen.",
  applicationName: "Tune Arena",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tune Arena", statusBarStyle: "black" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  referrer:"no-referrer",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d0f13" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><head><script src="https://telegram.org/js/telegram-web-app.js"/></head><body><PwaRuntime/><TelegramRuntime>{children}</TelegramRuntime></body></html>;
}
