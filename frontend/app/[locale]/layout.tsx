import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Toaster } from "sonner";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://projpul.com";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: safeLocale, namespace: "meta" });

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: t("title"),
      template: `%s | ${t("siteName")}`,
    },
    description: t("description"),
    applicationName: t("siteName"),
    keywords: t("keywords").split(","),
    authors: [{ name: t("siteName") }],
    creator: t("siteName"),
    publisher: t("siteName"),
    alternates: {
      canonical: safeLocale === routing.defaultLocale ? "/" : `/${safeLocale}`,
      languages: {
        es: "/",
        en: "/en",
      },
    },
    openGraph: {
      type: "website",
      locale: safeLocale === "es" ? "es_MX" : "en_US",
      url: safeLocale === routing.defaultLocale ? siteUrl : `${siteUrl}/${safeLocale}`,
      siteName: t("siteName"),
      title: t("title"),
      description: t("description"),
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: `${t("siteName")} — Strategic Control Console`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
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
}

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
