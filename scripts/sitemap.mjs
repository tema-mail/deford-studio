// Карта сайта после сборки: страницы, которые deford.ru считает своими. Не попадают кабинет, черновики, прототипы
// и страницы, у которых канонический адрес на другом сайте (копии лендингов клиентов: /flowers, /targetfactory).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SITE = 'https://deford.ru';
const DIST = 'dist';
const CLOSED = ['admin', 'drafts', 'prototypes'];

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return CLOSED.includes(path.relative(DIST, p)) ? [] : pages(p);
    return e.name === 'index.html' ? [p] : [];
  });
}

const urls = [];
for (const file of pages(DIST)) {
  const url = `${SITE}/${path.relative(DIST, path.dirname(file)).split(path.sep).join('/')}`.replace(/\/?$/, '/');
  const canonical = /rel="canonical" href="([^"]+)"/.exec(readFileSync(file, 'utf8'))?.[1];
  if (canonical === url) urls.push(url);
}
urls.sort();
if (!urls.includes(`${SITE}/`)) throw new Error('в карте сайта нет главной: проверьте canonical');
writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`Карта сайта: ${urls.length} адресов`);
