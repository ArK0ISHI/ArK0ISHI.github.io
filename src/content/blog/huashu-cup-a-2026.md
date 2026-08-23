---
title: '一记任意球怎样被重建：视频、动力学与防守策略'
description: '以 2018 年世界杯葡萄牙对西班牙的直接任意球为例，记录双视角三维重建、三类飞行动力学模型比较，以及门将与人墙的联合防守优化。'
date: 2026-08-24
tags: ['数学建模', '计算机视觉', '运动轨迹', '蒙特卡洛']
category: '数学建模'
kind: 'note'
author: '东华大学参赛团队'
authorLabel: '建模与论文'
scopeNote: '本文依照参赛论文整理，保留研究过程、主要公式、图表与结论。'
---

2018 年世界杯小组赛，葡萄牙对阵西班牙。第 87 分钟，克里斯蒂亚诺·罗纳尔多主罚直接任意球，足球绕过人墙后钻入球门。这次建模从这段转播录像开始：先把画面里的足球还原到三维球场，再让三类动力学模型解释它的飞行，最后用模拟轨迹检验人墙与门将该站在哪里。

题目给出的材料离可计算的数据还有一段距离。两路视频的机位不同，镜头会平移、缩放和抖动；足球每秒飞行约二十多米，两个画面只要错开一帧，三角测量就可能产生接近一米的偏差。因而，第一部分花费的工作最多，也决定了后面所有结论的可信度。

## 先把足球从画面里找回来

我们把球门线中点在地面的投影设为原点，沿球门线向左为 $x$ 轴正向，指向场内为 $y$ 轴正向，竖直向上为 $z$ 轴正向。球门四角、横梁中点、门柱中点、禁区线交点等九个固定位置，提供了像素坐标与球场坐标之间的对应关系。

<figure>
  <img src="/images/projects/huashu-cup-a-2026/coordinate-reference-points-fig4-table2.webp" alt="球门坐标系、九个相机标定参考点及其三维坐标" width="1532" height="1286" loading="lazy" decoding="async" />
  <figcaption>图 1　九个固定参考点与球门坐标系。表格给出各点的三维坐标，下图标出它们在球场上的位置。</figcaption>
</figure>

视频截取范围为触球前 $0.4\ \mathrm{s}$ 到触球后 $1.68\ \mathrm{s}$。两路画面均为 $25\ \mathrm{fps}$，各有 53 帧。我们使用 Kinovea 逐帧标出足球中心和九个参考点。由于镜头始终有轻微运动，每一帧都单独估计投影矩阵 $P_t$：

$$
s
\begin{bmatrix}
u\\v\\1
\end{bmatrix}
=P_t
\begin{bmatrix}
x\\y\\z\\1
\end{bmatrix}.
$$

这里 $(u,v)$ 是图像像素，$(x,y,z)$ 是球场坐标。投影矩阵通过直接线性变换求得，计算前分别对二维点和三维点做 Hartley 归一化，再用奇异值分解取齐次方程的最小奇异向量。逐帧回投九个参考点后，相机 1 的重投影 RMSE 均值为 $3.20\ \mathrm{px}$，相机 2 为 $6.49\ \mathrm{px}$。第二路画面的误差更大，仍保持在可用于三角测量的像素量级。

<figure>
  <img src="/images/projects/huashu-cup-a-2026/calibration-reprojection-error-fig6.webp" alt="两台相机逐帧标定的重投影误差曲线" width="1340" height="826" loading="lazy" decoding="async" />
  <figcaption>图 2　两路机位的逐帧标定误差。相机 1 较低且稳定，相机 2 在后段有所上升。</figcaption>
</figure>

### 两台相机要先对上时间

人工选择同一时刻只能把误差压到一帧左右。设两路视频的剩余偏移为 $\delta$ 帧，帧间隔为 $\Delta t=0.04\ \mathrm{s}$，则

$$
t_2=t_1+\delta\Delta t.
$$

在足球离脚至触网前的自由飞行区间 $0.04\text{--}1.08\ \mathrm{s}$ 内，我们对第二路画面的足球像素和投影矩阵做线性插值。每给定一个 $\delta$，便重新三角测量并回投到两幅画面，以两侧重投影误差的平均值作为代价：

$$
J(\delta)=\frac{1}{T}\sum_t\frac{1}{2}
\left(
\left\|\pi(P_t^{(1)}X_\delta)-x_t^{(1)}\right\|_2^2+
\left\|\pi(P_{t+\delta\Delta t}^{(2)}X_\delta)-x_{t+\delta\Delta t}^{(2)}\right\|_2^2
\right).
$$

粗搜索与细搜索得到 $\delta^*=-0.83$ 帧，相当于 $-0.0332\ \mathrm{s}$。按论文采用的时间约定，相机 2 比相机 1 滞后约 $0.83$ 帧。校正后，足球点的平均重投影误差降至 $2.30\ \mathrm{px}$。

