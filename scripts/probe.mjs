/**
 * Снимает фактические параметры элементов живого сайта:
 * размеры, цвета, шрифты, отступы. Нужен, чтобы повторить
 * служебные виджеты Тильды собственным кодом.
 *
 *   node scripts/probe.mjs "<селектор>" [ширина]
 */
import { chromium } from 'playwright';

const selector = process.argv[2];
const width = Number(process.argv[3] ?? 1440);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height: 900 },
  isMobile: width <= 640,
  hasTouch: width <= 640,
});

await page.goto('https://deford-studio.ru/', { waitUntil: 'load', timeout: 90_000 });
await page.waitForTimeout(12_000);

const data = await page.evaluate((sel) => {
  const props = [
    'position', 'left', 'right', 'top', 'bottom', 'zIndex',
    'width', 'height', 'padding', 'margin', 'gap',
    'display', 'alignItems', 'justifyContent', 'flexDirection',
    'background', 'backgroundColor', 'border', 'borderRadius', 'boxShadow',
    'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign',
    'opacity', 'transform',
  ];

  return [...document.querySelectorAll(sel)].slice(0, 6).map((el) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const out = {
      тег: el.tagName.toLowerCase(),
      классы: el.className?.toString().slice(0, 90),
      текст: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120),
      коробка: `${Math.round(box.width)}×${Math.round(box.height)} @ ${Math.round(box.x)},${Math.round(box.y)}`,
    };
    for (const p of props) {
      const v = cs[p];
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px') {
        out[p] = v.length > 110 ? v.slice(0, 110) + '…' : v;
      }
    }
    return out;
  });
}, selector);

console.log(JSON.stringify(data, null, 2));
await browser.close();
