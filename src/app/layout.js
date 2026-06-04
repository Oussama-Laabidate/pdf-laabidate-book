import "./globals.css";

export const metadata = {
  title: "Portfolio Archive",
  description: "Selected catalogs, projects, and event work.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22%23110f0d%22/><path d=%22M27 24h46v52H27z%22 fill=%22none%22 stroke=%22%23c9a84c%22 stroke-width=%226%22/><path d=%22M50 24v52%22 stroke=%22%23c9a84c%22 stroke-width=%224%22/></svg>",
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
