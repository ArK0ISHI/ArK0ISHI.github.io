export type Project = {
  number: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  result?: string;
  featured?: boolean;
};

export const projects: Project[] = [
  {
    number: 'P.01',
    title: '融合机器学习的差动式电容微位移测量',
    subtitle: 'Differential capacitive micro-displacement measurement',
    description: '从差动电容结构出发，完成实验方案、信号采集、数据处理与机器学习建模，探索非线性区间内的高精度位移反演。',
    tags: ['精密测量', '机器学习', 'Python'],
    result: '约 5 μm 位移分辨 · 全国一等奖',
    featured: true,
  },
  {
    number: 'P.02',
    title: '滴水龙头液滴特性的实验研究',
    subtitle: 'Nonlinear dynamics of a dripping faucet',
    description: '围绕液滴形成、分岔与混沌行为开展实验观测与数据分析，尝试从时间序列中辨认周期窗口和非线性演化。',
    tags: ['非线性动力学', '实验物理', '数据分析'],
    result: 'CUPT 全国一等奖 · 最佳实验图片奖',
    featured: true,
  },
  {
    number: 'P.03',
    title: '双线圈磁镜场中的粒子轨道与磁矩绝热性',
    subtitle: 'Particle orbits in a magnetic mirror field',
    description: '基于 Biot–Savart 定律构建三维磁场，模拟带电粒子轨道，并考察磁矩守恒、损失锥与步长选择对数值稳定性的影响。',
    tags: ['计算物理', '电磁学', 'MATLAB'],
    result: '三维场计算与粒子轨道模拟',
    featured: true,
  },
  {
    number: 'P.04',
    title: 'PF2 线圈位移误差磁场分析',
    subtitle: 'Displacement error field of the PF2 coil',
    description: '研究线圈刚性平移引起的三维误差场，比较不同位移模型，并以柱坐标傅里叶分解识别 n = 1 主导模态。',
    tags: ['磁场模拟', '傅里叶分析', '数值计算'],
    result: '误差场建模与模态识别',
  },
  {
    number: 'P.05',
    title: '保研夏令营信息导航',
    subtitle: 'Summer camp information navigator',
    description: '面向应用物理与光电信息方向的信息聚合网页，负责页面整理与界面制作；抓取脚本作者署名“和谐号”。',
    tags: ['信息聚合', '网页设计', '协作项目'],
    result: '页面整理与前端界面：亚略Ar',
  },
];
