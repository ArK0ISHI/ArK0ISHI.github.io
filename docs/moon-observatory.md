# 月之暗面：私有数据与发现入口

## 访问方式

2026-09-18，用户决定保留公开主页和彩蛋，把月之暗面的明细和汇总数据移出公开 GitHub 仓库及静态发布文件。此前直接发布完整 JSON 的方案已被替代。

入口仍需点击 39 次，前 13 次无视觉反馈。浏览器按点击进度与私有服务交换签名进度凭证；只有第 39 步返回访问凭证后，才显示欢迎提示和菜单入口。快速连续点击不会误关欢迎窗口。旧版仅存在浏览器里的“已解锁”标记不能取数据；迁移后需要重新发现一次。

进度凭证有效 30 分钟，访问凭证有效 15 分钟，记忆凭证有效 30 天。记忆有效期内可自动续取短期访问凭证。重新隐藏入口会清除本机凭证、停止正在进行的请求并清空工作台。它不撤销别人已经保存的数据或复制走的有效凭证。

这仍是开放给所有访客的发现机制，**不是身份认证**：程序可以模拟完整解锁流程。只有用户另行要求指定人员访问时，才加入服务端核验的登录或邀请机制。

## 数据与部署

- 主页继续由 GitHub Pages 发布，地址和完整工作台布局不变。
- `services/moon-data/` 是 Cloudflare Worker；私有 KV 绑定 `MOON_DATA`，不设公开文件地址。
- `workbench-v1` 保存原件的五个完整数据区块；`overview-v1` 保存汇总。两者只通过校验短期凭证的接口返回。
- `TOKEN_SECRET` 只作为 Worker secret 保存，不进入 Git、网页或 Actions 普通变量。
- GitHub Actions 变量 `MOON_API_URL` 仅保存公开的服务地址，构建时映射为 `PUBLIC_MOON_API_URL`。它不是密钥。
- 未配置服务地址、服务异常或凭证失效时均不回退到公开数据。
- 所有数据与凭证响应禁止浏览器及 CDN 缓存；关闭 Worker 请求日志与预览部署地址。

完整数据和汇总的本机备份位于网站仓库外的 `../moon-private/`。部署工具、秘密文件和历史备份也只能保存在仓库外或明确忽略的秘密路径中。

## 数据更新

```sh
node scripts/build-moon-workbench.mjs /absolute/source.html
node scripts/build-moon-workbench-data.mjs /absolute/source.html
node scripts/build-moon-observatory.mjs /absolute/source.html
```

模板生成器只维护可信、无数据的界面模板。两个数据生成器默认分别输出到仓库外的 `../moon-private/workbench-v1.json` 与 `../moon-private/overview-v1.json`；拒绝把数据写入网站仓库。随后通过已登录的 Cloudflare 管理工具更新对应私有 KV 键。访问端的明细、筛选、计算及导出功能保持原版；课程样本仍存在选择偏差，不能代表专业总体。

`pnpm build` 在生成后执行公开产物检查，拒绝包含完整数据或私有部署文件的结果。`pnpm test:moon-access` 检查凭证、防伪造、过期、请求来源与数据接口。检查只使用合成测试数据。

## 布局与文件

- `WorkbenchLayout.astro`：全窗工作台，52 px 操作栏，桌面侧栏与手机展开目录。
- `src/lib/moon-access.ts`：串行进度凭证、短期访问、记忆续期与请求取消。
- `src/lib/moon-gate.ts`、`src/scripts/moon-gate.ts`：发现状态和欢迎提示。
- `src/scripts/moon-workbench.ts`：按需取私有明细并在隔离 iframe 中呈现。
- `src/scripts/moon-observatory.ts`：按需取私有汇总。
- `src/lib/moon-observatory-data.ts`：结构类型，不含统计数值。
- `services/moon-data/`：数据服务与合成测试，见该目录 README。

## 历史清理限制

迁移需要清理数据文件的历史提交、旧 Pages 构建产物和已发布数据地址。普通删除文件并不能清除旧提交。清理后仍可能存在 GitHub 的不可达提交缓存；必要时需向 GitHub Support 请求清除。已经被别人下载、复制或留存的副本无法远程收回。

月面影像来源：NASA / Goddard Space Flight Center / Arizona State University。