<figure>
  <img src="/images/projects/huashu-cup-a-2026/temporal-offset-cost-fig7.webp" alt="候选时间偏移与足球平均重投影误差的代价曲线" width="1350" height="775" loading="lazy" decoding="async" />
  <figcaption>图 3　时间偏移的搜索曲线。虚线是绘图时采用的 −0.85 帧位置，细化搜索结果记为 −0.83 帧。</figcaption>
</figure>

### 从像素得到米和米每秒

同步后的两路射线通过线性三角测量相交，得到 $0.04\text{--}1.16\ \mathrm{s}$ 内的 29 个原始三维点。它们的重投影误差中位数为 $1.92\ \mathrm{px}$，最大值为 $5.51\ \mathrm{px}$，全部通过 $10\ \mathrm{px}$ 的筛选阈值。时间平滑后留下 28 个轨迹点。

<figure>
  <img src="/images/projects/huashu-cup-a-2026/reconstructed-trajectory-fig9-11.webp" alt="平滑三维任意球轨迹的地面投影、斜视图和侧视图" width="1544" height="1984" loading="lazy" decoding="async" />
  <figcaption>图 4　平滑轨迹的地面投影、三维斜视图与侧视图。三幅视图共同检查弯曲方向、过门位置和高度变化。</figcaption>
</figure>

地面投影用三次多项式概括：

$$
y(x)=ax^3+bx^2+cx+d,
$$

$$
[a,b,c,d]=[-1.3022,-9.4364,-25.8052,-27.9500].
$$

拟合得到 $R^2=0.8089$，$y$ 方向 RMSE 为 $3.218\ \mathrm{m}$。这条曲线用来描述平面弯曲趋势；动力学拟合直接读取带时间戳的三维序列。

初速度取足球已经离脚的 $t_0=0.04\ \mathrm{s}$。我们在短时间窗内分别对 $x(t)$、$y(t)$、$z(t)$ 做局部二次拟合，再对多项式求导：

$$
q(t)\approx \alpha_qt^2+\beta_qt+\gamma_q,
\qquad
\dot q(t_0)=2\alpha_qt_0+\beta_q.
$$

由此得到

$$
\mathbf v_0=(-3.282,-25.066,8.616)\ \mathrm{m/s},
\qquad
\lVert\mathbf v_0\rVert=26.708\ \mathrm{m/s}\approx96.1\ \mathrm{km/h}.
$$

轨迹第一次穿过 $y=0$ 的时刻约为 $1.0154\ \mathrm{s}$；到 $t=1.14\ \mathrm{s}$ 时，$y\approx-2.109\ \mathrm{m}$，足球已经越过球门线。这个几何检查也帮我们排除了坐标方向或时间同步写反的可能。

| 重建环节 | 数值 | 用途 |
| --- | ---: | --- |
| 视频帧率 | $25\ \mathrm{fps}$ | 时间采样间隔 $0.04\ \mathrm{s}$ |
| 每帧标定点 | 9 个 | 估计时变投影矩阵 |
| 最优时间偏移 | $-0.83$ 帧 | 对齐两路视频 |
| 足球平均重投影误差 | $2.30\ \mathrm{px}$ | 衡量三角测量的一致性 |
| 初速度大小 | $26.708\ \mathrm{m/s}$ | 三类动力学模型的初始条件 |
| 过球门线时刻 | $1.0154\ \mathrm{s}$ | 检查重建结果的几何合理性 |

## 让三套动力学模型在同一条轨迹上竞争

重建给出了足球在哪里，动力学部分要回答它为什么沿这条路飞。统一方程写成

$$
m\dot{\mathbf v}=m\mathbf g+\mathbf F_D+\mathbf F_M+\mathbf F_K.
$$

标准比赛用球质量取 $m=0.43\ \mathrm{kg}$，空气密度取 $\rho=1.225\ \mathrm{kg/m^3}$，迎风面积约为 $A=0.038\ \mathrm{m^2}$。空气阻力写成

$$
\mathbf F_D=-\frac{1}{2}\rho C_D(v)A\lVert\mathbf v\rVert\mathbf v.
$$

三种候选踢法的差别集中在横向力和阻力系数上。

1. 香蕉球模型采用常阻力与稳定 Magnus 力。旋转轴方向保持稳定时，横向升力近似为

   $$
   \mathbf F_M=\frac{1}{2}\rho A C_L(S)v^2
   (\hat{\boldsymbol\omega}\times\hat{\mathbf v}),
   \qquad S=\frac{\omega R}{v}.
   $$

   参数反演时，论文用等效常向量 $\mathbf M$ 表示这一项，令 $\mathbf a_M=\lVert\mathbf v\rVert(\mathbf M\times\mathbf v)$。

