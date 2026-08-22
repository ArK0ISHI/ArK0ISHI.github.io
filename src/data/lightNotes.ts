export type LightNoteLocation = {
  city: string;
  place: string;
  confidence: 'confirmed' | 'inferred';
};

export type LightNotePhoto = {
  id: string;
  shotAt: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  alt: string;
  location: LightNoteLocation;
};

export type LightNoteStoryItem = {
  photoId: string;
  caption: string;
  layout?: 'standard' | 'wide' | 'portrait' | 'compact';
};

export type LightNoteStory = {
  id: string;
  city: string;
  title: string;
  en: string;
  intro: string;
  items: readonly LightNoteStoryItem[];
};

const imageRoot = '/images/journal/2026-summer';

type PhotoSeed = Omit<LightNotePhoto, 'thumb' | 'full' | 'thumbWidth' | 'thumbHeight'>;

const definePhoto = (seed: PhotoSeed): LightNotePhoto => {
  const landscape = seed.width >= seed.height;
  return {
    ...seed,
    thumb: `${imageRoot}/${seed.id}-thumb.webp`,
    full: `${imageRoot}/${seed.id}-full.webp`,
    thumbWidth: landscape ? 720 : 540,
    thumbHeight: landscape ? 540 : 720,
  };
};

const confirmed = (city: string, place: string): LightNoteLocation => ({ city, place, confidence: 'confirmed' });
const inferred = (city: string, place: string): LightNoteLocation => ({ city, place, confidence: 'inferred' });

/**
 * 只保存可公开的事实层：拍摄时间、经过模糊化的地点、派生图尺寸与替代文本。
 * 原始 GPS、酒店/餐厅名称与故事编排不进入这一层。
 */
