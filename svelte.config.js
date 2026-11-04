import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Configurações do Cloudflare adapter
      routes: {
        include: ['/*'],
        exclude: ['<all>']
      }
    }),
    alias: {
      $components: 'src/lib/components',
      $stores: 'src/lib/stores',
      $db: 'src/lib/db',
      $api: 'src/lib/api',
      $theme: 'src/lib/theme',
      $utils: 'src/lib/utils'
    }
  }
};

export default config;
