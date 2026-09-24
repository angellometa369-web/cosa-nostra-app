import { redirect } from "next/navigation";

/**
 * La app de usuario es la PWA estática (public/index.html).
 * Un solo proceso Next.js sirve PWA + /api/* en el puerto 3000.
 */
export default function Home() {
  redirect("/index.html");
}
