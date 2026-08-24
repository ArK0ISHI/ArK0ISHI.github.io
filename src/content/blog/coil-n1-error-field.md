---
title: '一厘米的偏移如何进入三维磁场：PF2 线圈误差场'
description: '从刚性平移、Biot–Savart 离散积分到环向傅里叶谱，记录一次 PF2 线圈位移误差场的计算物理作业。'
date: 2026-05-14
updated: 2026-08-24
tags: ['计算物理', 'Biot–Savart', '误差场', '傅里叶分析']
category: '计算物理'
kind: 'note'
featured: true
authorLabel: '课程档案 I'
scopeNote: '本文依据 2026 年 5 月 14 日提交的计算物理期中报告整理。公开版保留模型、关键图与结论，省略封面、完整程序和个人信息。'
---

PF2 线圈的半径是 $13.1\ \mathrm{m}$，计算中施加的水平位移只有 $1\ \mathrm{cm}$。这两个尺度相差三数量级。作业要追踪这次微小平移怎样改变三维磁场，并在一圈角向采样中辨认它留下的模态。

计算覆盖 $75\times75\times60=337\,500$ 个空间点。每个点都要分别求位移前后的磁场，再把差值换成柱坐标分量。云图负责展示空间分布，环向傅里叶谱则给出更紧凑的判断：水平刚性平移主要激发 $n=1$ 模态。

## 定稿范围

期中作业留下了多轮排版与扩写版本。最终提交件是 2026 年 5 月 14 日生成的 108 页报告；正文对应同日完成的规范化定稿源文件。文件夹里那份名称较短的 TeX 停留在 5 月 1 日，缺少后来加入的英文摘要、扩展讨论和完整代码附录，因此没有把它作为网页依据。

网页沿用最终报告的数值和图件，同时收紧叙事。封面、姓名、学号、班级、本机路径及整段程序都没有进入公开版本。

## 先把一厘米说清楚

线圈模型采用圆形细导线。半径 $R_c=13.1\ \mathrm{m}$，中心高度 $Z_c=7.91\ \mathrm{m}$；单匝电流 $63\ \mathrm{kA}$，匝数 286，因此等效安匝数为

$$
I_{\mathrm{eff}}=63\,000\times286
=1.8018\times10^7\ \mathrm{A}.
$$

误差工况把整只线圈沿 $+x$ 方向移动

$$
d=0.01\ \mathrm{m}.
$$

半径、形状和电流都保持不变。若理想线圈上的源点写作

$$
\mathbf r'(\phi)=
\begin{bmatrix}
R_c\cos\phi\\
R_c\sin\phi\\
Z_c
\end{bmatrix},
$$

位移后的源点就是

$$
\mathbf r'_d(\phi)=\mathbf r'(\phi)+
\begin{bmatrix}d\\0\\0\end{bmatrix}.
$$

这里的 $1\ \mathrm{cm}$ 专指整体坐标平移。若把线圈半径增加同样的长度，轴对称性仍会保留，得到的场结构也会改变。

<figure>
  <img src="/images/projects/pf2-error-field/geometry-1cm.webp" alt="PF2 圆线圈整体几何及沿 x 方向一厘米刚性平移的局部放大图" width="2000" height="1599" loading="lazy" decoding="async" />
  <figcaption>图 1　线圈整体几何与 1 cm 平移的局部放大。局部图专门用来区分刚性平移和半径变化。</figcaption>
</figure>

## 从线元走到三维网格

磁场由 Biot–Savart 定律计算：

