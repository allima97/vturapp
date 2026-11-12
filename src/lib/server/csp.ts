export function buildCspPolicy(dev: boolean) {
  const connectSrc = [
    "'self'",
    'data:',
    'https://challenges.cloudflare.com',
    'https://cloudflareinsights.com'
  ];
  if (dev) connectSrc.push('http:', 'https:', 'ws:', 'wss:');

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    dev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com"
      : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    `connect-src ${Array.from(new Set(connectSrc)).join(' ')}`,
    'frame-src https://challenges.cloudflare.com',
    "worker-src 'self' blob:",
    "form-action 'self'"
  ].join('; ');
}
