# 汇观 FX · 全球汇率看板

中文汇率网站，当前报价接入 **Open Exchange Rates 免费小时级数据**。列表、换算器和到价提醒共用一份小时报价，显示数据源实际发布时间（北京时间）；历史曲线保留 Frankfurter 免费每日参考数据。

## 运行

需要 Node.js 22.13 或更新版本。首次从 GitHub 下载后，在项目目录依次执行：

```text
npm run install:ci
```

复制 `.env.example` 为 `.env.local`，填入自己的 Open Exchange Rates App ID（见下节），然后执行：

```text
npm run build
npm run start -- --port 5173
```

打开 `http://127.0.0.1:5173/`。完成首次安装和构建后，Windows 可直接双击 **`启动汇率网站.cmd`**；该启动器运行已构建版本，并读取项目根目录的 `.env.local`。

仓库只保存源码和空白密钥模板，不包含依赖、构建结果、本机缓存和个人密钥。上传 GitHub 不会自动启动或托管网站。修改源码后需要重新构建；Windows 上请先关闭本网站的旧服务，避免它占用 `dist` 构建目录。开发命令 `npm run dev` 保留。

本机需要联网访问 `https://openexchangerates.org` 和 `https://api.frankfurter.dev`。关闭运行服务的终端可停止网站。页面保持打开且自动更新开启时，每小时检查一次新报价；回到页面或恢复联网也会检查服务端缓存。

## 免费密钥与额度

