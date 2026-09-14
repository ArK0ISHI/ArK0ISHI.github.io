export const handbook = {
  title: '未来科学家',
  subtitle: '东华大学暑期物理研学探索营 · 2026 营员手册',
  href: '/projects/future-scientists-handbook/',
  pdf: '/documents/future-scientists-handbook-2026.pdf',
  cover: '/images/works/future-scientists/cover.webp',
  journal: '/images/works/future-scientists/learning-journal.webp',
  pages: 21,
  pdfSize: '2.26 MB',
  width: 1200,
  height: 1698,
};

export const handbookPages = [
  { image: 'welcome', page: 2, title: '先读一封信', category: 'WELCOME', description: '欢迎信与使用方法，把五天的探索从力与运动、光、电、磁场，引向量子世界。' },
  { image: 'field-notes', page: 7, title: '给提问一条路径', category: 'OBSERVE & ASK', description: '观察、猜想、实验、记录、分享。简短提示之后，是观察小卡与等待填写的问题清单。' },
  { image: 'learning-journal', page: 8, title: '让发现留在纸上', category: 'LEARNING JOURNAL', description: '第一天上午的学习日志：绘画、课堂笔记、实验记录与每日小徽章，各有一块位置。' },
  { image: 'glossary', page: 19, title: '把新词带回家', category: 'SCIENCE WORDS', description: '21 个中英科学词汇与简明解释，从力、运动到电路和测量，也留出补充新词的空白。' },
  { image: 'campus-map', page: 20, title: '从纸页走到校园', category: 'FIND YOUR WAY', description: '校园地图、活动地点说明与温馨提示，让课程之外的行走也有据可循。' },
  { image: 'back-cover', page: 21, title: '把好奇心带向下一程', category: 'AFTER THE CAMP', description: '蓝色、星星与浅绿地平线呼应封面，留下“与科学相遇，与未来同行”的寄语。' },
].map(item => ({ ...item, src: `/images/works/future-scientists/${item.image}.webp` }));