export const lightNotePhotos: readonly LightNotePhoto[] = [
  definePhoto({ id: '20260702-024833', shotAt: '2026-07-02T02:48:00+08:00', width: 2000, height: 1500, alt: '暖色房间里，一只粉色布偶站在床前', location: confirmed('杭州', '转塘') }),
  definePhoto({ id: '20260703-174559', shotAt: '2026-07-03T17:45:00+08:00', width: 2000, height: 1500, alt: '粉色布偶与一杯分层抹茶饮品', location: confirmed('杭州', '湖滨') }),
  definePhoto({ id: '20260703-182403', shotAt: '2026-07-03T18:24:00+08:00', width: 2000, height: 1500, alt: '暖光下的日式套餐与粉色布偶', location: confirmed('杭州', '湖滨') }),
  definePhoto({ id: '20260703-182502', shotAt: '2026-07-03T18:25:00+08:00', width: 2000, height: 1500, alt: '蛋黄肉饭与三文鱼小碗的近景', location: confirmed('杭州', '湖滨') }),
  definePhoto({ id: '20260703-182844', shotAt: '2026-07-03T18:28:00+08:00', width: 1500, height: 2000, alt: '粉色布偶与蛋黄肉饭的竖幅近景', location: confirmed('杭州', '湖滨') }),
  definePhoto({ id: '20260703-182907', shotAt: '2026-07-03T18:29:00+08:00', width: 1500, height: 2000, alt: '粉色布偶与橙色三文鱼饭的竖幅近景', location: confirmed('杭州', '湖滨') }),
  definePhoto({ id: '20260703-191210', shotAt: '2026-07-03T19:12:00+08:00', width: 2000, height: 1500, alt: '树影和厚重云层下的西湖傍晚', location: confirmed('杭州', '西湖湖滨') }),
  definePhoto({ id: '20260703-191615', shotAt: '2026-07-03T19:16:00+08:00', width: 2000, height: 1500, alt: '蓝调时刻的湖面、远山与前景布偶', location: confirmed('杭州', '西湖湖滨') }),
  definePhoto({ id: '20260703-191633', shotAt: '2026-07-03T19:16:00+08:00', width: 2000, height: 1500, alt: '暖光照亮布偶，西湖退成蓝色焦外背景', location: confirmed('杭州', '西湖湖滨') }),
  definePhoto({ id: '20260703-191710', shotAt: '2026-07-03T19:17:00+08:00', width: 2000, height: 1500, alt: '蓝色湖面、远岸灯火与亮起的雷峰塔', location: confirmed('杭州', '西湖湖滨') }),
  definePhoto({ id: '20260704-082136', shotAt: '2026-07-04T08:21:00+08:00', width: 2000, height: 1500, alt: '报告厅屏幕显示复旦大学物理系夏令营欢迎画面', location: confirmed('上海', '复旦大学江湾校区') }),
  definePhoto({ id: '20260705-224241', shotAt: '2026-07-05T22:42:00+08:00', width: 2000, height: 1500, alt: '飞机舷窗外的翼尖与大片城市夜景', location: confirmed('上海', '浦东上空') }),
  definePhoto({ id: '20260705-224305', shotAt: '2026-07-05T22:43:00+08:00', width: 2000, height: 1500, alt: '舷窗前的布偶、红色翼尖与城市焦外光斑', location: confirmed('上海', '浦东上空') }),
  definePhoto({ id: '20260706-085233', shotAt: '2026-07-06T08:52:00+08:00', width: 2000, height: 1500, alt: '清华大学深圳国际研究生院的红砖门廊', location: confirmed('深圳', '清华大学深圳国际研究生院') }),
  definePhoto({ id: '20260706-085239', shotAt: '2026-07-06T08:52:00+08:00', width: 2000, height: 1500, alt: '红砖门廊前的粉色布偶特写', location: confirmed('深圳', '清华大学深圳国际研究生院') }),
  definePhoto({ id: '20260710-153142', shotAt: '2026-07-10T15:31:00+08:00', width: 2000, height: 1500, alt: '云隙阳光下的李政道研究所建筑', location: confirmed('上海', '李政道研究所（张江）') }),
  definePhoto({ id: '20260713-095945', shotAt: '2026-07-13T09:59:00+08:00', width: 2000, height: 1500, alt: '雨中的南京大学校门与前景布偶', location: confirmed('南京', '南京大学鼓楼校区') }),
  definePhoto({ id: '20260713-095956', shotAt: '2026-07-13T09:59:00+08:00', width: 2000, height: 1500, alt: '南京大学校门前的粉色布偶合影', location: confirmed('南京', '南京大学鼓楼校区') }),
  definePhoto({ id: '20260713-101548', shotAt: '2026-07-13T10:15:00+08:00', width: 2000, height: 1500, alt: '雨幕中的南京大学北大楼、草坪与布偶', location: confirmed('南京', '南京大学鼓楼校区') }),
  definePhoto({ id: '20260713-101549', shotAt: '2026-07-13T10:15:00+08:00', width: 2000, height: 1500, alt: '北大楼前草坪上的粉色布偶特写', location: confirmed('南京', '南京大学鼓楼校区') }),
  definePhoto({ id: '20260713-101553', shotAt: '2026-07-13T10:15:00+08:00', width: 2000, height: 1500, alt: '雨伞、草坪和南京大学北大楼构成的校园景象', location: confirmed('南京', '南京大学鼓楼校区') }),
  definePhoto({ id: '20260714-092643', shotAt: '2026-07-14T09:26:00+08:00', width: 2000, height: 1500, alt: '花丛、树木与科研园区入口前的布偶', location: inferred('北京', '永丰科研园区') }),
  definePhoto({ id: '20260714-092657', shotAt: '2026-07-14T09:26:00+08:00', width: 2000, height: 1500, alt: '科研园区入口与前景粉色布偶', location: inferred('北京', '永丰科研园区') }),
  definePhoto({ id: '20260714-124239', shotAt: '2026-07-14T12:42:00+08:00', width: 2000, height: 1500, alt: '红砖科研楼中交错的走廊与楼梯', location: confirmed('北京', '中关村，中国科学院物理研究所') }),
  definePhoto({ id: '20260714-190933', shotAt: '2026-07-14T19:09:00+08:00', width: 2000, height: 1500, alt: '寿司、果饮与粉色布偶组成的晚餐桌面', location: confirmed('北京', '五道口') }),
  definePhoto({ id: '20260715-130620', shotAt: '2026-07-15T13:06:00+08:00', width: 2000, height: 1500, alt: '强烈日光下的鼓楼与前景布偶', location: confirmed('北京', '鼓楼') }),
  definePhoto({ id: '20260715-142352', shotAt: '2026-07-15T14:23:00+08:00', width: 2000, height: 1500, alt: '蓝莓刨冰与探入画面的粉色布偶', location: confirmed('北京', '南锣鼓巷') }),
  definePhoto({ id: '20260716-191447', shotAt: '2026-07-16T19:14:00+08:00', width: 2000, height: 1500, alt: '橙红晚霞映照西湖，树下布偶靠近镜头', location: confirmed('杭州', '西湖湖滨') }),
  definePhoto({ id: '20260716-193337', shotAt: '2026-07-16T19:33:00+08:00', width: 2000, height: 1500, alt: '夜色、音乐喷泉、人群与前景布偶', location: confirmed('杭州', '西湖湖滨') }),
  definePhoto({ id: '20260716-195031', shotAt: '2026-07-16T19:50:00+08:00', width: 2000, height: 1500, alt: '夜幕下的西湖远岸灯带与前景布偶', location: confirmed('杭州', '西湖湖滨') }),
  definePhoto({ id: '20260719-122154', shotAt: '2026-07-19T12:21:00+08:00', width: 2000, height: 1500, alt: '两大锅热菜、凉菜与围桌朋友的午餐', location: confirmed('上海', '松江新城') }),
  definePhoto({ id: '20260720-102414', shotAt: '2026-07-20T10:24:00+08:00', width: 2000, height: 1500, alt: '抹茶甜点、麦片小碗和探入画面的布偶', location: confirmed('上海', '松江大学城') }),
  definePhoto({ id: '20260721-095150', shotAt: '2026-07-21T09:51:00+08:00', width: 2000, height: 1500, alt: '上海微系统所入口与前景布偶', location: confirmed('上海', '上海微系统所长宁园区') }),
  definePhoto({ id: '20260721-095152', shotAt: '2026-07-21T09:51:00+08:00', width: 2000, height: 1500, alt: '微系统所入口前的粉色布偶特写', location: confirmed('上海', '上海微系统所长宁园区') }),
  definePhoto({ id: '20260721-115153', shotAt: '2026-07-21T11:51:00+08:00', width: 2000, height: 1500, alt: '炙烧寿司、三文鱼寿司与桌边布偶', location: confirmed('上海', '长宁') }),
  definePhoto({ id: '20260721-132154', shotAt: '2026-07-21T13:21:00+08:00', width: 2000, height: 1500, alt: '节奏街机成绩画面与前景布偶', location: confirmed('上海', '中山公园') }),
  definePhoto({ id: '20260722-132102', shotAt: '2026-07-22T13:21:00+08:00', width: 2000, height: 1500, alt: '上海微系统所嘉定园区建筑与前景布偶', location: confirmed('上海', '上海微系统所嘉定园区') }),
  definePhoto({ id: '20260722-181422', shotAt: '2026-07-22T18:14:00+08:00', width: 2000, height: 1500, alt: '挑高大厅内竖向排列的英文灯光文字', location: confirmed('上海', '上海科技大学张江校区') }),
  definePhoto({ id: '20260726-180103', shotAt: '2026-07-26T18:01:00+08:00', width: 2000, height: 1500, alt: '开阔广场、旗杆与南京大学苏州校区建筑', location: confirmed('苏州', '南京大学苏州校区') }),
  definePhoto({ id: '20260726-180106', shotAt: '2026-07-26T18:01:00+08:00', width: 2000, height: 1500, alt: '南京大学苏州校区广场前的粉色布偶特写', location: confirmed('苏州', '南京大学苏州校区') }),
  definePhoto({ id: '20260731-153228', shotAt: '2026-07-31T15:32:00+08:00', width: 2000, height: 1500, alt: '炽焰天穹周年主题空间与角色立牌', location: confirmed('上海', '南京东路，上海 PASS 品牌体验中心') }),
  definePhoto({ id: '20260731-153437', shotAt: '2026-07-31T15:34:00+08:00', width: 1500, height: 2000, alt: '炽焰天穹周年活动入口海报的竖幅画面', location: confirmed('上海', '南京东路，上海 PASS 品牌体验中心') }),
  definePhoto({ id: '20260731-160340', shotAt: '2026-07-31T16:03:00+08:00', width: 2000, height: 1500, alt: '红汤拉面、串物与桌边粉色布偶', location: confirmed('上海', '南京东路') }),
] as const;

