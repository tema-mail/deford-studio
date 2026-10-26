// Снимок главной для игры Destroy Any Website (destroy.spritefusion.com).
// Игра грузит страницу без скриптов, а первый экран Дефорда собирается на JS,
// поэтому даём ей готовую отрисовку: ждём конец анимаций, застываем,
// убираем прелоадер, курсор, попапы и все <script>, свои стили вшиваем.
// Запуск: node scripts/destroy-snapshot.mjs [адрес] → public/destroy.html
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] || 'https://deford.ru/';
const out = new URL('../public/destroy.html', import.meta.url);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(14000);

const html = await page.evaluate(async () => {
  // Свои стили – внутрь страницы: имена /_astro/*.css меняются при каждой сборке.
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (new URL(link.href).origin !== location.origin) continue;
    const style = document.createElement('style');
    style.textContent = await (await fetch(link.href)).text();
    link.replaceWith(style);
  }

  // Конечное состояние анимаций – в инлайн-стили, сами анимации снять.
  for (const a of document.getAnimations()) {
    try { a.finish(); } catch {}
    try { a.commitStyles(); } catch {}
    a.cancel();
  }
  document.querySelectorAll(
    'script, noscript, #dfWowLoader, .df-cursor, .df-cursor-filter, .df-popup, .df-cookie, .df-contact, .dff-destroy'
  ).forEach((el) => el.remove());

  const head = document.head;
  head.insertAdjacentHTML('afterbegin', '<meta name="robots" content="noindex, nofollow">');
  head.insertAdjacentHTML(
    'beforeend',
    '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>'
  );
  return '<!DOCTYPE html>' + document.documentElement.outerHTML;
});

writeFileSync(out, html);
console.log(`${out.pathname}: ${(html.length / 1024).toFixed(0)} КБ`);
await browser.close();
