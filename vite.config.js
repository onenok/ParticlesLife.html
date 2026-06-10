import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'benchmark/benchmark.html'),
      }
    }
  },
  server: {
    fs: {
      strict: false // 允許提供工作區根目錄之外的文件
    },
    port: 3000,
    open: '/benchmark/benchmark.html'
  },
  optimizeDeps: {
    include: ['gpu.js']
  }
});