$$
\mathbf B(\mathbf r)=
\frac{\mu_0 I_{\mathrm{eff}}}{4\pi}
\oint
\frac{\mathrm d\boldsymbol\ell'\times(\mathbf r-\mathbf r')}
{\left(|\mathbf r-\mathbf r'|^2+r_{\mathrm{reg}}^2\right)^{3/2}}.
$$

圆周离散为 720 个电流元，正则化长度取 $r_{\mathrm{reg}}=0.03\ \mathrm{m}$。正则化让有限网格上的近导线计算保持可控，也意味着线圈附近的峰值会随网格和 $r_{\mathrm{reg}}$ 变化。

空间范围为

$$
x,y\in[-18,18]\ \mathrm{m},
\qquad z\in[0,16]\ \mathrm{m}.
$$

理想场记为 $\mathbf B_0$，位移场记为 $\mathbf B_1$，误差场定义为

$$
\Delta\mathbf B=\mathbf B_1-\mathbf B_0.
$$

<figure>
  <img src="/images/projects/pf2-error-field/ideal-field-streamlines.webp" alt="PF2 理想线圈在对称截面上的磁场强度分布与磁力线" width="2000" height="1000" loading="lazy" decoding="async" />
  <figcaption>图 2　位移前的背景场。对称截面上的场线给后面的误差场提供坐标参照。</figcaption>
</figure>

## 三道数值检查

### 轴上解析解

圆线圈轴上的磁场有解析表达式：

$$
B_z(z)=\frac{\mu_0 I_{\mathrm{eff}}R_c^2}
{2\left[R_c^2+(z-Z_c)^2\right]^{3/2}}.
$$

在选定轴上点，离散积分与解析结果都得到

$$
B_z=8.64201778\times10^{-1}\ \mathrm{T},
$$

相对误差为 $6.29\times10^{-15}$。这项检查主要排除线元方向、叉乘次序和电流系数的错误。

### 电流元收敛

在 $(R,\phi,Z)=(6.2,0,0)$ 处，把圆周电流元数从 180 增至 1440，$|\Delta\mathbf B|$ 稳定在 $3.839943\times10^{-4}\ \mathrm{T}$ 附近。

| 圆周电流元数 | $|\Delta\mathbf B|$ / T |
| ---: | ---: |
| 180 | $3.83994299\times10^{-4}$ |
| 360 | $3.83994299\times10^{-4}$ |
| 720 | $3.83994299\times10^{-4}$ |
| 1440 | $3.83994299\times10^{-4}$ |

### 正则化敏感性

同一点把 $r_{\mathrm{reg}}$ 从 $0.01\ \mathrm{m}$ 调到 $0.05\ \mathrm{m}$，结果只在末几位变化：

| $r_{\mathrm{reg}}$ / m | $|\Delta\mathbf B|$ / T |
| ---: | ---: |
| 0.01 | $3.83998526\times10^{-4}$ |
| 0.03 | $3.83994299\times10^{-4}$ |
| 0.05 | $3.83985844\times10^{-4}$ |

这组检验位于远离线丝的代表点。靠近理想细线时，峰值依然会受到正则化和网格间距的明显影响。

## 误差场在哪里变得显眼

三张正交切片展示 $|\Delta\mathbf B|$ 的空间分布。高值贴近线圈，离开导线后迅速下降；在全域用同一色标绘制时，近场会压缩大部分区域的颜色层次。

<figure>
  <img src="/images/projects/pf2-error-field/error-field-slices.webp" alt="PF2 线圈位移误差磁场在三个正交截面上的强度切片" width="2000" height="1348" loading="lazy" decoding="async" />
  <figcaption>图 3　三维误差场的正交切片。高值区围绕线圈分布，远场仍保留有方向性的低幅结构。</figcaption>
</figure>

全网格统计更适合描述主体量级：

| 统计量 | $|\Delta\mathbf B|$ / T |
| --- | ---: |
| 中位数 | $5.4564\times10^{-4}$ |
| 平均值 | $3.6762\times10^{-3}$ |
| 95% 分位数 | $5.4760\times10^{-3}$ |
| 99% 分位数 | $2.7403\times10^{-2}$ |
| 最大值 | $1.3423\times10^{1}$ |

最大值来自理想细线附近的少量网格点。它对正则化十分敏感，不能代替典型误差水平。中位数与分位数能够更稳妥地说明大部分计算域。

<figure>
  <img src="/images/projects/pf2-error-field/error-field-streamlines.webp" alt="y 等于零截面上的误差磁场分布和投影场线" width="2000" height="1044" loading="lazy" decoding="async" />
  <figcaption>图 4　$y=0$ 截面上的误差场与投影场线。方向图补充了强度云图没有表达的矢量信息。</figcaption>
</figure>

## 换到柱坐标观察

对每个网格点定义

$$
\Delta B_R=\Delta B_x\cos\phi+\Delta B_y\sin\phi,
$$

$$
\Delta B_\phi=-\Delta B_x\sin\phi+\Delta B_y\cos\phi,
$$

$$
\Delta B_Z=\Delta B_z.
$$

固定 $R$ 与 $Z$ 后，三个分量随 $\phi$ 的变化能够直接显示位移方向。沿 $+x$ 平移时，径向与垂直分量呈现近似余弦相位，环向分量则携带相应的正弦结构。

<figure>
  <img src="/images/projects/pf2-error-field/cylindrical-components.webp" alt="固定圆周上误差磁场的径向、环向和垂直分量随角度变化" width="2000" height="614" loading="lazy" decoding="async" />
  <figcaption>图 5　固定圆周上的 $\Delta B_R$、$\Delta B_\phi$ 与 $\Delta B_Z$。曲线的相位记录了水平位移的方向。</figcaption>
</figure>

## $n=1$ 从哪里来

理想轴对称场可写作 $B_0(R,Z)$。把线圈沿 $x$ 方向移动一个小量 $d$，在固定观测点做一阶展开，有

$$
B(R,\phi,Z)-B_0(R,Z)
\approx-d\cos\phi\,\frac{\partial B_0}{\partial R}.
$$

$\cos\phi$ 对应环向模数 $n=1$。若位移转到 $y$ 方向，一阶项变为 $\sin\phi$；任意水平位移都能写成两者的组合。

在 $R=6.2\ \mathrm{m}$、$Z=0$ 的圆周上取 360 个角点，对误差信号做离散傅里叶分解。前四个模态的幅值为：

| 模态 | 幅值 / T |
| ---: | ---: |
| $n=0$ | $5.0035\times10^{-8}$ |
| $n=1$ | $3.4727\times10^{-4}$ |
| $n=2$ | $1.3925\times10^{-8}$ |
| $n=3$ | $2.5386\times10^{-11}$ |

<figure>
  <img src="/images/projects/pf2-error-field/toroidal-spectrum.webp" alt="固定圆周上的误差磁场角分布和环向傅里叶幅值谱" width="2000" height="1528" loading="lazy" decoding="async" />
  <figcaption>图 6　角向分布与傅里叶谱。$n=1$ 幅值比 $n=0$、$n=2$ 高约四个数量级。</figcaption>
</figure>

这个结果把三维云图中的方向性压缩成一组可比较的数字。位移方向改变时，$n=1$ 的相位会随之转动；位移量保持在线性区间时，其幅值应近似正比于 $d$。

## 这份作业还没有包含什么

模型把线圈视为单根圆形细线，没有展开真实线圈包、邻近线圈、铁磁结构和真空室。正则化能控制数值奇异，却不能代替导体截面模型。全域均匀网格也把大量算力留在变化缓慢的区域，后续可以改用局部加密或自适应采样。

误差场只比较了一种刚性平移。若继续研究倾斜、椭圆化、局部变形或多线圈联合误差，需要把几何参数与环向模态建立更系统的对应关系。

这次期中作业把 Biot–Savart 离散、三维网格、坐标变换和傅里叶分析串在了一起。课程的下一份报告沿着同一套磁场计算继续向前，开始追踪带电粒子的全轨道与磁矩绝热性。

[继续阅读课程档案 II：双线圈磁镜场中的粒子运动 →](/blog/magnetic-mirror-orbits/)
