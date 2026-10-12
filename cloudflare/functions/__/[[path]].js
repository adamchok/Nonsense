export async function onRequest({ request }) {
  const url = new URL(request.url);
  url.hostname = 'nonsense-4a9d9.firebaseapp.com';
  url.protocol = 'https:';
  url.port = '';
  return fetch(new Request(url, request), { redirect: 'manual' });
}
