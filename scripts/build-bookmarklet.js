/**
 * Build script: generates a bookmarklet from qa-helper.js
 *
 * Usage: node scripts/build-bookmarklet.js
 * Output: dist/bookmarklet.txt
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'qa-helper.js'), 'utf-8');

// Minify: remove comments, collapse whitespace (basic — use terser for production)
let minified = src
  .replace(/\/\*[\s\S]*?\*\//g, '')           // block comments
  .replace(/\/\/.*$/gm, '')                    // line comments
  .replace(/\n\s*\n/g, '\n')                   // blank lines
  .replace(/^\s+/gm, '')                       // leading whitespace
  .trim();

const bookmarklet = `javascript:void(${encodeURIComponent(`(function(){${minified}})()`).slice(0, 100000)})`;

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

fs.writeFileSync(path.join(distDir, 'bookmarklet.txt'), bookmarklet);

console.log(`✅ Bookmarklet generated: dist/bookmarklet.txt`);
console.log(`   Source: ${src.length} chars → Bookmarklet: ${bookmarklet.length} chars`);

if (bookmarklet.length > 65536) {
  console.warn(`⚠️  Bookmarklet exceeds 65KB — some browsers may truncate it.`);
  console.warn(`   Consider hosting qa-helper.js and using a fetch-based bookmarklet instead:`);
  console.warn(`   javascript:void(fetch('https://YOUR_HOST/qa-helper.js').then(r=>r.text()).then(eval))`);
}
