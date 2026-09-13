---
title: '从全轨道到损失锥：双线圈磁镜场中的粒子运动'
description: '用 Biot–Savart 磁场、Boris 推进器和多组参数扫描，观察磁矩绝热性何时减弱，以及粒子怎样进入损失锥。'
date: 2026-06-16
updated: 2026-08-24
tags: ['计算物理', '磁镜场', 'Boris算法', '绝热不变量']
category: '计算物理'
kind: 'note'
featured: true
authorLabel: '课程档案 II'
scopeNote: '本文依据 2026 年 6 月 16 日完成的 v12 期末报告整理。公开版保留模型、主要图件与数值结论，省略封面、完整程序、原始数据和个人信息。'
---

两只同轴线圈相对放置，轴向磁场在中间较弱、靠近线圈处较强。带电粒子沿磁力线前进时，回旋速度与平行速度会交换；俯仰角足够大时，它会在强场区反射，随后回到另一侧。这就是双线圈磁镜最直观的图景。

期末作业从三维 Biot–Savart 场出发，用 Boris 方法逐步推进粒子的完整回旋轨道。报告关注的量是

$$
\epsilon=\frac{r_L}{R_c},
$$

即拉莫尔半径与线圈半径之比。$\epsilon$ 很小时，粒子在一次回旋中感受到的磁场变化有限，磁矩近似守恒；当两个尺度逐渐接近，绝热近似开始松动，反弹点、损失锥与回旋相位都会变得敏感。

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/summary.webp" alt="双线圈磁镜场课程项目的场线、粒子轨道、磁矩扫描和动力学诊断总览" width="2000" height="1915" loading="eager" decoding="async" />
  <figcaption>图 1　期末报告的计算总览：从磁场网格与全轨道推进，走到绝热性、损失锥和轨道动力学诊断。</figcaption>
</figure>

## v12 是最终报告

期末目录里保留了 v6 到 v12 的多轮迭代。最终稿是 2026 年 6 月 16 日 22:03 编译完成的 v12：81 页 PDF、同批次 TeX、MATLAB 主程序、结果数据与图件齐全。根目录那份 38 页同名 PDF 生成得更早，正文和诊断内容都少于 v12。

最终代码在几个打包目录中各有副本。执行部分完全一致，差异只出现在注释字符。结果 MAT 文件的哈希也一致，说明网页所用的图与 v12 报告属于同一轮计算。

## 磁镜的尺度与坐标

计算采用无量纲单位：长度以线圈半径 $R_c$ 为单位，磁场以中心处场强 $B_e=|\mathbf B(0)|$ 为单位，时间以中心回旋频率的倒数 $\Omega_0^{-1}$ 为单位。两只线圈位于

$$
z=\pm1.30R_c,
$$

线圈间距为 $2.6R_c$。三维磁场仍由 Biot–Savart 积分得到，并预先计算在 $57\times57\times83$ 的规则网格上。粒子推进时用三线性插值读取当前位置的 $\mathbf B$。

| 计算参数 | 取值 |
| --- | ---: |
| 圆周电流元数 | 360 |
| 磁场网格 | $57\times57\times83$ |
| 线圈正则化长度 | $0.025R_c$ |
| 时间步长 | $0.025\Omega_0^{-1}$ |
| 中心回旋周期内步数 | 约 251 |
| 镜比 $R_m=B_{\max}/B_{\min}$ | 2.308 |
| 赤道损失锥角 | $41.17^\circ$ |

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/field-lines.webp" alt="双线圈磁镜场在轴对称截面上的磁场强度和磁力线" width="1775" height="2000" loading="lazy" decoding="async" />
  <figcaption>图 2　双线圈磁镜场的截面结构。中心弱场区连接两侧强场区，磁力线在靠近线圈时收束。</figcaption>
</figure>

镜比给出赤道损失锥的理论边界：

$$
\sin^2\alpha_{\mathrm{LC}}=\frac{B_{\min}}{B_{\max}}
=\frac{1}{R_m}.
$$

代入 $R_m=2.308$，得到 $\alpha_{\mathrm{LC}}=41.17^\circ$。初始俯仰角高于这条边界的粒子通常能够反射；贴近边界时，有限回旋半径和回旋相位会改变实际结果。

