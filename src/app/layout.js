import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, getSiteUrl } from "@/lib/site";

export const metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: "Laabidate Oussama | Publications",
    template: "%s | Laabidate Oussama",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Laabidate Oussama",
    "publications",
    "catalogs",
    "portfolio",
    "CV",
    "photography",
    "visual design",
  ],
  authors: [{ name: "Laabidate Oussama", url: "https://laabidate-oussama.vercel.app/" }],
  creator: "Laabidate Oussama",
  publisher: "Laabidate Oussama",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Laabidate Oussama | Publications",
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Laabidate Oussama | Publications",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "portfolio",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22%23110f0d%22/><path d=%22M27 24h46v52H27z%22 fill=%22none%22 stroke=%22%23c9a84c%22 stroke-width=%226%22/><path d=%22M50 24v52%22 stroke=%22%23c9a84c%22 stroke-width=%224%22/></svg>",
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
