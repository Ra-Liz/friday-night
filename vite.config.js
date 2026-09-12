/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // 素材保持独立文件而非内联，便于直接替换占位素材（SRS §6 / 概要设计 §4.4）
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
