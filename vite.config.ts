import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          const vendorFiles = [
            ['node_modules/phaser/dist/phaser.min.js', 'phaser.min.js'],
            ['node_modules/three/build/three.module.js', 'three.module.js'],
            ['node_modules/three/build/three.core.js', 'three.core.js'],
          ];
          const distVendor = path.resolve(distDir, 'vendor');
          for (const [srcRel, destName] of vendorFiles) {
            const srcAbs = path.resolve(__dirname, srcRel);
            if (fs.existsSync(distDir) && fs.existsSync(srcAbs)) {
              fs.mkdirSync(distVendor, {recursive: true});
              fs.copyFileSync(srcAbs, path.join(distVendor, destName));
            }
          }
          const indexHtml = path.join(distDir, 'index.html');
          if (fs.existsSync(indexHtml)) {
            const spaRoutes = ['login', 'cadastro', 'recuperar-senha', 'redefinir-senha', 'dashboard', 'admin'];
            for (const route of spaRoutes) {
              const routeDir = path.join(distDir, route);
              fs.mkdirSync(routeDir, {recursive: true});
              fs.copyFileSync(indexHtml, path.join(routeDir, 'index.html'));
            }
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
