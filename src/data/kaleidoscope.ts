export interface KaleidoscopeDetail {
  id: string;
  title: string;
  /** Position in the original 4:3 photograph, expressed as percentages. */
  x: number;
  y: number;
  observation: string;
  question: string;
  href: string;
  linkLabel: string;
}

export interface KaleidoscopeScene {
  id: 'hangzhou' | 'nanjing' | 'shanghai';
  number: string;
  city: string;
  title: string;
  subtitle: string;
  photoId: string;
  storyId: string;
  timeLabel: string;
  atmosphere: string;
  introduction: string;
  chanceNote: string;
  curatedNote: string;
  accent: string;
  focusY: number;
  details: readonly KaleidoscopeDetail[];
}

/**
 * A fictional window journey assembled from existing, factual photo records.
 * These observations describe visible details; they do not add travel memories.
 * The Shanghai photograph was taken through an aircraft window.
 */
export const kaleidoscopeScenes: readonly KaleidoscopeScene[] = [
  {
    id: 'hangzhou',
    number: '01',
    city: '杭州',
    title: '晚霞停在湖面',
    subtitle: '西湖湖滨 · 暮色',
    photoId: '20260716-191447',
    storyId: 'westlake-return',
    timeLabel: '2026.07.16 · 19:14',
    atmosphere: '霞光与树影',
    introduction: '橙红贴着远山展开，天空上方仍留着蓝灰。树枝伸入画面，湖面把晚霞拆成细碎的光。这一站从重返西湖的照片出发，沿三个细节慢慢看。',
    chanceNote: '让蓝灰色的云、偏暗的树影和不均匀的水纹一起留下。晚霞只占据一部分天空，这份没有铺满的颜色也属于黄昏。',
    curatedNote: '调暖显示色彩，让玻璃上的柔光更明显。云层、水纹与树枝的位置仍来自同一张照片；变化发生在观看的方式里。',
    accent: '#dfa486',
    focusY: 50,
    details: [
      {
        id: 'clouds',
        title: '晚霞没有铺满天空',
        x: 28,
        y: 37,
        observation: '最亮的橙红集中在远山上方，往高处看，云层很快转成蓝灰。细小云块留下密密的纹理，让暖色有了边缘。只截取最鲜艳的一带，很容易把这片黄昏看成另一种天气；保留上方的冷色，才看得出光正在怎样退去。',
        question: '如果一扇窗只留下最鲜艳的部分，它省略了什么？',
        href: '/blog/hifuu-kaleido-window/',
        linkLabel: '读「一扇太懂乘客的窗」',
      },
      {
        id: 'water',
        title: '水面没有重复天空',
        x: 26,
        y: 74,
        observation: '湖面上的橙色没有连成完整的一片，而是顺着一道道波纹断开。天空中宽阔的色带，到了水里变成明暗相间的短线。倒影于是多出自己的纹理：它仍能让人认出晚霞，也把水面此刻的起伏一并留在了照片里。',
        question: '同一束光，落在天空与水面上，为什么会有两种节奏？',
        href: '/light-notes/#westlake-return',
        linkLabel: '继续看「重返西湖」',
      },
      {
        id: 'branches',
        title: '伸进来的树枝',
        x: 62,
        y: 38,
        observation: '右上方的树冠占了很大一块画面，枝叶之间还能看见天空。它挡住一部分晚霞，也把远处的湖岸和眼前的位置分开。枝条并没有沿着画框整齐收边，湖边的观看因此留下了一点遮挡，以及站在树下才会有的距离。',
        question: '一处遮挡，有时会不会比完整的远景更能说明我们在哪里？',
        href: '/light-notes/#westlake-return',
        linkLabel: '回到这一晚的照片',
      },
    ],
  },
  {
    id: 'nanjing',
    number: '02',
    city: '南京',
    title: '雨把颜色留住',
    subtitle: '南京大学鼓楼校区 · 雨中',
    photoId: '20260713-101553',
    storyId: 'nju-gulou',
    timeLabel: '2026.07.13 · 10:15',
    atmosphere: '雨伞与草坪',
    introduction: '灰白天空下，草坪显得格外明亮。几把雨伞、泛光的石路和屋顶间露出的高楼，把北大楼前的景象分成远近几层。雨天让目光停在这些细处。',
    chanceNote: '留下灰白的天空与深色的屋檐。雨伞没有排成整齐的队列，湿路也没有统一的亮度，校园在这些不齐整的地方展开。',
    curatedNote: '让草坪的绿更鲜明，再覆上一层玻璃柔光。目光更容易停在明亮的地方；试着把视线移回灰天和湿路，看还有哪些颜色值得留下。',
    accent: '#a7bdae',
    focusY: 50,
    details: [
      {
        id: 'umbrellas',
        title: '几把不同颜色的伞',
        x: 32.8,
        y: 61,
        observation: '草坪边的小路上，白色、蓝色和深色的伞散在不同位置。伞面比人物更容易从绿意里被认出来，也给开阔的校园补上了人的尺度。照片停在这一刻，足以看清彼此的距离，却没有替我们交代他们从哪里来、要往哪里去。',
        question: '如果先看见的是雨伞，你会怎样想象这张照片里的行走？',
        href: '/light-notes/#nju-gulou',
        linkLabel: '继续看「雨中的南大」',
      },
      {
        id: 'roofs',
        title: '屋顶之间的另一座楼',
        x: 36.5,
        y: 40.5,
        observation: '深色屋顶与树木之间，一座浅色高楼露出了上半部。它的竖线和近处的坡屋顶并置在同一片灰天里，距离在这里变得可见。相机没有把校园从周围的城市单独摘出来；越过檐角再看一眼，画面便多出了一层背景。',
        question: '把远处的高楼裁掉以后，这所校园会显得更完整，还是更孤立？',
        href: '/blog/hifuu-kaleido-window/',
        linkLabel: '读关于风景与选择的边注',
      },
      {
        id: 'wet-path',
        title: '石路借来一点天空',
        x: 11,
        y: 76,
        observation: '左下方的石路呈现深浅不一的亮面，靠近草坪的边线仍然清楚。灰白的天色在积水和湿石上留下反光，鲜绿则紧贴着道路延伸。低头看这一小块地方，雨天的颜色有了具体的来处，也有了可以辨认的材质。',
        question: '不看天空，只凭这段路面，你能认出这是一场雨中的风景吗？',
        href: '/light-notes/#nju-gulou',
        linkLabel: '回到这一天的校园照片',
      },
    ],
  },
  {
    id: 'shanghai',
    number: '03',
    city: '上海',
    title: '城市成为光的纹路',
    subtitle: '浦东上空 · 飞机舷窗',
    photoId: '20260705-224241',
    storyId: 'night-flight',
    timeLabel: '2026.07.05 · 22:42',
    atmosphere: '翼尖与灯火',
    introduction: '夜航的飞机舷窗里，红色翼尖伸向铺开的灯火。地面的街道逐渐成为线条，近处的布偶却模糊成一团颜色。远方与身边，在这扇窗里交换了清晰的程度。',
    chanceNote: '让翼尖、舷窗边框和近处失焦的布偶留在画面里。城市没有单独悬在黑夜中，观看它的位置同样被照片记了下来。',
    curatedNote: '让金色灯带更鲜明，玻璃映出一点柔光。城市的连接变得醒目，深暗处则退向背景；留意这一次调色，把你的目光带到了哪里。',
    accent: '#a8b5dc',
    focusY: 50,
    details: [
      {
        id: 'wingtip',
        title: '一块没有变小的红色',
        x: 31,
        y: 28,
        observation: '地面的灯已经缩成细点，红色翼尖仍保留清楚的轮廓与图案。它伸进城市上方，让远近两种尺度在同一张照片里相遇。即使暂时忘掉地点，只看这片机翼，也能知道目光来自飞机舷窗，而不是一座高楼的观景台。',
        question: '画面里哪一个近处的东西，让你读懂了远方的距离？',
        href: '/light-notes/#night-flight',
        linkLabel: '继续看「夜航」',
      },
      {
        id: 'lights',
        title: '灯火连成了线',
        x: 66,
        y: 42,
        observation: '金色与白色的灯在地面排成细线，局部又聚成明亮的块面。街区的细节退远后，连接与间隔反而清楚起来，于是夜景有了近似电路的形状。这是一种由观看距离带来的相似：照片仍然是城市，目光却开始读它的纹路。',
        question: '当细节退成纹路，我们更容易理解一座城市，还是更容易想象它？',
        href: '/blog/hifuu-kaleido-window/',
        linkLabel: '读关于真实与观看的边注',
      },
      {
        id: 'window-frame',
        title: '窗框仍在画面里',
        x: 93,
        y: 49,
        observation: '照片两侧留下了舷窗边缘，右边的弧线尤其明显。裁去这道边框，很容易只看到一片漂浮的灯；把它留下，城市就有了观看的位置。我们在窗内，它在窗外，近处的反光也成为这一刻的一部分，让远方有了可以对照的距离。',
        question: '如果窗框消失了，你还会怎样判断这片灯火的距离？',
        href: '/light-notes/#night-flight',
        linkLabel: '查看飞机舷窗中的原照片',
      },
    ],
  },
];
