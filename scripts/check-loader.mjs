/** Сверяет, как ведёт себя заставка в оригинале и в копии. */
import { chromium } from 'playwright';

const browser = await chromium.launch();

for (const [url, label] of [
  ['https://deford-studio.ru/', 'оригинал'],
  ['http://localhost:4322/', 'копия   '],
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 90_000 });

  let hidden = null;
  try {
    await page.waitForFunction(
      () => document.getElementById('dfWowLoader')?.classList.contains('is-hide'),
      { timeout: 30_000 },
    );
    hidden = Date.now() - t0;
  } catch {}

  const state = await page.evaluate(() => {
    const l = document.getElementById('dfWowLoader');
    if (!l) return 'заставки нет в разметке';
    const cs = getComputedStyle(l);
    return `opacity ${cs.opacity}, visibility ${cs.visibility}, pointer-events ${cs.pointerEvents}`;
  });

  console.log(`${label}: ушла через ${hidden ?? 'НЕ УШЛА'} мс | ${state}`);
  await page.close();
}

await browser.close();
