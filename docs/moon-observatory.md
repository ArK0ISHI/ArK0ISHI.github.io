# 月之暗面

点击页脚月亮 39 次后解锁，并在桌面与手机导航中显示直达 `/moon/workbench/` 的入口。第 1–13 次保持静默，不显示提示、不播放反馈动效，也不播报计数；第 14 次开始回应，第 26 次进入第二阶段，第 39 次显示欢迎提示。欢迎提示出现后会防止连续点击穿透，只有明确的按钮操作或 Escape 才会关闭，点击背景不会关闭。键盘操作仍保留焦点轮廓。

计数保存在当前浏览会话，解锁保存在同一浏览器；无法使用存储时退回内存状态。清除网站数据或换浏览器后需要重新发现。月面概览底部、完整工作台右上角的「更多」中可以重新隐藏入口。隐藏、noindex 和索引排除只负责发现体验，不提供数据访问保护。

## 当前发布范围

2026 年 9 月 16 日，用户已明确授权直接公开完整姓名、学号和逐人记录，并确认完整工作台无需导入文件即可使用。这一决定取代先前仅发布汇总、完整明细依赖本机导入的方案。

`/moon/workbench/` 是解锁后的主要入口，自动载入全部完整数据，默认显示姓名和学号。工作台保留原件的全部分析模块，涵盖总绩点、学期趋势与变化、逐人轨迹、学院与专业比较、完整课程、核心课程、学生明细及最新保研分析，以及原有筛选、计算和导出。各模块仍可使用身份遮蔽选项控制当前视图；这不会从公开数据中移除记录。

`/moon/` 保留群体汇总观察及月面视觉，提供醒目的完整工作台入口。两个页面展示的是同一原件的不同观察层次，均可在解锁后访问。

## 工作台布局

2026 年 9 月 17 日，完整工作台改为独立的全窗布局：52 px 操作栏保留头像、主页、全屏和更多操作，其余高度全部交给分析界面。此路由使用 `WorkbenchLayout.astro`，不加载普通页面的大页头、页脚及音乐浮层。外层不滚动，分析内容使用单一纵向滚动区域，宽表格保持自身横向滚动。

桌面侧栏提供十一项分析目录；宽屏五项指标同排，平板三列，手机两列加一条横向指标。手机目录可展开全部视图，全局筛选默认收起并展示当前范围；切换视图、点击图表、清空筛选时保持同步。键盘移出目录自动收起，跨越响应式断点时保留可见焦点。

全屏包含顶部操作栏，始终可退出。更多菜单提供重置筛选与视图、月面概览和重新隐藏入口。首次进入仍使用同一枚月亮解锁；欢迎弹窗、前十三次无反馈和连续点击保护沿用原逻辑。重置、刷新、站内跳转及重新隐藏时清理运行中的分析界面。

本次只改布局及界面交互，五份数据、原版十一模块、计算方法与导出保持原状。

## 数据更新

原始成绩 HTML 保留在网站目录之外，作为生成器的本地输入；无需把整个原件复制进网站。更新完整工作台：

```sh
node scripts/build-moon-workbench.mjs /absolute/source.html
node scripts/build-moon-workbench.mjs /absolute/source.html --check
node scripts/build-moon-workbench-data.mjs /absolute/source.html
node scripts/build-moon-workbench-data.mjs /absolute/source.html --check
```

两个生成器分别维护 `src/data/moon-workbench-template.html` 与 `src/data/moon-workbench.json`。模板保留可信原件的界面、执行脚本、本地 ECharts 及其 Apache 许可，各数据区块的位置仍为占位符。完整数据独立写入 JSON，包括原件新增的保研分析数据；浏览器自动载入后将两者组合为工作台。模板不内嵌数据，不代表完整数据未发布。数据生成器会逐块核对与原件的深度相等性，不删减记录或字段。

工作台继续在不允许同源访问的 sandbox iframe 中运行。父页面加载站内数据并构造工作台，iframe 的内容安全策略禁止网络连接和外部资源；其下载功能用于把用户选择的图表和表格保存到自己的设备。

更新群体汇总：

```sh
node scripts/build-moon-observatory.mjs /absolute/source.html
node scripts/build-moon-observatory.mjs /absolute/source.html --check
```

汇总生成器只写 `src/data/moon-observatory.json`，以明确字段列表构造统计。至少 10 人的统计组才展示；课程门槛按有数值成绩的不同学生计算；分布小区间合并。这些规则仅属于汇总页面，不限制完整工作台中的逐人记录。汇总图表和 CSV 都来自这一份汇总。

更新后应核对两份数据的日期、统计口径、计数守恒与课程样本说明，再检查全部工作台模块、筛选、导出和窄屏布局。课程样本为应用物理和光电各前 20 名资料，存在选择偏差，不能代表专业总体。原始离线分析文件不受网站改版影响。

## 主要文件

- `src/components/MoonGate.astro`、`src/scripts/moon-gate.ts`、`src/lib/moon-gate.ts`：发现、状态及欢迎提示。
- `src/pages/moon/index.astro`、`src/scripts/moon-observatory.ts`：汇总观察、筛选、表格与导出。
- `src/lib/moon-charts.ts`：汇总页面的本地 Canvas 图表，无远程绘图库。
- `src/styles/moon-gate.css`、`src/styles/moon-observatory.css`：入口与汇总页面样式。
- `src/layouts/WorkbenchLayout.astro`、`src/pages/moon/workbench/index.astro`：完整工作台的独立全窗布局。
- `src/scripts/moon-workbench.ts`：自动加载、全屏、菜单与生命周期。
- `src/scripts/moon-workbench-frame.js`：原版界面的响应式目录、筛选摘要及键盘焦点增强。
- `src/lib/moon-workbench.ts`：完整数据结构与校验。
- `src/data/moon-workbench-template.html`、`src/data/moon-workbench.json`：由生成器维护的工作台模板和完整数据。
- `src/styles/moon-workbench.css`、`src/styles/moon-workbench-frame.css`：全窗容器和工作台内部的响应式暗色适配。

状态事件为 `ar:moon-state`，携带 `{ count, unlocked }`；事件和观察器在 Astro 页面切换时清理。解锁不会改变用户保存的全站主题。

月面影像来源：[NASA Lunar Far Side](https://science.nasa.gov/resource/lunar-far-side-2/)，署名 NASA / Goddard Space Flight Center / Arizona State University。图片尺寸优化，保留原始月面内容。
