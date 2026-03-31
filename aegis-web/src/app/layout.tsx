import type { Metadata } from "next";
import { Bebas_Neue, Barlow, Barlow_Condensed, Oswald } from "next/font/google";
import { DeployBanner } from "@/components/DeployBanner";
import { EscalationPlotProvider } from "@/contexts/EscalationPlotContext";
import { UiProviders } from "@/components/ui/UiProviders";
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
    "AEGIS is an advanced early-warning and geostrategic intelligence system that surfaces conflict escalation risk from multi-source data and AI-assisted analysis.",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const deploymentIso =
    process.env.VERCEL_GIT_COMMIT_TIMESTAMP ||
    process.env.VERCEL_DEPLOYMENT_CREATED_AT ||
    process.env.NEXT_PUBLIC_DEPLOYED_AT ||
    new Date().toISOString();
  const deploymentDisplay = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(deploymentIso));
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${barlow.variable} ${barlowCondensed.variable} ${oswald.variable} overflow-x-hidden bg-[#020611] text-[#e2e8f0]`}
    >
      <body className="min-h-screen bg-[#020611] text-[#e2e8f0] antialiased">
        <DeployBanner deploymentDisplay={deploymentDisplay} />
        <EscalationPlotProvider>
          <UiProviders>{children}</UiProviders>
        </EscalationPlotProvider>
      </body>
    </html>
  );
}
