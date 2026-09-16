import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root:'.',
  plugins:[react()],
  resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
  define:{'process.env.NEXT_PUBLIC_API_URL':JSON.stringify('')},
  build:{outDir:'dist-railway',emptyOutDir:true},
});
