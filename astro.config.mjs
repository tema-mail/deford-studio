import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://deford-studio.ru',
  build: { inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  // Острова админки: доска заявок
  integrations: [preact()],
});
