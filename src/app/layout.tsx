import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import { AmbientBackground } from "@/components/AmbientBackground";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FC26 Auction League",
  description: "Live auction market for your FC26 friend league",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable}`}>
      <body className="font-body min-h-screen">
        <AmbientBackground />
        {children}
      </body>
    </html>
  );
}
