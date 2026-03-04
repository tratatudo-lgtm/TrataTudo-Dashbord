/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // IMPORTANTÍSSIMO:
  // NÃO usar output: 'export' neste projeto (tem cookies/headers/api routes)
  // output: 'export',

  experimental: {
    // mantém default; não inventar export estático
  },
};

export default nextConfig;