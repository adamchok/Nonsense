const UPSTREAM_HOST = 'nonsense-4a9d9.firebaseapp.com';
const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'OPTIONS'];
const ALLOWED_PATHS = new Set([
  '/__/auth/handler',
  '/__/auth/handler.js',
  '/__/auth/iframe',
  '/__/auth/iframe.js',
  '/__/auth/experiments.js',
  '/__/firebase/init.json',
]);

export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (!ALLOWED_PATHS.has(url.pathname)) {
    return new Response('Not found', { status: 404 });
  }
  if (!ALLOWED_METHODS.includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: ALLOWED_METHODS.join(', ') } });
  }
  url.hostname = UPSTREAM_HOST;
  url.protocol = 'https:';
  url.port = '';
  const upstream = new Request(url, request);
  upstream.headers.delete('Cookie');
  return fetch(upstream, { redirect: 'manual' });
}
