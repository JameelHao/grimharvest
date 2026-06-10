import { defineConfig } from 'vite';

// 部署到 GitHub Pages 用相对路径，保证子路径下资源能正确加载
export default defineConfig({
  base: './',
});
