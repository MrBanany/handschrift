import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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
    writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', id));
  },
};

// Relative base: works on GitHub Pages under any repository name.
export default defineConfig({ base: './', plugins: [swBuildId] });
