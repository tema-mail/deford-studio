// GitHub Pages отдаёт проект из подпапки /<repo>/, а в разметке пути корневые.
// После сборки дописываем префикс в HTML, CSS и sitemap — исходники не трогаем,
// локальная разработка продолжает работать от корня.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const base = process.argv[2];
if (!base || !base.startsWith('/')) {
  console.error('Использование: node scripts/rebase-dist.mjs /имя-репозитория');
  process.exit(1);
}

const dist = 'dist';
const exts = new Set(['.html', '.css', '.xml', '.txt', '.js']);

/** Пропускаем внешние ссылки, протоколы и уже переписанные пути. */
const rules = [
  [/(\s(?:href|src|action|content|poster)=")\/(?!\/)/g, `$1${base}/`],
  [/(url\()\/(?!\/)/g, `$1${base}/`],
  [/("(?:url|image)":\s*")\//g, `$1${base}/`],
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (exts.has(extname(entry.name))) out.push(path);
  }
  return out;
}

const files = await walk(dist);
let touched = 0;

for (const file of files) {
  const text = await readFile(file, 'utf8');
  let next = text;
  for (const [from, to] of rules) next = next.replace(from, to);
  /* srcset — список адресов через запятую: префикс каждому корневому */
  next = next.replace(/(\ssrcset=")([^"]*)"/g, (_m, attr, list) =>
    `${attr}${list.replace(/(^|,\s*)\/(?!\/)/g, `$1${base}/`)}"`,
  );
  // абсолютные URL в canonical и JSON-LD уже содержат домен — чиним двойной префикс
  next = next.replaceAll(`https://tema-mail.github.io${base}${base}/`, `https://tema-mail.github.io${base}/`);
  if (next !== text) {
    await writeFile(file, next);
    touched += 1;
  }
}

console.log(`rebase-dist: префикс ${base} проставлен в ${touched} из ${files.length} файлов`);
