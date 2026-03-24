import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FichurGoogleAnalytics } from "@/components/analytics/FichurGoogleAnalytics";
import { AppShell } from "@/components/shared/AppShell";
import {
  getGaMeasurementId,
  shouldInjectGoogleAnalytics,
} from "@/lib/analytics/gaConfig";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fichur",
  description:
    "Encuentra vacantes donde realmente encajas y crea tu perfil con IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = getGaMeasurementId();
  const loadGa = shouldInjectGoogleAnalytics() && !!gaId;

  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {loadGa ? (
          <FichurGoogleAnalytics
            gaId={gaId!}
            debugMode={process.env.NODE_ENV !== "production"}
          />
        ) : null}

        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}