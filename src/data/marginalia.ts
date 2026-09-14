export type MarginaliaKind = '叙事细读' | '秘封札记' | '听歌随笔' | '校订手记';
export interface MarginalNote {
  id: string; number: string; title: string; kind: MarginaliaKind; work: string;
  description: string; line: string; spoiler: string;
}
export const marginalia: MarginalNote[] = [
  { id: 'recognition-before-a-name', number: '01', title: '认出一个名字之前', kind: '叙事细读', work: '人物误认', description: '一个熟悉的名字，也可能让读者过早认定答案。把名字、视角和判断的时间分开来看。', line: '认出一个名字之前，我们已经相信了多少事情？', spoiler: '阅读方法 · 无具体剧情揭示' },
  { id: 'narrative-two-clocks', number: '02', title: '上一段之后，未必是下一刻', kind: '叙事细读', work: '时间跳跃', description: '事件发生的顺序，与信息抵达读者的顺序，并不总是一致。一次回读，也是在重新排列时间。', line: '故事有自己的时钟，读者的理解也有。', spoiler: '阅读方法 · 无具体剧情揭示' },
  { id: 'chronicle-companions', number: '03', title: '寻找同伴，重新给故乡命名', kind: '叙事细读', work: '东方年代记', description: '从“寻找同伴”的公开故事前提出发，想一想漫长的生命如何保存关系，以及故乡怎样在彼此之间延续。', line: '还有谁在，又能到哪里与她相遇？', spoiler: '涉及公开故事前提 · 不揭示结局' },
  { id: 'spiral-record-and-testimony', number: '04', title: '记录与证言之间', kind: '叙事细读', work: '东方无限螺旋', description: '沿着两部副题中的“记录”与“证言”，留意讲述者知道什么，以及观看者何时才知道。', line: '被看见、被记住、被讲述，是三种略有不同的形状。', spoiler: '讨论副题与观看角度 · 不揭示反转' },
  { id: 'hifuu-kaleido-window', number: '05', title: '万景幕：一扇太懂乘客的窗', kind: '秘封札记', work: '卯酉东海道', description: '当窗外的山海被修饰得无可挑剔，旅行还剩下多少偶然？从万景幕读起，想一想真实为何值得亲自经过。', line: '给风景留下一点不为我安排的部分。', spoiler: '涉及专辑附带故事的旅途设定' },
  { id: 'hifuu-moon-tour-budget', number: '06', title: '月面旅行，从一笔预算开始', kind: '秘封札记', work: '大空魔术', description: '一场关于宇宙的谈话，为什么会落到旅行费用上？求知的远方与生活的条件，可以放在同一张桌子上。', line: '愿望有了代价，显出了它在生活里的分量。', spoiler: '涉及专辑附带故事前半的对话' },
  { id: 'hifuu-coffee-assumptions', number: '07', title: '一杯咖啡，藏着多少默认条件', kind: '秘封札记', work: '大空魔术', description: '把咖啡搬进失重环境，熟悉的动作就开始提出问题。从一件日用品，读到幻想与科学相遇的地方。', line: '换掉一个条件，日常就重新有了问题。', spoiler: '涉及咖啡与失重的日常对话' },
  { id: 'following-a-melody', number: '08', title: '循声走进一个故事', kind: '听歌随笔', work: 'ほしぞら／120日元之冬', description: '从东方同人作品的结局音乐，走向《120日元之冬》，再到《看不见的远方》。记下一段由旋律牵起的阅读经历。', line: '一段旋律，有时会替我找到下一本书。', spoiler: '个人阅读来路 · 不揭示游戏结局' },
  { id: 'voice-inside-a-song', number: '09', title: '歌里的“我”，在对谁说话', kind: '听歌随笔', work: '歌词与叙述声音', description: '在给一首歌拼出完整故事之前，先找一找它的说话者、倾听者，以及同一句话再次出现时的变化。', line: '同一句话再响起，说话的位置可能已经变了。', spoiler: '听歌方法 · 不引用具体歌词' },
  { id: 'editing-without-erasing-voice', number: '10', title: '校订时，给原来的声音留位置', kind: '校订手记', work: '评读与文字校订', description: '从一个停顿、一处称谓或一次断行出发，想一想怎样让阅读更清楚，也给原作者的语气留下空间。', line: '把问题指出来，也把选择留给作者。', spoiler: '校订方法 · 不公开合作原稿' },
];
export const marginaliaHref = (note: MarginalNote) => `/blog/${note.id}/`;
export const readingWorks = [
  { title: '东方年代记', subtitle: '双姬蓬莱物语', medium: '东方同人 RPG', creator: '橙色风铃制作组', note: '寻找同伴，让故乡从地点延伸到关系。', href: '/blog/chronicle-companions/' },
  { title: '东方无限螺旋', subtitle: '记录与证言', medium: 'AVG 风手书视频', creator: 'ねこタク', note: '在事件与认识之间，为判断留下一点余地。', href: '/blog/spiral-record-and-testimony/' },
  { title: '卯酉东海道', subtitle: 'Retrospective 53 minutes', medium: '器乐专辑与附带故事', creator: 'ZUN／上海爱丽丝幻乐团', note: '隔着一扇车窗，重新看真实与虚构。', href: '/blog/hifuu-kaleido-window/' },
  { title: '大空魔术', subtitle: 'Magical Astronomy', medium: '器乐专辑与附带故事', creator: 'ZUN／上海爱丽丝幻乐团', note: '从月面旅费与一杯咖啡，问到宇宙与日常。', href: '/blog/hifuu-moon-tour-budget/' },
];
export const collaborationCases = [
  { title: '朋友的视觉小说', label: 'COLLABORATIVE READING', role: '阅读反馈 · 文字校订', description: '为朋友的视觉小说提供阅读反馈与文字校订。我关注读者在哪里停顿、哪些信息需要回看，也尊重作者的表达选择。', credit: '原作与剧情创作归原作者；我的参与为评读与文字校订。', href: '/blog/editing-without-erasing-voice/', action: '读评读与校订手记' },
  { title: '东方紫雨幽蝶', label: 'A PERSONAL EDITION', role: '整理校订 · LaTeX 排印 · 版式设计', description: '将第一部〈白玉楼阁〉整理为 A5 数字合订本，并提供分章阅读。从断行、标点到目录、章首，让长篇文字获得连续的阅读节奏。', credit: '原作 coolcate；亚略 Ar 负责整理校订、排印与版式设计。', href: '/blog/latex-touhou-typesetting/', action: '看个人整理版档案' },
];
