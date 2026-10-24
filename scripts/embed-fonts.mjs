// Convert the bundled Google Fonts stylesheet to a self-contained CSS fragment.
// The HTML exporter includes this fragment and OFL.txt; this script makes no network calls.
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('public/fonts');
const input = await readFile(path.join(directory, 'fonts.css'), 'utf8');
const urls = [...new Set([...input.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/g)].map(match => match[1]))];
let output = input;
for (const url of urls) {
  if (/^data:/i.test(url)) continue;
  if (/^(?:https?:)?\/\//i.test(url)) throw new Error('Only bundled font files can be embedded.');
  const filename = url.replace(/^\/fonts\//, '');
  const fontPath = path.resolve(directory, filename);
  if (!fontPath.startsWith(directory + path.sep)) throw new Error('Font path must stay within public/fonts.');
  const bytes = await readFile(fontPath);
  const extension = path.extname(fontPath).slice(1);
  if (!['woff2', 'woff', 'ttf', 'otf'].includes(extension)) throw new Error('Unsupported font format.');
  output = output.split(url).join(`data:font/${extension};base64,${bytes.toString('base64')}`);
}
await writeFile(path.join(directory, 'fonts-inline.css'), output);
console.log(`Embedded ${urls.length} local font assets into public/fonts/fonts-inline.css.`);
