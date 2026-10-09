/**
 * Достаёт секцию из сохранённой страницы Тильды и собирает из неё
 * компонент Astro: разметка, все слои стилей по порядку, скрипты.
 *
 *   node scripts/extract.mjs <файл-блока> <ИмяКомпонента>
 *
 * Порядок слоёв стилей сохраняется — от него зависит итоговый каскад.
 * Картинки переписываются на локальные /img/<имя>.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [src, name] = process.argv.slice(2);
if (!src || !name) {
  console.error('нужно: node scripts/extract.mjs <файл> <Имя>');
  process.exit(1);
}

let html = readFileSync(src, 'utf8');

/* Картинки Тильды → локальные файлы */
html = html.replace(
  /https:\/\/static\.tildacdn\.com\/[^"')\s]*?\/([^/"')\s]+\.(?:png|jpg|jpeg|svg|webp|gif))/g,
  (_m, file) => `/img/${file}`,
);

const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(
  (m) => m[1],
);
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
);

/* Разметка — без style/script и без обёрток Тильды */
let markup = html
  .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^[\s\S]*?<div class="t1370">/, '')
  .replace(/<\/div>\s*<\/div>\s*$/, '')
  .trim();

/* Astro трактует {} в тексте как выражение — такие места правим руками */
if (/[{}]/.test(markup)) {
  console.warn('ВНИМАНИЕ: в разметке есть фигурные скобки, проверьте вручную');
}

const css = styles
  .map((s, i) => `/* ===== слой ${i + 1} из Тильды ===== */\n${s.trim()}`)
  .join('\n\n');

const js = scripts.map((s) => s.trim()).join('\n\n');

const out = `---
/** Оригинал: ${src.split('/').pop()?.replace(/^\d+_/, '').replace(/\.html$/, '')} */
---

${markup}

<style is:global>
${css}
</style>
${js ? `\n<script is:inline>\n${js}\n</script>\n` : ''}`;

const dest = `src/components/${name}.astro`;
writeFileSync(dest, out);
console.log(
  `${dest}: разметка ${markup.length} симв., стилей ${styles.length} слоёв (${css.length} симв.), скриптов ${scripts.length}`,
);
