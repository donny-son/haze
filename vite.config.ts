import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Custom domain is configured as haze.son.do, so production assets should be
// rooted at / rather than the GitHub Pages project path (/haze/).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
});