/**
 * 故事层只引用事实照片的稳定 id；顺序、文字和版面都可独立改写。
 * 未来可以用同一批 photoId 再组织新的路线，而不改动事实层。
 */
export const lightNoteStories: readonly LightNoteStory[] = [
  {
    id: 'hangzhou-arrival', city: '杭州', title: '旅途的序夜', en: 'A ROOM BEFORE DAWN',
    intro: '抵达时已经很晚。第一张照片没有地标，只有陌生房间里重新安静下来的行李与同行者。',
    items: [{ photoId: '20260702-024833', caption: '抵达后的深夜，先把旅途安放下来。', layout: 'wide' }],
  },
  {
    id: 'hangzhou-westlake-0703', city: '杭州', title: '湖滨的黄昏', en: 'BLUE HOUR BY THE LAKE',
    intro: '从一杯抹茶、一顿晚饭走向西湖的蓝调时刻；旅行的尺度，在餐桌与远岸灯火之间慢慢展开。',
    items: [
      { photoId: '20260703-174559', caption: '一杯抹茶，把下午与黄昏接在一起。', layout: 'standard' },
      { photoId: '20260703-182403', caption: '西湖边的第一顿晚饭，暖色开始聚拢。', layout: 'standard' },
      { photoId: '20260703-182502', caption: '米饭、蛋黄与三文鱼，旅行也有具体的香气。', layout: 'wide' },
      { photoId: '20260703-182844', caption: '镜头贴近餐桌，记下这一顿的温度。', layout: 'portrait' },
      { photoId: '20260703-182907', caption: '一碗橙色的晚餐，旁边还有小小的祝福。', layout: 'portrait' },
      { photoId: '20260703-191210', caption: '暴雨似乎藏在云后，湖面仍旧安静。', layout: 'wide' },
      { photoId: '20260703-191615', caption: '蓝调时刻，远岸灯火尚未完全醒来。', layout: 'compact' },
      { photoId: '20260703-191633', caption: '把焦点留给同行者，西湖退到柔软的远景。', layout: 'compact' },
      { photoId: '20260703-191710', caption: '雷峰塔亮起第一束灯，黄昏正式落下。', layout: 'compact' },
    ],
  },
  {
    id: 'fudan-summer-camp', city: '上海', title: '一块屏幕的开场', en: 'PHYSICS, DAY ONE',
    intro: '夏令营在报告厅里开场。镜头只记下一块欢迎屏，却足够成为这段学术行旅的第一页。',
    items: [{ photoId: '20260704-082136', caption: '复旦物理夏令营，从这一块屏幕开始。', layout: 'wide' }],
  },
  {
    id: 'night-flight', city: '上海', title: '夜航', en: 'CITY AS A CIRCUIT',
    intro: '从舷窗回望，地面的街道像电路，翼尖和焦外灯火把城市缩成一张尚未标注的图。',
    items: [
      { photoId: '20260705-224241', caption: '夜航离开上海，城市灯火铺成一张电路。', layout: 'wide' },
      { photoId: '20260705-224305', caption: '翼尖与焦外光斑，把高度变成了抽象画。', layout: 'standard' },
    ],
  },
  {
    id: 'tsinghua-sigs', city: '深圳', title: '雨后的红砖', en: 'SOUTHBOUND CAMPUS',
    intro: '南方的雨先抵达校园。建筑与同行者轮流成为焦点，门廊则把清晨收进一段深红色的透视。',
    items: [
      { photoId: '20260706-085233', caption: '雨后的红砖门廊，南方一站由此展开。', layout: 'wide' },
      { photoId: '20260706-085239', caption: '把同行者放到门前，也把旅程放进校园。', layout: 'standard' },
    ],
  },
  {
    id: 'tdli-visit', city: '上海', title: '云隙下的研究所', en: 'A BUILDING UNDER LIGHT',
    intro: '云层在研究所上方打开一道缝。名字、立面与天空恰好同时清晰，像一次短暂的观测窗口。',
    items: [{ photoId: '20260710-153142', caption: '云隙下的研究所，名字与天空同样清晰。', layout: 'wide' }],
  },
  {
    id: 'nju-gulou', city: '南京', title: '雨中的南大', en: 'RAIN OVER GULOU',
    intro: '校门、北大楼、草坪和撑伞的人都被雨重新着色。同行者在画面里反复出现，像一枚移动的书签。',
    items: [
      { photoId: '20260713-095945', caption: '雨落在校门前，石面与树叶都更深了一层。', layout: 'standard' },
      { photoId: '20260713-095956', caption: '南大门前，留下一张真正属于旅途的合照。', layout: 'standard' },
      { photoId: '20260713-101548', caption: '雨里的北大楼，红星从绿意上方探出。', layout: 'wide' },
      { photoId: '20260713-101549', caption: '焦点回到同行者，建筑成为朦胧的注脚。', layout: 'standard' },
      { photoId: '20260713-101553', caption: '草坪、雨伞与北大楼，构成一幅潮湿的校园切片。', layout: 'standard' },
    ],
  },
  {
    id: 'beijing-research', city: '北京', title: '研究所的一天', en: 'FROM YONGFENG TO ZHONGGUANCUN',
    intro: '从永丰到中关村，入口、走廊与晚饭把密集的一天切成四段。机构名称尚待核对的地方，只保留园区级标注。',
    items: [
      { photoId: '20260714-092643', caption: '花丛边望向研究所大门，云层正慢慢展开。', layout: 'standard' },
      { photoId: '20260714-092657', caption: '同一个入口，换一个焦点，行程继续向北。', layout: 'standard' },
      { photoId: '20260714-124239', caption: '红砖与层层走廊，把研究空间折成几何结构。', layout: 'wide' },
      { photoId: '20260714-190933', caption: '晚饭给密集的一天收尾，芒果与橙色仍很明亮。', layout: 'standard' },
    ],
  },
  {
    id: 'beijing-old-city', city: '北京', title: '鼓楼与胡同', en: 'NOON IN THE OLD CITY',
    intro: '正午的阳光几乎抹掉建筑的边缘，胡同里的刨冰又把盛夏还原成一口具体的凉意。',
    items: [
      { photoId: '20260715-130620', caption: '正午的鼓楼，阳光几乎把檐角融掉。', layout: 'wide' },
      { photoId: '20260715-142352', caption: '胡同里的蓝莓刨冰，是盛夏最直接的降温方式。', layout: 'standard' },
    ],
  },
  {
    id: 'westlake-return', city: '杭州', title: '重返西湖', en: 'THE LAKE, ONCE MORE',
    intro: '同一片湖在两周后显出另一种光。晚霞、喷泉和倒影依次接管画面，直到夜色完全落下。',
    items: [
      { photoId: '20260716-191447', caption: '重返湖边，晚霞把水面也染成橙红。', layout: 'wide' },
      { photoId: '20260716-193337', caption: '喷泉、手机屏幕与人群，一起接住夜色。', layout: 'standard' },
      { photoId: '20260716-195031', caption: '夜色完全落下以后，湖岸只剩灯与倒影。', layout: 'standard' },
    ],
  },
  {
    id: 'songjiang-table', city: '上海', title: '松江的饭桌', en: 'A TABLE WITH FRIENDS',
    intro: '奔波暂停以后，饭桌把散落在不同城市的日子重新收拢成一顿热闹的午餐。',
    items: [{ photoId: '20260719-122154', caption: '和同好围坐的一桌，旅行也重新变成日常。', layout: 'wide' }],
  },
  {
    id: 'songjiang-morning', city: '上海', title: '慢下来的上午', en: 'A SLOW MORNING',
    intro: '不赶车，也不赶下一场报告。抹茶、麦片和朋友，让一天从低速开始。',
    items: [{ photoId: '20260720-102414', caption: '抹茶、麦片与朋友，慢下来的上午。', layout: 'wide' }],
  },
  {
    id: 'simit-changning', city: '上海', title: '微系统所与街机', en: 'DEVICES, THEN ARCADE',
    intro: '参访从器件与系统开始，午后却拐进寿司店和街机厅。严肃与松弛本来就可以属于同一天。',
    items: [
      { photoId: '20260721-095150', caption: '微系统所门前，先留下第一张参访记录。', layout: 'standard' },
      { photoId: '20260721-095152', caption: '建筑与同行者，焦点轮流落下。', layout: 'standard' },
      { photoId: '20260721-115153', caption: '午间补给：炙烧、寿司与一点喘息。', layout: 'standard' },
      { photoId: '20260721-132154', caption: '科研参访之后，把下午交给一局街机。', layout: 'standard' },
    ],
  },
  {
    id: 'simit-jiading-zhangjiang', city: '上海', title: '从嘉定到张江', en: 'TWO ENDS OF A CITY',
    intro: '同一座城市里的两处研究空间，被通勤距离与建筑语言拉开；相机把它们重新并置在一页上。',
    items: [
      { photoId: '20260722-132102', caption: '从市区到嘉定，继续看器件如何走向系统。', layout: 'standard' },
      { photoId: '20260722-181422', caption: 'SUPER / INTELLIGENT / STUDENTS / TEACHERS，像一首竖排诗。', layout: 'standard' },
    ],
  },
  {
    id: 'nju-suzhou', city: '苏州', title: '新校区的大天空', en: 'A CAMPUS STILL OPENING',
    intro: '新校区把大量空间留给天空与轴线。建筑还很新，同行者已经先一步成为这里的尺度。',
    items: [
      { photoId: '20260726-180103', caption: '新校区的广场留出很大的天空，旗帜位于正中。', layout: 'wide' },
      { photoId: '20260726-180106', caption: '把焦点拉回同行者，远处的建筑成为旅程背景。', layout: 'standard' },
    ],
  },
  {
    id: 'hbr-shanghai', city: '上海', title: '周年小站', en: 'AN AFTERNOON IN PINK',
    intro: '七月最后一站忽然变成轻快的粉与蓝。活动空间像临时搭起的舞台，离开以后再用一碗红汤收尾。',
    items: [
      { photoId: '20260731-153228', caption: '走进《炽焰天穹》周年空间，色彩一下变得轻快。', layout: 'standard' },
      { photoId: '20260731-153437', caption: '门外的周年海报，像给这一站加上的封面。', layout: 'portrait' },
      { photoId: '20260731-160340', caption: '活动后的红汤拉面，把下午收束成暖色。', layout: 'standard' },
    ],
  },
] as const;

