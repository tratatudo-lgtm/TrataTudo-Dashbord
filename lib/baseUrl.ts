/**
 * Get the base URL for the application.
 * This should only be used on the server side.
 */
export function getBaseUrl() {
  // 1. Priority: NEXT_PUBLIC_SITE_URL (if it exists and starts with http)
  if (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.startsWith('http')) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  // 2. Priority: APP_URL (if it exists and starts with http)
  if (process.env.APP_URL && process.env.APP_URL.startsWith('http')) {
    return process.env.APP_URL;
  }

  // 3. Priority: VERCEL_URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 4. Fallback: localhost (only for development)
  return 'http://localhost:3000';
}
