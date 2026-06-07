import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest() {
  return {
    name: SITE_NAME,
    short_name: "LO Publications",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0c0f17",
    theme_color: "#476fff",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
