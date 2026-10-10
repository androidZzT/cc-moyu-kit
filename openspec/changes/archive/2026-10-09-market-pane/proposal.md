# Proposal

## Why

vibecoding 时想顺手看一眼大盘，目前只能切到浏览器或行情软件，打断心流。Claude Code 的 mod 能力（plugin hooks + 侧边 Pane）可以把行情直接放进终端侧边，等 Claude 干活的间隙瞄一眼，不用离开会话。

## What Changes

- 新增一个 Claude Code mod `market-pane`，源码放在本项目 `mods/market-pane/`，通过 `claude --plugin-dir` 加载
- 侧边面板展示三大市场指数：A股（上证指数、深证成指、创业板指）、港股（恒生指数、恒生科技指数）、美股（道琼斯、纳斯达克、标普500）
- 面板同时展示用户自选个股，自选列表可通过命令增删，跨会话保留
- 新增 `/market` 命令：无参数时开关面板；`add` / `remove` / `list` 子命令管理自选
- 行情从腾讯行情接口（`qt.gtimg.cn`，免 key）批量拉取，按市场交易时段自适应刷新频率；拉取失败时保留上次数据并标记为过期，不打断用户
- 宽终端（≥144 列）在会话启动时自动打开面板，窄终端需手动 `/market` 打开

## Capabilities

### New Capabilities
- `quote-feed`: 行情数据的获取、解析与刷新——标的代码校验、批量拉取、字段解析、交易时段判断与刷新节奏、失败降级
- `market-pane`: 侧边面板的展示与开关——指数分组展示、涨跌着色、数据时间与过期标记、`/market` 开关及自动打开规则
- `watchlist`: 自选个股的管理与持久化——`/market add|remove|list` 命令、自定义显示名、跨会话保存

### Modified Capabilities
<!-- 无：项目首个 change，openspec/specs/ 为空 -->

## Impact

- 新增代码：`mods/market-pane/`（`.claude-plugin/plugin.json`、`hooks/hooks.json`、`hooks/register.tsx` 及拆分出的模块、`types/index.d.ts`、`*.test.ts`）
- 外部依赖：腾讯行情接口 `https://qt.gtimg.cn/q=...`（非官方公开接口，无 SLA，可能变更或限流）
- 运行时依赖：Claude Code mod 引擎 API（`$.http.fetch`、`$.clock`、`$.ui`、`$.state`、`$.store`、`$.command`），无 npm 依赖
- 不涉及任何交易、账户或下单操作
