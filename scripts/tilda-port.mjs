/**
 * Перенос портфолио и отзывов deford-studio.ru (Тильда) в данные сайта.
 *
 *   node scripts/tilda-port.mjs [--cache=папка] [--only=slug,slug] [--no-img]
 *
 * Что делает:
 *  1. Собирает список страниц: /keys_all, /reviews, 13 разделов портфолио
 *     (ссылки /keys_* с /keys_all) и все кейсы – адреса товаров каталога.
 *  2. Режет каждую страницу на блоки Тильды (div.t-rec). Блоки, которые есть
 *     почти на всех страницах (шапка, меню, подвал, попап заявки, виджеты), –
 *     общая оболочка: src/data/portfolio/shell.json. Остальные – свои блоки
 *     страницы: src/data/portfolio/pages/<slug>.json.
 *  3. Разметку и CSS блоков переносит как есть (каскад Тильды сохраняется),
 *     скрипты выбрасывает – поведение пишем своим кодом. Картинки CDN →
 *     локальные /img/pf/*.webp (сжатие sharp, до 1600 px), ссылки на
 *     перенесённые страницы → корневые /<slug>, на остальные – на deford-studio.ru.
 *  4. Каталог (блок t786) заменяет записью {type:'catalog'} с товарами
 *     раздела – карточки рисует src/components/portfolio/Catalog.astro.
 *  5. Стили платформы (сетка, блоки, попап, формы, каталог) складывает
 *     в public/pf/tilda.css.
 *
 * Кэш скачанного – в --cache (по умолчанию node_modules/.cache/tilda-port):
 * повторный запуск не ходит в сеть за тем, что уже есть.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://deford-studio.ru';
const MAIN_PART = '562984297301';
const MAIN_REC = '658877127';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const CACHE = opt('cache') || join(ROOT, 'node_modules/.cache/tilda-port');
const ONLY = opt('only')?.split(',');
const NO_IMG = args.includes('--no-img');

const OUT_DATA = join(ROOT, 'src/data/portfolio');
const OUT_PAGES = join(OUT_DATA, 'pages');
const OUT_IMG = join(ROOT, 'public/img/pf');
const OUT_CSS = join(ROOT, 'public/pf');
for (const d of [CACHE, join(CACHE, 'html'), OUT_PAGES, OUT_IMG, OUT_CSS]) mkdirSync(d, { recursive: true });

/* ---------- сеть с кэшем ---------- */

async function fetchText(url, file) {
  const path = join(CACHE, file);
  if (existsSync(path) && statSync(path).size > 0) return readFileSync(path, 'utf8');
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { Referer: `${SITE}/keys_all` } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const t = await r.text();
      writeFileSync(path, t);
      return t;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
  }
}

async function fetchBin(url, path) {
  if (existsSync(path) && statSync(path).size > 0) return;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      writeFileSync(path, Buffer.from(await r.arrayBuffer()));
      return;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
  }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        await fn(items[k], k);
      }
    }),
  );
}

/* ---------- разбор страницы ---------- */

/** Внешний HTML div, начинающегося с позиции start (баланс div). */
function outerDiv(html, start) {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  return html.slice(start);
}

function records(html) {
  const out = [];
  const re = /<div id="rec(\d+)" class="r t-rec[^"]*"[^>]*data-record-type="(\d+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const outer = outerDiv(html, m.index);
    out.push({ id: m[1], type: m[2], html: outer, alias: (outer.match(/^[^>]*data-alias-record-type="(\d+)"/) || [])[1] });
    re.lastIndex = m.index + outer.length;
  }
  return out;
}

const meta = (html, re) => (html.match(re) || [])[1] || '';
const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&amp;/g, '&');

/* ---------- картинки ---------- */

const images = new Map(); // адрес на static.tildacdn.com → локальное имя

const IMG_RE =
  /https:\/\/(?:static|thb|optim)\.tildacdn\.(?:com|net)\/((?:tild|stor)[0-9a-f-]+)\/(?:-\/[^/'"\s)]+\/[^/'"\s)]*\/)*([^/'"\s)?]+?\.(?:png|jpe?g|webp|gif|svg))/gi;

