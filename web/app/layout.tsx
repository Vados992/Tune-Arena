import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TUNE ARENA · Turbo Vote",
  description: "A private pilot for community-voted automotive tuning contests.",
  referrer:"no-referrer",
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
