import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApolloEveMarket",
  description: "Buy and sell prices across the five major EVE trade hubs.",
  icons: {
    icon: [
      { url: "/favicon-16-dark.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32-dark.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon-dark.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0F0B13",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
