// Turns dist-single/index.html into a page fragment for hosts that supply their own
// <!doctype>/<html>/<head>/<body> shell (e.g. a claude.ai artifact).
// Usage: node scripts/artifact-fragment.mjs [in] [out]
import fs from 'node:fs';

const [src = 'dist-single/index.html', out = 'dist-single/artifact.html'] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const pick = (re, s) => [...s.matchAll(re)].map((m) => m[0]).join('\n');
const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>Flick &amp; the Lost Reels</title>';
const fonts = pick(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/gi, head);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/gi, head);
const scripts = [pick(/<script[^>]*>[\s\S]*?<\/script>/gi, head), pick(/<script[^>]*>[\s\S]*?<\/script>/gi, body)].filter(Boolean).join('\n');
const markup = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').trim();
fs.writeFileSync(out, `${title}\n<meta name="theme-color" content="#1d140f">\n${fonts}\n${styles}\n${markup}\n${scripts}\n`);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