2. 电梯球与低旋转飘球模型加入周期性的侧向气动力：

   $$
   \mathbf F_K=\frac{1}{2}\rho C_KAv^2
   \left[
   \sin(2\pi ft+\phi)\mathbf e_1+
   \cos(2\pi ft+\phi)\mathbf e_2
   \right],
   $$

   其中 $\mathbf e_1$、$\mathbf e_2$ 都垂直于速度方向。

3. 下坠型电梯球模型把阻力突变写进速度相关系数：

   $$
   C_D(v)=C_{D,\mathrm{low}}+
   \frac{C_{D,\mathrm{high}}-C_{D,\mathrm{low}}}
   {1+\exp[\kappa(v-v_c)]}.
   $$

在拟合之前，三维位置序列用窗口长度 9、三阶多项式的 Savitzky–Golay 方法求速度与加速度。扣除重力后，再把气动加速度分成沿速度方向和平行于法平面的两部分。横向加速度方向角的标准差为 $19.624^\circ$，频谱主峰为 $0.862\ \mathrm{Hz}$，整段数据中侧向加速度没有换号。这几个量共同指向稳定的单侧弯曲。

<figure>
  <img src="/images/projects/huashu-cup-a-2026/lateral-aerodynamic-features-fig12-13.webp" alt="侧向气动力方向与模长的时间变化以及侧向加速度频谱" width="1420" height="506" loading="lazy" decoding="async" />
  <figcaption>图 5　侧向气动力方向、模长与去均值侧向加速度的频谱。方向没有频繁反转，频谱也未呈现持续左右摆动。</figcaption>
</figure>

三套方程都采用四阶 Runge–Kutta 积分，并在同一组轨迹点上做最小二乘拟合。RMSE 衡量位置误差，AIC 与 BIC 同时惩罚参数数量。

| 候选模型 | 主要机制 | RMSE / m | AIC | BIC |
| --- | --- | ---: | ---: | ---: |
| A | 常阻力 + 稳定 Magnus 力 | **0.369** | **-261.216** | **-251.352** |
| B | 常阻力 + 周期侧向力 | 0.393 | -250.249 | -240.385 |
| C | 速度相关阻力 | 2.668 | 83.161 | 93.025 |

<figure>
  <img src="/images/projects/huashu-cup-a-2026/vertical-residuals-fig14.webp" alt="三类候选飞行动力学模型的垂直位置残差曲线" width="1116" height="614" loading="lazy" decoding="async" />
  <figcaption>图 6　三类候选模型的垂直位置残差。模型 C 在飞行后段出现明显的系统偏差。</figcaption>
</figure>

模型 B 拟合出的振荡频率约为 $1.73\ \mathrm{Hz}$，轨迹数据却没有对应的左右摆动。模型 C 的位置误差明显增大，垂直残差也没有集中在飞行末段。模型 A 在三项指标上都占优，与横向力方向稳定的特征相符。因此，这记任意球被归为 Magnus 力主导的香蕉球。

这里有一个很实用的建模习惯：候选机制先共享同一套初值、数据与误差定义，再讨论谁解释得更好。否则，模型之间的差距很容易被不同的预处理或参数数量掩盖。

## 把八百条威胁轨迹交给同一套防线

第三问把动力学模型变成射门生成器。起点取实测位置

$$
\mathbf r_0=(-4.349,22.927,0.078)\ \mathrm{m},
$$

初速度仍为前文估计的 $\mathbf v_0$。每次模拟对速度大小施加 $\pm25\%$ 扰动，对发射方向施加 $1^\circ\text{--}3^\circ$ 扰动，并随机改变三类动力学模型的参数。随后用拒绝采样筛掉没有进入球门范围的轨迹，只在真正构成威胁的射门集合中评价防线。最终用于搜索的是 $N=800$ 条威胁轨迹；原始随机射门成为威胁射门的比例约为 $P(\mathrm{threat})=0.296$。

<figure>
  <img src="/images/projects/huashu-cup-a-2026/defense-ensemble.webp" alt="最优防守布置下的八百条威胁任意球轨迹集合" width="1620" height="670" loading="lazy" decoding="async" />
  <figcaption>图 7　最优防守布置下的模拟轨迹。红线被人墙挡下，黄线可由门将扑救，绿线进入球门。</figcaption>
</figure>

人墙放在距球 $9.15\ \mathrm{m}$ 的平面上，宽度设为 $3.3\ \mathrm{m}$，有效高度设为 $1.85\ \mathrm{m}$。轨迹与人墙平面相交后，交点落在矩形内部便记为封堵。

