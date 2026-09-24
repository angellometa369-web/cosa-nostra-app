import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cosa Nostra / The Godfather Club",
  description: "Ranking real y torneos de dominó — BetaDomino",
};

/**
 * Layout mínimo: la UI principal es la PWA estática en /public/index.html.
 * El body solo envuelve rutas React residuales (/status, etc.).
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#000" }}>{children}</body>
    </html>
  );
}
