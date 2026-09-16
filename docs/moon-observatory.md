# 月之暗面

点击页脚月亮 39 次后解锁 `/moon/`，并在桌面与手机导航中显示入口。第 1–13 次不显示提示、不播放反馈动效，也不播报计数；第 14 次开始回应，第 26 次进入第二阶段，第 39 次显示欢迎提示。键盘操作仍保留焦点轮廓。计数保存在当前浏览会话，解锁保存在同一浏览器；无法使用存储时退回内存状态。清除网站数据或换浏览器后需要重新发现。

页面底部可以重新隐藏入口。隐藏、noindex 和索引排除只负责发现体验，不提供数据访问保护。

## 数据更新

原始成绩 HTML 必须保留在网站目录之外，不得复制到 public、src、Git 或发布产物中。使用本地文件生成允许公开的统计：

```sh
node scripts/build-moon-observatory.mjs /absolute/private-source.html
node scripts/build-moon-observatory.mjs /absolute/private-source.html --check
```

生成器只写 `src/data/moon-observatory.json`，以明确字段列表构造汇总。至少 10 人的统计组才公开；课程门槛按有数值成绩的不同学生计算；分布小区间合并。身份、逐人记录及私有路径检查失败时会停止。更新后应检查日期、统计口径、计数守恒与课程样本说明，再构建和检查网页。

公开图表和 CSV 都来自这一份汇总。课程样本为应用物理和光电各前 20 名资料，存在选择偏差，不能代表专业总体。完整离线分析原件不受网站改版影响。

## 完整工作台与本机导入

解锁后从月之暗面进入 `/moon/workbench/`，选择本机的原始「四年级绩点可视化.html」。工作台保留十个模块：总绩点全景、学期趋势、学期变化、学生轨迹、学院分析、专业对比、全部课程、核心十课、学生明细、数据与口径，以及原有筛选、计算和导出。

线上只发布界面、计算代码与许可公开的汇总。导入器只提取原文件中的四段 JSON，校验后放入工作台，不执行所选 HTML 的脚本、样式或图片。数据只保存在当前标签页的内存中，同一标签页内的 Astro 站内导航可以继续使用；刷新、关闭、清除数据或重新隐藏入口后需重新导入。姓名和学号默认遮蔽，可在对应模块内取消勾选。用户主动导出的文件保存在自己的设备上。

工作台在不允许同源访问的 sandbox iframe 中运行，内容安全策略禁止网络连接和外部资源；公开模板包含本地 ECharts 及其 Apache 许可。模板由可信的本地原件生成，四段数据全部替换为占位符，六段原始执行脚本保持原样：

```sh
node scripts/build-moon-workbench.mjs /absolute/private-source.html
node scripts/build-moon-workbench.mjs /absolute/private-source.html --check
```

更新原件时同时检查模板生成器、导入数据结构和十个模块。模板检查会核对全部数据区块、脚本数量、导航以及源数据中的姓名、标识符、私人文件名和路径，失败时不输出匹配的私人值。

## 主要文件

- `src/components/MoonGate.astro`、`src/scripts/moon-gate.ts`、`src/lib/moon-gate.ts`：发现、状态及欢迎提示。
- `src/pages/moon/index.astro`、`src/scripts/moon-observatory.ts`：观察室、筛选、表格与导出。
- `src/lib/moon-charts.ts`：本地 Canvas 图表，无远程绘图库。
- `src/styles/moon-gate.css`、`src/styles/moon-observatory.css`：入口与页面样式。
- `src/pages/moon/workbench/index.astro`、`src/scripts/moon-workbench.ts`：本机导入、完整工作台与生命周期。
- `src/lib/moon-workbench.ts`：四段 JSON 的提取、校验与内存会话。
- `src/data/moon-workbench-template.html`：已移除数据的原始工作台模板；由生成器维护。
- `src/styles/moon-workbench.css`、`src/styles/moon-workbench-frame.css`：主页容器和工作台内部的暗色适配。

状态事件为 `ar:moon-state`，携带 `{ count, unlocked }`；事件和观察器在 Astro 页面切换时清理。解锁不会改变用户保存的全站主题。

月面影像来源：[NASA Lunar Far Side](https://science.nasa.gov/resource/lunar-far-side-2/)，署名 NASA / Goddard Space Flight Center / Arizona State University。图片尺寸优化，保留原始月面内容。