门将中心高度取 $z_{GK}=1.05\ \mathrm{m}$，反应延迟 $\tau=0.25\ \mathrm{s}$，侧移速度 $u_{\mathrm{side}}=1.4\ \mathrm{m/s}$，扑救动作额外提供 $d_{\mathrm{dive}}=0.2\ \mathrm{m}$ 的覆盖。足球到达门将所在平面的时刻为 $t_g$，可达半径为

$$
R(t_g)=u_{\mathrm{side}}\max(0,t_g-\tau)+d_{\mathrm{dive}}.
$$

球与门将平面的交点距门将中心不超过 $R(t_g)$ 时，该球记为可扑救。

### 搜索三个能在场上执行的位置量

决策变量只有三个：人墙中心的横向坐标 $x_w$、门将的横向坐标 $x_k$、门将向场内移动的距离 $y_k$。单独最小化进球率时，人墙可能追着少数交点跑到很极端的位置。我们给人墙中心到威胁轨迹交点的平均横向距离加上轻微惩罚：

$$
J=P(\mathrm{goal}\mid\mathrm{threat})+
\lambda\,\operatorname{mean}\left(|x_{\mathrm{wall,hit}}-x_w|\right),
\qquad \lambda=0.01.
$$

网格搜索范围为

$$
x_w\in[-5,5],\qquad
x_k\in[-3,3],\qquad
y_k\in[0,1.5]\quad(\mathrm{m}),
$$

三个方向的步长均为 $0.05\ \mathrm{m}$。最优结果是

| 决策或结果 | 数值 |
| --- | ---: |
| 人墙中心 $x_w^*$ | $-3.60\ \mathrm{m}$ |
| 门将横向位置 $x_k^*$ | $-2.45\ \mathrm{m}$ |
| 门将前移距离 $y_k^*$ | $0.00\ \mathrm{m}$ |
| 人墙封堵率 | $70.00\%$ |
| 门将扑救率 | $13.13\%$ |
| 条件进球率 | $16.88\%$ |

<figure>
  <img src="/images/projects/huashu-cup-a-2026/defense-results.webp" alt="最优防守参数、结果分解和门将前移后的策略变化" width="1660" height="1000" loading="lazy" decoding="async" />
  <figcaption>图 8　最优站位、封堵与扑救结果，以及门将前移时目标函数和最佳横向站位的变化。</figcaption>
</figure>

条件进球率只计算已经飞向门框范围的样本。把威胁射门的先验比例乘回去，可得全部随机射门下的进球概率：

$$
P(\mathrm{goal})=P(\mathrm{threat})
P(\mathrm{goal}\mid\mathrm{threat})
\approx0.296\times0.1688\approx0.0500.
$$

敏感性分析还显示，$y_k$ 从球门线向前增加时，足球更早到达门将平面，可用于侧移的时间随之减少。当前参数设定下，门将留在球门线上的结果最好。

<figure>
  <img src="/images/projects/huashu-cup-a-2026/goalkeeper-forward-sensitivity-fig19.webp" alt="门将前移距离与最优条件进球率的关系曲线" width="1460" height="620" loading="lazy" decoding="async" />
  <figcaption>图 9　门将前移敏感性。按这组反应延迟和侧移速度，前移距离从 0 增至 1.5 m 时，最优条件进球率由约 0.169 升至约 0.212。</figcaption>
</figure>

## 局限，以及这次建模留下的经验

这套结果高度依赖视频测量。足球中心和参考点由人工逐帧标注，相机 2 的标定误差也明显高于相机 1。更多机位、自动跟踪和带不确定度的三角测量，都能让深度坐标更稳定。

论文没有从画面中直接测量转速与旋转轴。Magnus 项通过等效向量反演，能够解释已观测轨迹，却难以把升力系数对应到具体踢球动作。若能从球面纹理估计自转，三类模型的参数会受到更清楚的物理约束。

防守模型同样做了多项简化：门将可以正确预判轨迹，反应延迟与侧移速度固定；人墙被视为跳起的矩形平面；贴地球、穿裆、风、球员遮挡和假动作没有进入模拟。因此，$16.88\%$ 与 $5.00\%$ 都属于这组假设和扰动范围下的模型结果，适合比较布置方案，不能直接当作真实比赛的稳定命中率。

回看整个过程，我更愿意保留四条具体经验：

- 先校准时间，再谈三维坐标。高速运动里，分数帧偏移也会改变深度与初速度。
- 让候选模型共享数据、积分器和损失函数，并用 AIC、BIC 检查复杂模型是否真的带来足够收益。
- 条件概率要和先验概率一起报告。威胁射门中的进球率与全部尝试中的进球率回答的是两个问题。
- 优化变量应当对应场上能执行的动作。人墙横移、门将横移和门将前移都能直接换算成站位。

从一段电视转播里取出这条轨迹，需要处理镜头运动、分数帧同步、三角测量、数值微分和空气动力学。等到这些环节逐一闭合，最后那三个站位坐标才有了可追溯的来路。
