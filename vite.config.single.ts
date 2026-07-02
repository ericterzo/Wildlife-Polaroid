// Builds the whole game into one self-contained HTML file (dist-single/index.html)
// that runs when double-clicked — no server, no npm needed.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-single',
    chunkSizeWarningLimit: 1200,
  },
});
