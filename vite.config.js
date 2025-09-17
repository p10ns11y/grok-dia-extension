import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(
  {
    build: {
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup.js'),
          vocab: resolve(__dirname, 'src/vocab.js'),
          options: resolve(__dirname, 'src/options.js'),
          background: resolve(__dirname, 'src/background.js'),
          'vocab-extractor': resolve(__dirname, 'src/vocab-extractor.js')
        },
        output: {
          dir: 'extension',
          entryFileNames: '[name].js',
          chunkFileNames: 'helpers-[hash].js',
          assetFileNames: '[name].js',
          format: 'es'
        }
      },
      minify: 'esbuild'
    }
  }
);
