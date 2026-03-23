import type { Metadata } from "next";
import { Bebas_Neue, Barlow, Barlow_Condensed, Oswald } from "next/font/google";
import { EscalationPlotProvider } from "@/contexts/EscalationPlotContext";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas",
  subsets: ["latin"],
});
const barlow = Barlow({
  weight: ["300", "400", "500", "600"],
  variable: "--font-barlow",
  subsets: ["latin"],
});
const barlowCondensed = Barlow_Condensed({
  weight: ["300", "400", "600", "700"],
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
});
const oswald = Oswald({
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AEGIS — Advanced Early-Warning & Geostrategic Intelligence System",
  description:
    "AEGIS is an advanced early-warning and geostrategic intelligence system that surfaces conflict escalation risk using ACLED data and AI.",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${barlow.variable} ${barlowCondensed.variable} ${oswald.variable} overflow-x-hidden bg-[#020611] text-[#e2e8f0]`}
    >
      <body className="min-h-screen bg-[#020611] text-[#e2e8f0] antialiased">
        <EscalationPlotProvider>{children}</EscalationPlotProvider>
      </body>
    </html>
  );
}