## Boris 推进器保存了什么

静磁场中的洛伦兹方程为

$$
\frac{\mathrm d\mathbf r}{\mathrm dt}=\mathbf v,
\qquad
\frac{\mathrm d\mathbf v}{\mathrm dt}=\frac{q}{m}\mathbf v\times\mathbf B(\mathbf r).
$$

Boris 方法把一步更新拆成位置推进和速度旋转。没有电场时，速度旋转保持 $|\mathbf v|$，很适合长时间跟踪回旋运动。主扫描中的相对能量漂移约为 $10^{-14}$，数值积分没有把明显的能量误差伪装成物理变化。

这仍只是一个必要检查。磁矩变化还会受到磁场插值、空间网格和有限回旋半径影响，因此报告另外比较了时间步长、网格、正则化与不同 $\epsilon$。

## 三条代表轨道

主扫描固定初始俯仰角 $\alpha_0=50^\circ$，从 $\epsilon=0.03$ 扫到 $0.42$。图 3 选取 $0.05$、$0.18$ 与 $0.32$ 三个尺度，展示三维轨道和投影。

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/particle-orbits.webp" alt="三种拉莫尔半径尺度下粒子在双线圈磁镜场中的三维轨道和二维投影" width="2000" height="732" loading="lazy" decoding="async" />
  <figcaption>

图 3　三种 $\epsilon$ 的代表轨道。回旋半径变大后，反弹区的轨迹包络和漂移开始出现可见差异。

  </figcaption>
</figure>

小 $\epsilon$ 轨道紧贴导引中心，反弹位置稳定。$\epsilon$ 增大后，单次回旋跨越的磁场范围变宽，粒子在强梯度区感受到的变化也更剧烈。

## 磁矩怎样离开常数

非相对论磁矩写作

$$
\mu=\frac{m v_\perp^2}{2B}.
$$

报告以初值 $\mu_0$ 归一化，并在一次反弹窗口内记录

$$
\frac{\Delta\mu}{\mu_0}
=\frac{\mu_{\max}-\mu_{\min}}{\mu_0}.
$$

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/magnetic-moment-history.webp" alt="不同 epsilon 条件下磁矩、轴向位置和局部磁场随时间的变化" width="2000" height="1291" loading="lazy" decoding="async" />
  <figcaption>

图 4　代表轨道的磁矩历史。$\epsilon$ 较小时曲线只轻微起伏，尺度增大后反弹附近的变化迅速增强。

  </figcaption>
</figure>

在主扫描中，单反弹磁矩变化从

$$
8.82\times10^{-4}\quad(\epsilon=0.03)
$$

增长到约

$$
0.610\quad(\epsilon=0.42).
$$

中小 $\epsilon$ 区间的幂律拟合约为

$$
\frac{\Delta\mu}{\mu_0}\propto\epsilon^{1.57}.
$$

大 $\epsilon$ 区域出现非单调变化，单一幂律已无法概括整段扫描。这里保留原始散点与每个轨道的状态标记，比延长一条拟合直线更诚实。

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/magnetic-moment-scaling.webp" alt="磁矩相对变化随 epsilon 的扫描结果及中小 epsilon 区间拟合" width="2000" height="1614" loading="lazy" decoding="async" />
  <figcaption>

图 5　磁矩绝热性随 $\epsilon$ 的变化。拟合只覆盖中小尺度区间，大尺度散点保留其非单调特征。

  </figcaption>
</figure>

## 靠近损失锥时

第二组扫描把初始俯仰角放到 $41.2155^\circ$，距离理论损失锥边界只有约 $0.05^\circ$。此时，轨道结果对有限回旋半径格外敏感。

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/loss-cone-scan.webp" alt="近损失锥俯仰角下不同 epsilon 轨道的反射、命中和边界逃逸结果" width="2000" height="934" loading="lazy" decoding="async" />
  <figcaption>

图 6　近损失锥扫描。$\epsilon=0.32$ 与 $0.42$ 在第一反弹附近命中边界，$0.55$ 与 $0.70$ 从计算域边界离开。

  </figcaption>
</figure>

