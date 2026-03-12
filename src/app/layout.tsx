import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AEGIS — Advanced Early-Warning & Geostrategic Intelligence System",
  description:
    "AEGIS is an advanced early-warning and geostrategic intelligence system that surfaces conflict escalation risk using ACLED data and AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-slate-950 text-slate-100">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
