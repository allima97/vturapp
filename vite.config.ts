import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // O Vite só embute variáveis com este prefixo. `PUBLIC_` é o prefixo do
  // SvelteKit; sem isso, o build de staging não enxerga as flags GeoNames.
  envPrefix: ['VITE_', 'PUBLIC_'],
  plugins: [tailwindcss(), sveltekit()],
  build: {
    // Os maiores bundles são workers/fontes de PDF
    chunkSizeWarningLimit: 2500
  },
  optimizeDeps: {
    exclude: ['xlsx', 'jspdf', 'jspdf-autotable', 'dexie', 'dexie-cloud-addon']
  },
  resolve: {
    alias: {
      // Dexie 4.3 pode resolver para import-wrapper (dev)
      dexie: 'dexie/dist/dexie.mjs'
    }
  }
});
