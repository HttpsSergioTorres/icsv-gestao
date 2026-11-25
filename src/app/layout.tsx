import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/oswald/latin-500.css";
import "@fontsource/oswald/latin-600.css";
import "@fontsource/nunito-sans/latin-400.css";
import "@fontsource/nunito-sans/latin-600.css";
import "@fontsource/nunito-sans/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ICSV Gestão", template: "%s | ICSV Gestão" },
  description: "Gestão da Igreja de Cristo no Brasil — Campo San Vale",
  icons: { icon: { url: "/marca/icsv-icone.png", sizes: "180x180", type: "image/png" } },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
