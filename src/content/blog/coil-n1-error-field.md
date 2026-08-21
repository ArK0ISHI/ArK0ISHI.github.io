---
title: '线圈平移为什么产生 n = 1 误差场'
description: '从对称性破缺与傅里叶分解理解线圈刚性位移产生的一阶环向模态。'
date: 2026-07-11
tags: ['误差场', '傅里叶分解', 'Biot–Savart']
category: '计算物理'
kind: 'note'
featured: true
---

轴对称线圈的理想磁场与环向角 $\phi$ 无关，因此在柱坐标傅里叶分解中只含 $n=0$ 模态。当线圈整体沿水平方向发生小位移，这种轴对称性被破坏。为什么首先出现的通常是 $n=1$，可以从一个一阶展开看出来。

## 位移等价于坐标扰动

设理想场中某个标量分量写作 $B_0(R,Z)$。线圈沿 $x$ 方向平移 $\delta$ 后，在固定观测点 $(R,\phi,Z)$ 看到的相对径向坐标发生变化。对小位移做一阶展开，可写成

$$
B(R,\phi,Z) \approx B_0(R,Z)
- \delta\cos\phi\,\frac{\partial B_0}{\partial R}.
$$

因此误差项具有显式的 $\cos\phi$ 依赖。它正是环向模数 $n=1$ 的余弦分量。如果位移沿 $y$ 方向，则对应 $\sin\phi$ 分量；任意水平位移只是二者的线性组合。

## 傅里叶分解看到什么

对某一半径与高度处的误差场 $\Delta B(\phi)$，定义

$$
a_n = \frac{1}{\pi}\int_0^{2\pi}\Delta B(\phi)\cos(n\phi)\,\mathrm d\phi,
$$

$$
b_n = \frac{1}{\pi}\int_0^{2\pi}\Delta B(\phi)\sin(n\phi)\,\mathrm d\phi.
$$

若位移足够小，一阶项占主导，$\sqrt{a_1^2+b_1^2}$ 会明显高于其他非轴对称模态。随着位移增大，高阶展开会逐渐引入 $n=0$、$n=2$ 等成分。

## 数值计算中的三个检查

### 1. 零位移基线

先计算未位移线圈与理论轴对称结果的差异。如果离散积分本身已经产生明显的 $n=1$，后续误差场就会混入网格或线元划分的不对称。

### 2. 线性标度

在小位移区间内，$n=1$ 幅值应近似正比于 $\delta$：

$$
A_1(2\delta) \approx 2A_1(\delta).
$$

这比单独观察一幅云图更能验证模型是否正确。

### 3. 相位方向

位移方向改变时，$a_1$ 与 $b_1$ 的组合应随之旋转。幅值保持一致而相位改变，是圆形线圈水平刚性平移应有的几何结果。

```python
import numpy as np

def toroidal_modes(phi, signal, n_max=6):
    modes = []
    for n in range(n_max + 1):
        a = np.trapezoid(signal * np.cos(n * phi), phi) / np.pi
        b = np.trapezoid(signal * np.sin(n * phi), phi) / np.pi
        modes.append({"n": n, "amplitude": np.hypot(a, b)})
    return modes
```

## 对称性是最短的解释

“平移产生 $n=1$”并不只是数值结果。它来自平移对轴对称性的最低阶破坏：位移是平面内的向量，而 $n=1$ 恰好携带一个方向。傅里叶分解所做的，是把这个几何事实从三维场数据中重新辨认出来。
