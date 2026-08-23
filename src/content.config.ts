import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum(['物理笔记', '实验与测量', '计算物理', '数学建模', '微纳与光电', '代码与工具', '文学批评', '东方Project', '装帧与排版', '随笔']),
    kind: z.enum(['note', 'writing']).default('note'),
    author: z.string().optional(),
    authorLabel: z.string().optional(),
    scopeNote: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