图中的空心点表示模拟时间窗内尚未完成某个事件，因此只能当作下界。它们没有给出真实逃逸时刻。这个标记能避免把有限观察时间造成的截断读成完整动力学结论。

## 回旋相位也会改变结局

导引中心理论通常平均掉快速回旋相位。有限 $\epsilon$ 条件下，粒子进入强场区时处于回旋圆的哪一侧，会改变瞬时位置与局部磁场，从而影响反弹和边界命中。

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/gyro-phase.webp" alt="不同初始回旋相位下反弹位置和磁矩变化的敏感性分析" width="2000" height="1340" loading="lazy" decoding="async" />
  <figcaption>

图 7　初始回旋相位扫描。相同 $\epsilon$ 与俯仰角下，反弹位置和磁矩变化仍有可见离散。

  </figcaption>
</figure>

这组结果说明，贴近损失锥时只给出 $\epsilon$ 和俯仰角还不够。相位分布也应进入统计，单条代表轨道很难覆盖全部可能性。

## Poincaré 截面与有限时间 Lyapunov 指标

报告在赤道附近记录轨道穿越，构造 Poincaré 截面，并对相邻初值计算有限时间 Lyapunov 指标。规则点列会形成窄曲线或有限厚度的带状结构；散点扩展和有限时间指数升高，则提示轨道对初值更敏感。

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/poincare.webp" alt="不同 epsilon 下粒子轨道的 Poincaré 截面对比" width="2000" height="618" loading="lazy" decoding="async" />
  <figcaption>

图 8　不同 $\epsilon$ 的 Poincaré 截面。点列从紧致结构逐渐变宽，显示轨道组织随尺度改变。

  </figcaption>
</figure>

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/lyapunov.webp" alt="不同参数下有限时间 Lyapunov 指标及其时间演化" width="2000" height="1476" loading="lazy" decoding="async" />
  <figcaption>图 9　有限时间 Lyapunov 诊断。它记录给定时间窗内的初值敏感性，用于和 Poincaré 截面相互参照。</figcaption>
</figure>

有限时间、有限分辨率与插值误差都会影响这两种诊断。网页把它们表述为混沌趋势的线索，没有把有限时间的正指数写成严格证明。

## 换算到地球磁层的量级

最后一部分把无量纲参数映射到地球磁层的典型尺度，估算不同能量与磁场强度下的拉莫尔半径和绝热参量。

<figure>
  <img src="/images/projects/magnetic-mirror-orbits/earth-scale.webp" alt="地球磁层典型磁场和粒子能量下拉莫尔半径与绝热参量的量级估算" width="2000" height="1484" loading="lazy" decoding="async" />
  <figcaption>图 10　地球磁层尺度的量级换算。图中结果用于比较参数区间，不代表一次具体空间任务的实测。</figcaption>
</figure>

这一步的价值在于把 $\epsilon$ 从抽象扫描量还原为长度比。磁场减弱、粒子能量升高或系统特征尺度缩小时，拉莫尔半径相对变大，绝热近似更容易失效。

## 误差边界与下一步

磁场来自正则化线圈模型，并通过规则网格插值。无散度诊断在掩膜后的主要区域中位数约为 $3.20\times10^{-3}$，95% 分位数为 $4.74\times10^{-2}$；少量位置的最大值达到 $0.880$。这些数值提醒我，强梯度区的插值质量仍需改善。

粒子模型只包含静磁场，没有加入电场、碰撞、波粒相互作用与场的时间变化。损失锥扫描受计算域和观察时间限制，地磁部分也只是量级外推。若继续做，可以从三条路线推进：在强梯度区加密网格，用散度约束插值替代普通三线性插值，并对回旋相位和初始位置做更完整的统计。

现有结果数据没有保存三维轨迹和 Poincaré 点列本身，因此网页先保留最终报告图。以后若要做可旋转、可切换 $\epsilon$ 的轨迹观察器，需要重新运行 MATLAB，把经过抽稀的轨迹导出为 JSON，再由浏览器读取。这样得到的交互图才会和最终数值计算逐点一致。

[回到课程档案 I：PF2 线圈的一厘米位移 →](/blog/coil-n1-error-field/)
