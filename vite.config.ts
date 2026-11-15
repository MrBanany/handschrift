import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

// public/sw.js names its cache after the build: the hash of the built index.html changes whenever any hashed file does.
let outDir = 'dist';
const swBuildId = {
  name: 'sw-build-id',
  apply: 'build' as const,
  configResolved: (c: { build: { outDir: string }; root: string }) => { outDir = join(c.root, c.build.outDir); },
  closeBundle() {
    const id = createHash('sha1').update(readFileSync(join(outDir, 'index.html'))).digest('hex').slice(0, 10);
    const sw = join(outDir, 'sw.js');
    // the sample fonts are loaded only when a sample is picked, so index.html does not name them: hand sw.js the list
    const fonts = readdirSync(join(outDir, 'assets')).filter((f) => f.endsWith('.ttf')).map((f) => `./assets/${f}`);
    writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', id).replace('__FONTS__', fonts.join(',')));
  },
};

// Usage counter (GoatCounter): put the site code here, e.g. 'handschrift' for handschrift.goatcounter.com. Empty = the script is not in the page, nothing is sent.
// The page path is fixed so a handed-over ?text=… never reaches the counter.
const GC_CODE = 'mrbanany';
const counter = {
  name: 'goatcounter',
  transformIndexHtml: () => GC_CODE ? [
    { tag: 'script', children: 'window.goatcounter = { path: location.pathname };', injectTo: 'head' as const },
    { tag: 'script', attrs: { async: true, src: 'https://gc.zgo.at/count.js', 'data-goatcounter': `https://${GC_CODE}.goatcounter.com/count` }, injectTo: 'head' as const },
  ] : [],
};

// Relative base: works on GitHub Pages under any repository name.
export default defineConfig({ base: './', plugins: [swBuildId, counter] });
