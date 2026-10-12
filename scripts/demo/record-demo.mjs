import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_EMAIL, DEMO_PASSWORD, LIVE_SESSION_ID, seed } from './seed-demo.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const APP_URL = process.env.APP_URL ?? 'http://localhost:8790';
const OUT_DIR = join(process.cwd(), 'public', 'media');
const RAW_DIR = join(tmpdir(), 'nonsense-demo-raw');
const VIEWPORT = { width: 390, height: 844 };
const VIDEO_SIZE = VIEWPORT;
const FFMPEG =
  process.env.FFMPEG ?? join(homedir(), 'AppData', 'Local', 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe');
const THEME_KEY = '@nonsense_theme_preference';
const THEME = process.env.THEME === 'light' ? 'light' : 'dark';
const SUFFIX = THEME === 'light' ? '-light' : '';

const TAP_FX = `
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '::-webkit-scrollbar{display:none} *{scrollbar-width:none}' +
      '.demo-tap{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;' +
      'background:rgba(245,196,81,.35);border:2px solid rgba(245,196,81,.9);pointer-events:none;z-index:2147483647;' +
      'animation:demo-tap .5s ease-out forwards}' +
      '@keyframes demo-tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.3);opacity:0}}';
    document.head.appendChild(style);
  });
  addEventListener('pointerdown', (e) => {
    const dot = document.createElement('div');
    dot.className = 'demo-tap';
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  }, true);
`;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function tap(page, locator, after = 550) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await pause(150);
  await page.mouse.down();
  await pause(70);
  await page.mouse.up();
  await pause(after);
}

async function typeSlowly(page, locator, value) {
  await tap(page, locator, 200);
  await locator.fill('');
  await locator.pressSequentially(value, { delay: 110 });
  await pause(350);
}

async function smoothScroll(page, dy, steps = 20) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await pause(30);
  }
  await pause(400);
}

async function drag(page, fromX, toX, y, steps = 40) {
  await page.mouse.move(fromX, y, { steps: 5 });
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps });
  await pause(500);
  await page.mouse.up();
}

const CLIPS = {
  'live-session': {
    path: `/session/${LIVE_SESSION_ID}`,
    ready: (page) => page.getByText('Chris').first().waitFor(),
    async run(page) {
      await pause(900);
      await tap(page, page.getByRole('button', { name: 'Add buy-in' }), 700);
      const dialog = page.getByRole('dialog', { name: 'Add Buy-In' });
      await tap(page, dialog.getByRole('button', { name: /^Rebuy Chris/ }), 500);
      await tap(page, dialog.getByRole('button', { name: /^Amount \$100(\.00)?$/ }).first(), 500);
      await tap(page, dialog.getByRole('button', { name: /^Add$/ }), 1400);
      await smoothScroll(page, 260);
      await pause(1200);
    },
  },
  'settle-up': {
    posterAtEnd: true,
    path: `/session/${LIVE_SESSION_ID}`,
    ready: (page) => page.getByText('End Session & Cash Out').waitFor(),
    async run(page) {
      await pause(700);
      await tap(page, page.getByText('End Session & Cash Out'), 1200);
      const stacks = { Chris: '80', Sam: '120', Priya: '75', Jordan: '140', Alex: '385' };
      for (const [name, value] of Object.entries(stacks)) {
        await typeSlowly(page, page.getByLabel(`Cash-out amount for ${name}`), value);
      }
      await pause(500);
      await tap(page, page.getByText('Confirm & View Summary'), 900);
      await tap(page, page.getByRole('button', { name: 'Settle' }), 2000);
      await smoothScroll(page, 340, 30);
      await pause(1500);
    },
  },
  history: {
    path: '/history',
    ready: (page) => page.getByText('Profit over time').first().waitFor(),
    async run(page) {
      await pause(900);
      const box = await page.getByText('Profit over time').first().boundingBox();
      const y = box.y + 150;
      const clear = () => tap(page, page.getByRole('button', { name: 'Clear selection' }).first(), 700);
      await drag(page, 70, 360, y);
      await pause(900);
      await clear();
      await tap(page, page.getByRole('radio', { name: 'Bars', exact: true }).first(), 900);
      await drag(page, 360, 80, y);
      await pause(900);
      await clear();
      await smoothScroll(page, 360);
      await pause(1000);
    },
  },
  friends: {
    path: '/friends',
    ready: (page) => page.getByText('Jordan').first().waitFor(),
    async run(page) {
      await pause(1300);
      await tap(page, page.getByText('Groups', { exact: true }).first(), 1800);
      await tap(page, page.getByText('Leaderboard', { exact: true }).first(), 2600);
      await smoothScroll(page, 240);
      await pause(1000);
    },
  },
};

async function signIn(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: THEME });
  const page = await context.newPage();
  await page.addInitScript(([key, theme]) => localStorage.setItem(key, theme), [THEME_KEY, THEME]);
  await page.goto(`${APP_URL}/sign-in`);
  await page.getByRole('textbox', { name: 'Email' }).fill(DEMO_EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 20_000 });
  await page.getByText('History').first().waitFor({ timeout: 20_000 });
  const state = await context.storageState({ indexedDB: true });
  await context.close();
  return state;
}

function newestVideo(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

async function record(browser, state, name) {
  const clip = CLIPS[name];
  const dir = join(RAW_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: THEME,
    storageState: state,
    recordVideo: { dir, size: VIDEO_SIZE },
  });
  await context.addInitScript(TAP_FX);
  await context.addInitScript(([key, theme]) => localStorage.setItem(key, theme), [THEME_KEY, THEME]);
  const startedAt = Date.now();
  const page = await context.newPage();
  await page.goto(`${APP_URL}${clip.path}`);
  await clip.ready(page);
  await pause(800);
  const trimStart = (Date.now() - startedAt) / 1000;
  const poster = () => page.screenshot({ path: join(OUT_DIR, `${name}${SUFFIX}.jpg`), type: 'jpeg', quality: 82 });
  if (!clip.posterAtEnd) await poster();
  await clip.run(page);
  if (clip.posterAtEnd) await poster();
  const trimEnd = (Date.now() - startedAt) / 1000;
  await context.close();

  execFileSync(
    FFMPEG,
    [
      '-y', '-loglevel', 'error', '-i', newestVideo(dir),
      '-ss', trimStart.toFixed(2), '-to', trimEnd.toFixed(2),
      '-an', '-c:v', 'libvpx', '-b:v', '1400k', '-crf', '12', '-deadline', 'good', '-auto-alt-ref', '0',
      join(OUT_DIR, `${name}${SUFFIX}.webm`),
    ],
    { stdio: 'inherit' }
  );
  const size = statSync(join(OUT_DIR, `${name}${SUFFIX}.webm`)).size;
  console.log(`${name}: ${(trimEnd - trimStart).toFixed(1)}s, ${(size / 1024).toFixed(0)} KB`);
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS);
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const name of names) {
      await seed();
      const state = await signIn(browser);
      await record(browser, state, name);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