function localName(id, file) {
  const ext = file.split('.').pop().toLowerCase();
  const base = file
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'img';
  const out = ext === 'svg' || ext === 'gif' ? ext : 'webp';
  return `${id.replace(/^(tild|stor)/, '').slice(0, 9)}-${base}.${out}`;
}

function mapImages(s) {
  return s.replace(IMG_RE, (_m, id, file) => {
    const src = `https://static.tildacdn.com/${id}/${file}`;
    if (!images.has(src)) images.set(src, localName(id, file));
    return `/img/pf/${images.get(src)}`;
  });
}

/* ---------- ссылки ---------- */

let ported = new Set();

function mapLinks(s) {
  return s.replace(/href=(["'])([^"']*)\1/g, (full, q, href) => {
    let h = href.trim();
    const abs = h.match(/^https?:\/\/(?:www\.)?deford-studio\.ru(\/[^?#]*)?([?#].*)?$/);
    if (abs) h = (abs[1] || '/') + (abs[2] || '');
    const slug = (h.match(/^\/([^/?#]+)\/?(?:[?#].*)?$/) || [])[1];
    if (slug && !ported.has(slug)) return `href=${q}${SITE}/${slug}${q}`;
    return `href=${q}${h}${q}`;
  });
}

/* ---------- чистка блока ---------- */

function clean(html) {
  let s = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    /* обработчики on* и javascript:-ссылки в разметку сайта не пускаем */
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/href=(["'])\s*(?:denied:)?javascript:[^"']*\1/gi, 'href=$1#$1')
    .replace(/<template\b[\s\S]*?<\/template>/g, '')
    .replace(/<!--(?!\s*\/?noindex)[\s\S]*?-->/g, '')
    /* заглушки ленивой загрузки: src → настоящая картинка */
    .replace(/(<img\b[^>]*?)\sdata-original=(['"])([^'"]+)\2([^>]*?)\ssrc=(['"])[^'"]*\5/g, '$1 src=$2$3$2$4 loading="lazy" decoding="async"')
    .replace(/(<img\b[^>]*?)\ssrc=(['"])[^'"]*\2([^>]*?)\sdata-original=(['"])([^'"]+)\4/g, '$1 src=$4$5$4$3 loading="lazy" decoding="async"')
    .replace(/(<div\b[^>]*?)\sdata-original=(['"])([^'"]+)\2([^>]*?)\sstyle=(['"])background-image:\s*url\([^)]*\);?/g, "$1$4 style=$5background-image:url('$3');")
    .replace(/\sdata-original=(['"])[^'"]*\1/g, '');
  s = mapImages(s);
  s = mapLinks(s);
  return s.replace(/\n\s*\n/g, '\n').trim();
}

/* ---------- каталог ---------- */

async function storeProducts(part, rec) {
  const url =
    `https://store.tildaapi.com/api/getproductslist/?storepartuid=${part}&recid=${rec}` +
    `&c=1&getparts=true&getoptions=true&slice=1&size=500`;
  const d = JSON.parse(await fetchText(url, `store-${part}.json`));
  return d;
}

function slugOf(url) {
  return ((url || '').match(/^https?:\/\/(?:www\.)?deford-studio\.ru\/([^/?#]+)/) || [])[1] || '';
}

function catalogOptions(html) {
  /* простые поля настроек t_store_init: число колонок, пропорции картинки */
  const pick = (k) => (html.match(new RegExp(`${k}\\s*:\\s*'?([^',}]*)'?`)) || [])[1] ?? '';
  return {
    blocksInRow: pick('blocksInRow') || '3',
    imageRatio: pick('imageRatio'),
    imageHeight: pick('imageHeight'),
    align: pick('align'),
    colClass: (html.match(/t-store__grid-cont[^"]*"/) || [''])[0],
  };
}

/* ---------- стили платформы ---------- */

function splitRules(css) {
  /* верхний уровень: правило или @media{…} целиком */
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        out.push(css.slice(start, i + 1).trim());
        start = i + 1;
      }
    }
  }
  return out;
}

async function buildCss(blockCssUrls) {
  const base = [
    'css/tilda-grid-3.0.min.css',
    'css/tilda-popup-1.1.min.css',
    'css/tilda-forms-1.0.min.css',
    'css/tilda-catalog-1.1.min.css',
    'css/tilda-menu-widgeticons-1.0.min.css',
  ];
  const parts = [];
  for (const f of base) parts.push(await fetchText(`https://static.tildacdn.com/${f}`, f.replace(/\//g, '_')));
  const seen = new Set();
  const blocks = [];
  for (const u of blockCssUrls) {
    const css = await fetchText(u, 'blocks-' + u.match(/page(\d+)/)[1] + '.css');
    for (const r of splitRules(css)) if (!seen.has(r)) seen.add(r), blocks.push(r);
  }
  parts.push(blocks.join('\n'));
  const css = mapImages(parts.join('\n')).replace(/@charset[^;]*;/g, '');
  writeFileSync(join(OUT_CSS, 'tilda.css'), '/* стили платформы Тильды, собраны scripts/tilda-port.mjs */\n' + css);
  return css.length;
}

/* ---------- сжатие картинок ---------- */

async function processImages() {
  const sharp = (await import('sharp')).default;
  const list = [...images.entries()];
  const raw = join(CACHE, 'img');
  mkdirSync(raw, { recursive: true });
  let done = 0;
  let failed = 0;
  await pool(list, 6, async ([url, name]) => {
    const out = join(OUT_IMG, name);
    if (existsSync(out) && statSync(out).size > 0) return void done++;
    const src = join(raw, url.replace('https://static.tildacdn.com/', '').replace(/\//g, '__'));
    try {
      await fetchBin(url, src);
      if (/\.(svg|gif)$/.test(name)) copyFileSync(src, out);
      else
        await sharp(src, { limitInputPixels: false, animated: false })
          .resize({ width: 1600, withoutEnlargement: true })
          .webp({ quality: 78, effort: 4 })
          .toFile(out);
      done++;
    } catch (e) {
      failed++;
      console.warn('картинка не перенесена:', url, e.message);
    }
    if ((done + failed) % 100 === 0) console.log(`картинки: ${done + failed}/${list.length}`);
  });
  return { total: list.length, done, failed };
}

/* ---------- главный ход ---------- */

const pageHtml = new Map();
async function getPage(slug) {
  if (!pageHtml.has(slug)) pageHtml.set(slug, await fetchText(`${SITE}/${slug}`, `html/${slug}.html`));
  return pageHtml.get(slug);
}

const keysAll = await getPage('keys_all');
const sections = [...new Set([...keysAll.matchAll(/href="\/(keys_[a-z_]+)"/g)].map((m) => m[1]))].filter((s) => s !== 'keys_all');
const store = await storeProducts(MAIN_PART, MAIN_REC);
const caseSlugs = [...new Set(store.products.map((p) => slugOf(p.url)).filter(Boolean))];
const all = ['keys_all', 'reviews', ...sections, ...caseSlugs];
ported = new Set(all);
console.log(`страниц: ${all.length} (разделов ${sections.length}, кейсов ${caseSlugs.length})`);

const list = ONLY ? all.filter((s) => ONLY.includes(s)) : all;
await pool(list, 6, async (slug) => void (await getPage(slug)));

/* общие блоки – те, что есть почти на всех страницах */
const freq = new Map();
for (const slug of all.filter((s) => pageHtml.has(s))) for (const r of records(pageHtml.get(slug))) freq.set(r.id, (freq.get(r.id) || 0) + 1);
const shellIds = new Set([...freq].filter(([, n]) => n >= pageHtml.size * 0.9).map(([id]) => id));

/* оболочка – по /keys_all: блоки до своих – шапка, после – подвал */
const ka = records(keysAll);
const firstOwn = ka.findIndex((r) => !shellIds.has(r.id));
const lastOwn = ka.length - 1 - [...ka].reverse().findIndex((r) => !shellIds.has(r.id));
const shell = {
  head: ka.slice(0, firstOwn).filter((r) => shellIds.has(r.id)).map((r) => ({ id: r.id, type: r.type, html: clean(r.html) })),
  foot: ka.slice(lastOwn + 1).filter((r) => shellIds.has(r.id)).map((r) => ({ id: r.id, type: r.type, html: clean(r.html) })),
  allrecords: (keysAll.match(/<div id="allrecords"([^>]*)>/) || [])[1] || '',
  header: (keysAll.match(/<header id="t-header"([^>]*)>/) || [])[1] || '',
  footer: (keysAll.match(/<footer id="t-footer"([^>]*)>/) || [])[1] || '',
};

const blockCss = new Set();
const products = new Map(store.products.map((p) => [String(p.uid), p]));

for (const slug of list) {
  const html = pageHtml.get(slug);
  const css = html.match(/https:\/\/static\.tildacdn\.com\/ws\/project\d+\/tilda-blocks-page\d+\.min\.css\?t=\d+/);
  if (css) blockCss.add(css[0]);
  const recs = [];
  for (const r of records(html)) {
    if (shellIds.has(r.id)) continue;
    if (r.type === '786') {
      const part = (r.html.match(/storepart:'(\d+)'/) || [])[1] || MAIN_PART;
      const d = part === MAIN_PART ? store : await storeProducts(part, r.id);
      for (const p of d.products) if (!products.has(String(p.uid))) products.set(String(p.uid), p);
      recs.push({
        id: r.id,
        type: 'catalog',
        open: r.html.match(/^<div[^>]*>/)[0],
        style: [...r.html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n'),
        options: catalogOptions(r.html),
        products: d.products.map((p) => String(p.uid)),
      });
      continue;
    }
    const h = clean(r.html);
    /* пустой якорь t215 без имени не нужен; t674 оставляем – в нём фон страницы */
    if (r.type === '215' && !/<a\b/.test(h)) continue;
    recs.push({ id: r.id, type: r.alias || r.type, html: h });
  }
  const page = {
    slug,
    title: decode(meta(html, /<title>([^<]*)<\/title>/)),
    description: decode(meta(html, /<meta name="description" content="([^"]*)"/)),
    ogTitle: decode(meta(html, /<meta property="og:title" content="([^"]*)"/)),
    ogImage: mapImages(meta(html, /<meta property="og:image" content="([^"]*)"/)),
    records: recs,
  };
  writeFileSync(join(OUT_PAGES, `${slug}.json`), JSON.stringify(page));
}

/* товары каталога: название, картинка, адрес кейса, разделы */
const catalog = {
  parts: store.parts.map((p) => ({ uid: String(p.uid), title: decode(p.title) })),
  products: Object.fromEntries(
    [...products].map(([uid, p]) => {
      const gal = (() => {
        try {
          return JSON.parse(p.gallery || '[]');
        } catch {
          return [];
        }
      })();
      const slug = slugOf(p.url);
      return [
        uid,
        {
          title: decode(p.title || ''),
          img: gal[0]?.img ? mapImages(gal[0].img) : '',
          href: slug ? (ported.has(slug) ? `/${slug}` : `${SITE}/${slug}`) : p.url || '',
        },
      ];
    }),
  ),
};

writeFileSync(join(OUT_DATA, 'shell.json'), JSON.stringify(shell));
writeFileSync(join(OUT_DATA, 'catalog.json'), JSON.stringify(catalog));
const cssSize = await buildCss([...blockCss]);
console.log(`оболочка: шапка ${shell.head.length}, подвал ${shell.foot.length} блоков; стили ${Math.round(cssSize / 1024)} КБ`);
console.log(`товаров в каталоге: ${Object.keys(catalog.products).length}; картинок к переносу: ${images.size}`);

if (!NO_IMG) console.log('картинки:', JSON.stringify(await processImages()));
