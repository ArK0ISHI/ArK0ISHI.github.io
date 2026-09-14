export const experiments = [
  {
    id: 'double-pendulum', number: '01', title: '双摆与混沌', english: 'A SMALL DIFFERENCE',
    question: '只差一点，会走向多远？',
    description: '把两个几乎一样的双摆同时放开，看轨迹何时分离；再比较两种数值方法如何保存能量。',
    prompt: '试着改变初始角度，然后只给第二个摆加上一点微扰。',
    topics: ['初值敏感性', '数值积分', '能量误差'],
    provenance: '由计算物理课程主题延伸的网页演示',
    href: '/lab/double-pendulum/', action: '放开双摆',
  },
  {
    id: 'foraging', number: '02', title: '三秒钟的取舍', english: 'THREE SECONDS TO CHOOSE',
    question: '追上眼前的，还是留在机会里？',
    description: '食饵只停留三秒。让两种策略面对同一场随机事件，看看它们如何选择目标与下一步的位置。',
    prompt: '先观察目标为何改变，再换一组随机事件比较结果。',
    topics: ['机器人决策', '短寿命目标', '策略对照'],
    provenance: '依据数模问题基本规则制作的网页演示',
    href: '/lab/foraging/', action: '观察机器人',
  },
  {
    id: 'free-kick', number: '03', title: '一记任意球的飞行', english: 'FROM PIXELS TO A FLIGHT',
    question: '换个角度，能看见什么？',
    description: '转动从比赛视频重建的三维轨迹，在原始测量点与平滑曲线之间，重新观察一次飞行。',
    prompt: '切到侧视图，再打开原始测量点，比较细小的偏差。',
    topics: ['三维重建', '29 组坐标', '多视角观察'],
    provenance: '读取任意球研究中用于制图的坐标数据',
    href: '/blog/huashu-cup-a-2026/#trajectory-explorer', action: '转动这条轨迹',
  },
] as const;
