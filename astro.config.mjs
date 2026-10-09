import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://deford-studio.ru',
  build: { inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
});
