# Proposal

## Why

周末和收盘后面板上的数字不再变化，常驻侧边的面板没有可看的内容。用面板已经在拉的同一套行情数据做一个「K 线猜涨跌」小游戏：随机抽一段真实历史日 K，隐去名称和日期，猜之后 5 个交易日的涨跌，揭晓后显示标的和区间。和行情面板同源、同风格，玩完一键回到行情。

顺带修复：分时走势与板块热力图在 Claude Code 会话里始终为空（不只是周末）。原因是 `web.ifzq.gtimg.cn` 与 `proxy.finance.qq.com` 的 https 证书链到 GlobalSign Root R3，宿主 `$.http.fetch` 校验失败；fetch 的错误被静默降级吞掉。

## What Changes

- 修复：分时接口改用证书链到 DigiCert 的 `ifzq.gtimg.cn`（同一接口、同一响应格式）；板块排行没有可用的 https 替代域名，改用 http（公开只读数据，仅用于展示）
- 新增 `/market play`：面板切到游戏视图；`/market` 子命令 `play` 再次输入或游戏内按 `q` 回到行情
- 新增游戏视图（`Client` surface module）：
  - 一局：从「内置 A股/港股标的池 + 自选里的 A股/港股」随机抽一只，随机取一个截止日，显示截止日前的日 K（名称、日期隐藏）
  - 按 `↑`/`k` 猜涨、`↓`/`j` 猜跌（也可点按钮）；猜后逐根揭晓之后 5 个交易日的 K 线，显示对错、标的名称、日期区间、5 日涨跌幅
  - `Enter`/`n` 下一局；累计局数、正确率、当前连对、最佳连对，跨会话保存
- 休市提示：三个市场都休市时，行情视图底部显示一行暗色提示「休市中 · /market play 玩 K 线猜涨跌」

## Capabilities

### New Capabilities
- `kline-game`: K 线猜涨跌——日 K 拉取与解析、出题与判定、计分持久化、游戏视图与按键

### Modified Capabilities
- `market-pane`: 新增 `/market play` 视图切换与休市提示
- `intraday-trend` / `sector-heatmap`: 数据接口域名与协议变更

## Impact

- 代码：`hooks/` 新增 `kline.ts`（日 K 接口与解析）、`game.ts`（出题/判定/计分，纯函数）、`kline-chart.ts`（K 线字符图布局，纯函数）、`game-surface.tsx`（Client 模块）；修改 `register.tsx`、`watchlist.ts`、`trend.ts`、`sector.ts`；`types/index.d.ts` 增加游戏状态
- 外部依赖：新增 `ifzq.gtimg.cn/appstock/app/fqkline/get`（前复权日 K，一次一只、320 根），每局 1 个请求，仅在游戏视图中由玩家触发
- 美股个股的日 K 需交易所后缀（如 `usAAPL.OQ`），本次不纳入题库
- 焦点：游戏只在玩家点击面板后接收按键，Esc 交还焦点；不改变「不抢输入焦点」的约束
- 不涉及任何交易、账户或下单操作；游戏结果不构成投资建议
