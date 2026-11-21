import type { Metadata, Viewport } from "next";
import { Josefin_Sans, Roboto_Mono, Space_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
});

const josefinSans = Josefin_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-josefin-sans",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-roboto-mono",
});

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
      <body
        className={`${spaceMono.variable} ${josefinSans.variable} ${robotoMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
