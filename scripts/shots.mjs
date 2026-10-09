/**
 * Снимает скриншоты страницы на всех брейкпоинтах.
 * Используется и для эталона (живой сайт), и для копии (локальная сборка).
 *
 *   node scripts/shots.mjs <url> <префикс> [--sections]
 *
 * Эталон:  node scripts/shots.mjs https://deford-studio.ru/ ref
 * Копия:   node scripts/shots.mjs http://localhost:4321/     new
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'https://deford-studio.ru/';
const prefix = process.argv[3] ?? 'ref';
const outDir = new URL('../reference/', import.meta.url);

/* Брейкпоинты Тильды + типовые реальные ширины */
const widths = [1440, 1200, 980, 768, 640, 480, 375];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    isMobile: width <= 640,
    hasTouch: width <= 640,
  });

  await page.goto(url, { waitUntil: 'load', timeout: 90_000 });

  /* Прелоадер и появление секций: ждём, пока всё отыграет */
  await page.waitForTimeout(6000);

  /* Доскроллить до конца, чтобы сработали ленивые картинки и scroll-анимации */
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);

  const height = await page.evaluate(() => document.body.scrollHeight);

  /* Вся страница: fixed-элементы в такой кадр не попадают */
  await page.screenshot({
    path: new URL(`${prefix}-${width}.png`, outDir).pathname,
    fullPage: true,
  });

  /* Первый экран: нужен, чтобы видеть фиксированную шапку и виджеты */
  await page.screenshot({
    path: new URL(`${prefix}-${width}-top.png`, outDir).pathname,
  });

  console.log(`${prefix} ${width}px → высота страницы ${height}px`);
  await page.close();
}

await browser.close();
