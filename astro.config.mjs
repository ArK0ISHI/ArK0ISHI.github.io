import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { syncNeteaseMusic } from './scripts/sync-netease-music.mjs';

const neteaseMusicSync = () => ({
  name: 'ar-netease-music-sync',
  hooks: {
    'astro:config:setup': async ({ command }) => {
      if (command === 'build' || command === 'dev') await syncNeteaseMusic();
    },
  },
});

export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',
  output: 'static',
  integrations: [neteaseMusicSync(), mdx(), sitemap({ filter: (page) => !new URL(page).pathname.startsWith('/moon/') })],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
