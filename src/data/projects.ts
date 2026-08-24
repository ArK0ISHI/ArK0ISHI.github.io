export type Project = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  reflection?: string;
  tags: string[];
  result?: string;
  articleHref?: string;
  detailHref?: string;
  liveHref?: string;
  liveLabel?: string;
  credit?: string;
  accessNote?: string;
  featured?: boolean;
};

export const projects: Project[] = [
  {
    id: 'capacitive-displacement',
    number: 'P.01',
    title: '融合机器学习的差动式电容微位移测量',
    subtitle: 'Differential capacitive micro-displacement measurement',
    description: '从差动电容结构出发，完成实验方案、信号采集、数据处理与机器学习建模，探索非线性区间内的高精度位移反演。',
    reflection: '模型表现的改善，来自真实的标定能力，还是数据划分造成的乐观误差？',
    tags: ['精密测量', '机器学习', 'Python'],
    result: '约 5 μm 位移分辨 · 全国一等奖',
    articleHref: '/blog/capacitive-displacement/',
    featured: true,
  },
  {
    id: 'dripping-faucet-chaos',
    number: 'P.02',
    title: '滴水龙头液滴特性的实验研究',
    subtitle: 'Nonlinear dynamics of a dripping faucet',
    description: '围绕液滴形成、分岔与混沌行为开展实验观测与数据分析，尝试从时间序列中辨认周期窗口和非线性演化。',
    reflection: '怎样从杂乱的序列中区分噪声、暂态与确定性结构？',
    tags: ['非线性动力学', '实验物理', '数据分析'],
    result: 'CUPT 全国一等奖 · 最佳实验图片奖',
    articleHref: '/blog/dripping-faucet-chaos/',
    featured: true,
  },
  {
    id: 'magnetic-mirror-orbits',
    number: 'P.03',
    title: '双线圈磁镜场中的粒子轨道与磁矩绝热性',
    subtitle: 'Particle orbits in a magnetic mirror field',
    description: '基于 Biot–Savart 定律构建三维磁场，模拟带电粒子轨道，并考察磁矩守恒、损失锥与步长选择对数值稳定性的影响。',
    reflection: '磁矩守恒在什么尺度与步长下仍然成立，粒子又在什么条件下进入损失锥？',
    tags: ['计算物理', '电磁学', 'MATLAB'],
    result: '三维场计算与粒子轨道模拟',
    articleHref: '/blog/magnetic-mirror-orbits/',
    featured: true,
  },
  {
    id: 'pf2-error-field',
    number: 'P.04',
    title: 'PF2 线圈位移误差磁场分析',
    subtitle: 'Displacement error field of the PF2 coil',
    description: '研究线圈刚性平移引起的三维误差场，比较不同位移模型，并以柱坐标傅里叶分解识别 n = 1 主导模态。',
    reflection: '刚性平移如何破坏轴对称性，n = 1 模态又怎样从三维场数据中被辨认？',
    tags: ['磁场模拟', '傅里叶分析', '数值计算'],
    result: '误差场建模与模态识别',
    articleHref: '/blog/coil-n1-error-field/',
  },
  {
    id: 'summer-camp-navigator',
    number: 'P.05',
    title: '东华物理保研申请工作台',
    subtitle: 'Graduate recommendation application workbench',
    description: '面向应用物理、光电与相关方向，将分散的夏令营和预推免公开信息整理为可筛选、可核验并可追踪日程的非官方学生工具。',
    reflection: '如何在信息密度很高的申请季里，同时保留来源、更新时间、缺失字段与个人状态的边界？',
    tags: ['信息架构', '前端界面', '协作项目'],
    result: '项目检索 · 动态 DDL · 日程与本机进度',
    detailHref: '/projects/summer-camp-navigator/',
    liveHref: 'https://dhu-baoyan-nav.pages.dev/',
    liveLabel: '进入工作台（需授权）',
    credit: '信息抓取脚本：和谐号｜网页整理与界面制作：亚略Ar',
    accessNote: '学生整理 · 非官方信息工具 · 需授权访问',
  },
  {
    id: 'huashu-cup-a-2026',
    number: 'P.06',
    title: '从像素到战术：世界杯任意球轨迹重建与防守策略',
    subtitle: 'Free-kick trajectory reconstruction and defensive strategy design',
    description: '从双视角比赛视频中重建任意球三维轨迹，比较不同空气动力学模型，并用蒙特卡洛模拟搜索人墙与守门员的协同防守位置。',
    reflection: '二维视频中的像素测量，经过怎样的标定与误差检验，才能支撑三维轨迹和战术判断？',
    tags: ['数学建模', '三维重建', '蒙特卡洛模拟'],
    result: '2026 年“华数杯”国际大学生数学建模竞赛一等奖',
    articleHref: '/blog/huashu-cup-a-2026/',
  },
];
