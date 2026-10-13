import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

type Handler = (context: { request: Request }) => Promise<Response>;

const handlerUrl = pathToFileURL(path.resolve('cloudflare/functions/__/[[path]].js')).href;
const { onRequest } = (await import(handlerUrl)) as { onRequest: Handler };

const realFetch = globalThis.fetch;
let forwarded: { request: Request; init?: RequestInit }[] = [];

globalThis.fetch = (async (input: Request, init?: RequestInit) => {
  forwarded.push({ request: input, init });
  return new Response('upstream', { status: 200 });
}) as typeof fetch;

afterEach(() => {
  forwarded = [];
});

test.after(() => {
  globalThis.fetch = realFetch;
});

function call(url: string, init?: RequestInit): Promise<Response> {
  return onRequest({ request: new Request(url, init) });
}

test('rejects every path outside the Firebase auth helper allowlist without contacting upstream', async () => {
  for (const url of [
    'https://nonsense.adamchok.com/__/other',
    'https://nonsense.adamchok.com/__/authx/handler',
    'https://nonsense.adamchok.com/__/',
    'https://nonsense.adamchok.com/__/auth/',
    'https://nonsense.adamchok.com/__/auth/links',
    'https://nonsense.adamchok.com/__/firebase/other.json',
    'https://nonsense.adamchok.com/__/auth/..%2f..%2fevil',
    'https://nonsense.adamchok.com/__/auth/%2e%2e/%2e%2e/evil',
    'https://nonsense.adamchok.com/__/auth//evil.com/x',
    'https://nonsense.adamchok.com/__/auth/handler/',
    'https://nonsense.adamchok.com/__/auth/handler%2f',
    'https://nonsense.adamchok.com/__/AUTH/handler',
  ]) {
    const res = await call(url);
    assert.equal(res.status, 404, url);
  }
  assert.equal(forwarded.length, 0);
});

test('rejects methods other than GET, HEAD, POST and OPTIONS', async () => {
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    const res = await call('https://nonsense.adamchok.com/__/auth/handler', { method });
    assert.equal(res.status, 405, method);
  }
  assert.equal(forwarded.length, 0);
});

test('forwards allowed paths to the fixed Firebase host with manual redirects', async () => {
  const res = await call('http://nonsense.adamchok.com:8788/__/auth/handler?apiKey=x&mode=signIn');
  assert.equal(res.status, 200);
  assert.equal(forwarded.length, 1);
  const { request, init } = forwarded[0];
  const url = new URL(request.url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'nonsense-4a9d9.firebaseapp.com');
  assert.equal(url.pathname, '/__/auth/handler');
  assert.equal(url.search, '?apiKey=x&mode=signIn');
  assert.equal(init?.redirect, 'manual');
});

test('forwards /__/firebase/init.json and POST requests', async () => {
  await call('https://nonsense.adamchok.com/__/firebase/init.json');
  await call('https://nonsense.adamchok.com/__/auth/handler', { method: 'POST', body: 'a=1' });
  assert.equal(forwarded.length, 2);
  assert.equal(new URL(forwarded[0].request.url).pathname, '/__/firebase/init.json');
  assert.equal(forwarded[1].request.method, 'POST');
  assert.equal(await forwarded[1].request.text(), 'a=1');
});

test('strips the Cookie header and keeps other headers', async () => {
  await call('https://nonsense.adamchok.com/__/auth/iframe', {
    headers: { Cookie: 'session=secret', Accept: 'text/html' },
  });
  const { request } = forwarded[0];
  assert.equal(request.headers.get('cookie'), null);
  assert.equal(request.headers.get('accept'), 'text/html');
});

test('forwards each allowlisted Firebase auth helper path', async () => {
  const paths = [
    '/__/auth/handler',
    '/__/auth/handler.js',
    '/__/auth/iframe',
    '/__/auth/iframe.js',
    '/__/auth/experiments.js',
    '/__/firebase/init.json',
  ];
  for (const p of paths) {
    const res = await call(`https://nonsense.adamchok.com${p}?v=1`);
    assert.equal(res.status, 200, p);
  }
  assert.deepEqual(
    forwarded.map(({ request }) => new URL(request.url).pathname),
    paths
  );
});
