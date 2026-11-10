import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Kings Korners",
  description: "Play Kings Corners online with 2–4 friends. Share a link and play.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d5c36" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
