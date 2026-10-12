import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
const repo=process.env.GITHUB_REPOSITORY?.split('/')[1];
export default defineConfig({
  plugins:[react()],
  base:process.env.PAGES_BASE_PATH || (repo && !repo.endsWith('.github.io')?'/'+repo+'/':'/'),
  build:{rollupOptions:{input:{home:resolve(process.cwd(),'index.html'),admin:resolve(process.cwd(),'admin/index.html')}}}
});
