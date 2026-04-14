import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://projpul.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ProjectPulse — Strategic control for technical projects",
    template: "%s | ProjectPulse",
  },
  description:
    "Multi-tenant platform for CRM, quality control and supervision of technical projects with geolocated photo evidence, AI-powered audits and RBAC workflows for field teams and clients.",
  applicationName: "ProjectPulse",
  keywords: [
    "project management",
    "quality control",
    "technical CRM",
    "construction supervision",
    "photo evidence",
    "AI audit",
    "field operations",
    "ProjectPulse",
  ],
  authors: [{ name: "ProjectPulse" }],
  creator: "ProjectPulse",
  publisher: "ProjectPulse",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "ProjectPulse",
    title: "ProjectPulse — Strategic control for technical projects",
    description:
      "Multi-tenant CRM + QA with geolocated evidence, AI-powered audits and RBAC workflows for technical teams and clients.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ProjectPulse — Strategic Control Console",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ProjectPulse — Strategic control for technical projects",
    description:
      "Multi-tenant CRM + QA with geolocated evidence, AI-powered audits and RBAC workflows.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
