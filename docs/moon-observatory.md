# 月之暗面

访问页脚月亮 39 次后解锁 `/moon/`，并在桌面与手机导航中显示入口。计数保存在当前浏览会话，解锁保存在同一浏览器；无法使用存储时退回内存状态。清除网站数据或换浏览器后需要重新发现。

页面底部可以重新隐藏入口。隐藏、noindex 和索引排除只负责发现体验，不提供数据访问保护。

## 数据更新

原始成绩 HTML 必须保留在网站目录之外，不得复制到 public、src、Git 或发布产物中。使用本地文件生成允许公开的统计：

```sh
node scripts/build-moon-observatory.mjs /absolute/private-source.html
node scripts/build-moon-observatory.mjs /absolute/private-source.html --check
```

生成器只写 `src/data/moon-observatory.json`，以明确字段列表构造汇总。至少 10 人的统计组才公开；课程门槛按有数值成绩的不同学生计算；分布小区间合并。身份、逐人记录及私有路径检查失败时会停止。更新后应检查日期、统计口径、计数守恒与课程样本说明，再构建和检查网页。

公开图表和 CSV 都来自这一份汇总。课程样本为应用物理和光电各前 20 名资料，存在选择偏差，不能代表专业总体。完整离线分析原件不受网站改版影响。

## 主要文件

- `src/components/MoonGate.astro`、`src/scripts/moon-gate.ts`、`src/lib/moon-gate.ts`：发现、状态及欢迎提示。
- `src/pages/moon/index.astro`、`src/scripts/moon-observatory.ts`：观察室、筛选、表格与导出。
- `src/lib/moon-charts.ts`：本地 Canvas 图表，无远程绘图库。
- `src/styles/moon-gate.css`、`src/styles/moon-observatory.css`：入口与页面样式。

状态事件为 `ar:moon-state`，携带 `{ count, unlocked }`；事件和观察器在 Astro 页面切换时清理。解锁不会改变用户保存的全站主题。

月面影像来源：[NASA Lunar Far Side](https://science.nasa.gov/resource/lunar-far-side-2/)，署名 NASA / Goddard Space Flight Center / Arizona State University。图片尺寸优化，保留原始月面内容。