在 [Open Exchange Rates 免费注册页](https://openexchangerates.org/signup/free) 注册，无需银行卡。把自己的 App ID 填入根目录 `.env.local`：

```dotenv
OPEN_EXCHANGE_RATES_APP_ID=你的32位AppID
```

保存后重启网站。只在服务端读取密钥，使用 Authorization 请求头访问接口，不写入网页、浏览器缓存或 API 响应；`.env.local` 已被 Git 忽略，`.env.example` 仅包含空白配置模板。

免费套餐每月 1,000 次请求。网站每小时最多取得一份包含全部币种的 USD 基准报价，另每天取得一次前日末报价用于计算涨跌幅。连续运行 30 天的常规用量约 **750 次**，31 天约 **775 次**。手动刷新、切换基准、换算和多条提醒共享缓存；服务重启后可复用仍有效的本机持久缓存。上游失败会暂停 5 分钟再试，额外重试或清除缓存可能增加用量，因此最终用量以提供商账户统计为准。

未配置密钥时，页面明确显示“小时级待启用”，继续提供原有每日参考数据。配置后的认证、额度或网络错误会明确显示，不把每日数据伪装成小时报价。

## 已实现

- 动态获取可用货币，以人民币为默认基准，支持切换所有可用基准货币。
- 常用、全部、自选列表，中文/代码搜索、排序和加载更多。
- 7 天、30 天、90 天、1 年历史日线，真实时间横轴、悬浮值与可展开的历史数据；来源独立标注为 Frankfurter。
- 双向金额换算，显示小时报价的真实时间，不包含银行买卖价差和手续费。
- 本机到价提醒，支持高于/低于目标。页面运行且联网时检查；每条提醒只触发一次，记录保存在当前浏览器。
- 自选、基准设置、刷新开关、提醒和最后一份报价均保存在本机浏览器；没有账号同步。
- 接口失败时明确显示错误；如果有已保存报价则显示缓存及原始报价时间，不生成模拟行情。
- 小时报价超过 2 小时、时间无效或超前超过 5 分钟时，不参与提醒触发。每日备用数据仍按原有超过 4 天的规则处理。

## 报价口径

列表统一表示 **1 单位行内货币可兑换多少基准货币**。例如，基准为 CNY 时，USD 行表示 `1 USD = x CNY`。

Open Exchange Rates 免费接口以 USD 为基准，网站通过交叉换算支持任意可用基准货币：`from → to = rates[to] / rates[from]`，不调用付费的切换基准或换算接口。相同货币换算为 1。

小时报价的涨跌幅对比 **同一数据源的前一个 UTC 日末**：`(当前价 / 前日末价 - 1) × 100%`。UTC 日末对应北京时间次日约 08:00，界面会显示实际对比时间；这不是滚动 24 小时涨跌。缺少历史报价时显示“暂无对比”。

历史主图和小趋势图均使用 Frankfurter 日线，不把 Open Exchange Rates 小时报价拼接进日线，也不跨数据源计算涨跌幅。两个来源的报价可能略有差异；部分币种只有当前报价、没有 Frankfurter 日线。依数据源实际可用范围提供货币，并排除贵金属等非货币标的。周末或休市期间数值可能不变。

此站展示参考汇率，不是银行承诺的买入、卖出或成交价。数据源文档：[最新小时报价](https://docs.openexchangerates.org/reference/latest-json)、[前日末报价](https://docs.openexchangerates.org/reference/historical-json)、[Frankfurter v2](https://frankfurter.dev/)。

## 实现位置

- `app/dashboard.tsx`：页面、自选与状态。
- `app/fx-components.tsx`：图表、币种选择与换算界面。
- `app/use-market.ts`：请求、取消旧请求、本机缓存和提醒检查。
- `app/rate-alerts.tsx`：提醒管理。
- `lib/fx.ts`：数据类型、换算与提醒规则。
- `lib/oxr.ts`：小时报价、前日末报价、认证、响应校验、请求合并与小时持久缓存。
- `lib/fx-server.ts`：交叉换算、当前报价与历史日线的数据源适配。
- `app/api/rates`、`app/api/history`、`app/api/quote`：后端接口。
- `scripts/sites-env.mjs`：本机启动时将根目录 `.env.local` 的绝对路径传给服务，避免从构建目录错误读取配置。

现有浏览器中的自选和提醒继续保留；小时升级后的报价缓存使用独立版本号，避免把旧的每日报价错误标为小时数据。

## 验证

```text
node node_modules/typescript/bin/tsc --noEmit
node scripts/verify-domain.mjs
node scripts/verify-hourly.mjs
npm run build
```

本地服务运行后，在 PowerShell 7.5 或更新版本执行 `./scripts/verify-api.ps1 -ExpectedFrequency hourly`，并运行 `node scripts/verify-secrets.mjs`。

`verify-domain.mjs` 保留原有每日数据规则检查；`verify-hourly.mjs` 用隔离的固定数据和可控时钟检查一小时边界、并发合并、缓存复用、交叉换算、同源涨跌幅、认证和额度错误、两小时提醒失效边界。固定测试数据不会进入网站。

`verify-api.ps1` 使用真实服务验证币种覆盖、历史区间、双向汇率、实际发布时间、共享缓存和错误响应；`verify-secrets.mjs` 只报告密钥是否泄漏，不输出密钥值。验证结果位于 `outputs/*-verification.json`。

## 本次验证范围

类型检查、固定规则检查、真实接口集成检查、生产构建、密钥隔离和本机服务重启。没有进行本次浏览器视觉、交互、窄屏或 WebMCP 实际调用验证，也没有以等待一小时的方式测量定时器；小时缓存边界通过可控时钟检查。

页面在支持 `document.modelContext` 的浏览器中注册 `read_exchange_rates` 和 `convert_currency`；不支持时自动跳过。WebMCP 是可选增强，不影响手动操作。

## 当前交付状态（2026-09-10）

- 生产构建与 TypeScript 类型检查通过。
- 原有规则 8/8、小时级规则 11/11、真实接口检查 21/21、密钥隔离检查 5/5 通过。
- 本次实际可用 165 种报价货币；20:00（北京时间）的 USD/CNY 报价为 6.7105，30 天区间取得 31 条日线记录。此处为验证时快照，当前值以网站显示为准。
- 本机地址：`http://127.0.0.1:5173/`，双击 `启动汇率网站.cmd` 可重新启动。
- 本次范围为个人本机使用，没有发布公网。保留 `.openai/hosting.json` 中原有项目 ID。此前 Sites 对该项目返回 `404 project_not_found`；若以后需要发布，应先恢复原站点访问，不自动创建重复项目。

Windows 上如果 Sites 的构建包装脚本错误地寻找项目内的 `node_modules/npm/bin/npm-cli.js`，可直接使用 `npm.cmd run build`，无需改动插件或全局环境。
