import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.js'),
        popup: resolve(__dirname, 'src/popup.js'),
        options: resolve(__dirname, 'src/options.js'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'es',
      },
    },
    minify: 'esbuild',
  },
});
