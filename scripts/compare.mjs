/**
 * Снимает одну секцию на живом сайте и в копии — для поштучной сверки.
 *
 *   node scripts/compare.mjs "#deford-footer-v1" footer [ширина]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const [selector, name, widthArg] = process.argv.slice(2);
const width = Number(widthArg ?? 1440);
const outDir = new URL('../reference/', import.meta.url);
await mkdir(outDir, { recursive: true });

const targets = [
  ['https://deford-studio.ru/', 'ref'],
  ['http://localhost:4322/', 'new'],
];

const browser = await chromium.launch();

for (const [url, prefix] of targets) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    isMobile: width <= 640,
    hasTouch: width <= 640,
  });

  await page.goto(url, { waitUntil: 'load', timeout: 90_000 });

  /* Прелоадер живого сайта держится несколько секунд — ждём его ухода */
  await page
    .waitForFunction(
      () => {
        const loader = document.getElementById('dfWowLoader');
        return !loader || loader.classList.contains('is-hide');
      },
      { timeout: 30_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(3000);

  const el = page.locator(selector).first();
  const count = await el.count();

  if (!count) {
    console.log(`${prefix}: секция ${selector} не найдена`);
    await page.close();
    continue;
  }

  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);

  const box = await el.boundingBox();
  await el.screenshot({
    path: new URL(`cmp-${name}-${prefix}-${width}.png`, outDir).pathname,
  });

  console.log(
    `${prefix} ${width}px: ${selector} → ${Math.round(box.width)}×${Math.round(box.height)}`,
  );
  await page.close();
}

await browser.close();
