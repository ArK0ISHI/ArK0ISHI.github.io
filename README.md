# 亚略Ar｜个人博客

一套以“学术技术 × 文学创作”为核心的 Astro 静态博客。视觉方向是安静的学术书房，支持 Markdown / MDX、KaTeX 数学公式、代码高亮、深色模式、档案检索、文章目录与阅读进度、跨页音乐、RSS、Sitemap 与 GitHub Pages 自动部署。

## 本地运行

需要 Node.js 22.12 或更高版本。

```bash
npm install
npm run dev
```

打开终端输出的本地地址即可预览。正式构建：

```bash
npm run build
npm run preview
```

## 修改个人信息

- 站点名称、关键词与联系方式：`src/data/site.ts`
- 项目档案：`src/data/projects.ts`
- 网易云专辑与曲目顺序：`music.config.json`
- 播放器备用音源及授权来源：`src/data/music.ts`
- 首页与荣誉：`src/pages/index.astro`
- 关于页：`src/pages/about/index.astro`
- 经历页：`src/pages/experience/index.astro`

当前按“半匿名”方案制作，未写入真实姓名、学号、手机号或私人邮箱。补充邮箱和 GitHub 地址时，直接修改 `src/data/site.ts` 即可。

## 写一篇新文章

在 `src/content/blog/` 新建 `.md` 或 `.mdx` 文件，并添加：

```yaml
---
title: '文章标题'
description: '用于列表和搜索引擎的摘要。'
date: 2026-08-01
tags: ['标签一', '标签二']
category: '物理笔记'
kind: 'note'
featured: false
draft: false
---
```

`category` 可用值定义在 `src/content.config.ts`。`kind` 为 `note` 时进入“笔记”，为 `writing` 时进入“写作”。数学公式使用标准 Markdown 语法：行内 `$E=mc^2$`，块级公式用两个美元符号包围。

新增文章会自动进入顶部的“档案检索”，也会自动生成阅读时间、文章目录和前后篇导航。检索可通过导航栏放大镜或 `Ctrl/⌘ + K` 打开。

## 夜间音乐与歌词

播放器目前收录《卯酉東海道 ～ Retrospective 53 minutes》和《大空魔術 ～ Magical Astronomy》两张专辑，共 21 首曲目。修改 `music.config.json` 中的网易云专辑与曲目信息即可调整顺序。

运行 `npm run dev` 或 `npm run build` 时，站点会在 Node.js 构建阶段访问网易云专辑与 LRC 接口，生成同源的 `public/data/music.json`；浏览器只读取静态 JSON，并通过网易云 `outer/url` 播放音频。也可以单独执行：

```bash
npm run sync:music
```

两张专辑均为器乐作品，网易云目前返回的 LRC 主要是作曲署名和“纯音乐”提示，因此播放器的歌词面板不会出现演唱歌词。曲目、封面、录音和 LRC 的权利仍归相应创作者、发行方与平台；公开站点只保存构建时取得的元数据和 LRC，不把音频文件提交进仓库。网络或地区限制导致网易云音源全部不可用时，播放器会切换到 `src/data/music.ts` 中声明的 CC0 备用音源。

## 部署到 GitHub Pages

1. 新建公开仓库 `<你的GitHub用户名>.github.io`。
2. 把本项目文件放在仓库根目录并推送到 `main`。
3. 在仓库 `Settings → Pages → Build and deployment` 中选择 `GitHub Actions`。
4. 等待 `Deploy Astro site to Pages` 工作流完成。
5. 在 Pages 设置中开启 `Enforce HTTPS`。

工作流会自动把 `SITE_URL` 设置为 `https://<GitHub用户名>.github.io`。如使用独立域名，请把工作流中的 `SITE_URL` 改为你的正式域名；Sitemap、RSS 和 robots.txt 会随之自动生成正确地址。

## 目录

```text
src/
├─ components/        导航、页脚、文章与项目条目
├─ content/blog/      Markdown / MDX 文章
├─ data/              站点资料与项目数据
├─ layouts/           全站和文章布局
├─ pages/             页面与动态路由
└─ styles/            全局视觉样式
```

## 隐私提醒

GitHub Pages 发布的是公开静态网站。私人笔记、访问令牌、证书原件和含身份信息的文件不要放进仓库，也不要依赖前端密码框保护敏感内容。
