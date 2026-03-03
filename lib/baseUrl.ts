import { headers } from "next/headers";

/**
 * Devolve sempre uma URL ABSOLUTA (com https://...) para ser usada em SSR.
 * Nunca retorna vazio.
 */
export function getBaseUrl() {
  // 1) Melhor opção (define na Vercel):
  // NEXT_PUBLIC_SITE_URL = https://trata-tudo-dashbord.vercel.app
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && site.startsWith("http")) return site.replace(/\/$/, "");

  // 2) Vercel fornece VERCEL_URL sem protocolo (ex: trata-tudo-dashbord.vercel.app)
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 3) return `https://${vercel}`;

  // 3) Fallback por headers (runtime request)
  const h = headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host) return `${proto}://${host}`;

  // 4) Último fallback fixo
  return "https://trata-tudo-dashbord.vercel.app";
}