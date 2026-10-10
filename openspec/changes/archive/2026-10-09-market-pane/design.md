# Design

## Context

动机见 proposal.md。实现约束：

- mod 运行在引擎提供的沙箱里，无 DOM、无 Node，对外只能走 `$`：网络 `$.http.fetch`（只返回 `text`）、定时 `$.clock.every/now`、界面 `$.ui.open/close/panes/resolve`、会话状态 `$.state`、跨会话 `$.store`、命令 `$.command.register` + `command.run` 钩子。
- 热重载会重新执行 `register` 并再次触发 `session.start`，模块级变量全部丢失，挂起的 timer 被取消；`$.state` 和 `$.store` 保留。
- 引擎规则：会话启动时"未经请求"打开的 Pane 只有在终端 ≥144 列时才落座，否则等待；用户命令打开的 Pane 任何宽度都能落座。
- 腾讯行情接口实测（2026-10-09）：`https://qt.gtimg.cn/q=sh000001,hkHSI,usDJI,...` 一次返回多行 `v_<code>="f0~f1~f2~..."`，GBK 编码；字段 `[3]` 现价、`[4]` 昨收、`[30]` 时间、`[31]` 涨跌、`[32]` 涨跌幅，A/港/美三市场一致；无匹配时返回 `v_pv_none_match="1";`。

## Goals / Non-Goals

**Goals:**
- 核心逻辑（代码校验、响应解析、交易时段、自选增删）写成纯函数，脱离引擎即可单测
- 热重载、重开会话后状态正确恢复，不出现重复 timer
- 一次刷新一个请求，休市时请求量降到最低

**Non-Goals:**
- 节假日日历（节假日按交易日处理，最多多刷几次，不影响正确性）
- K 线、分时图、盘口深度、成交量
- 可配置刷新间隔、可配置配色、可配置指数列表（先固定，后续按需加 `userConfig`）
- 多数据源切换

## Decisions

### D1 数据源：腾讯 `qt.gtimg.cn`
- **选择**：腾讯行情接口，免 key、无需 Referer、一次请求覆盖 A/港/美。
- **备选**：新浪 `hq.sinajs.cn`（需伪造 Referer，同为 GBK）；东方财富 `push2`（UTF-8 JSON，但不同市场 secid 规则复杂，批量请求要拼市场号）；Yahoo Finance（国内访问不稳定）。
- **代价**：非官方接口无 SLA。解析逻辑集中在一个模块，换源只改这一处。

### D2 编码：不读中文字段
- `$.http.fetch` 按 UTF-8 解码 GBK 响应，中文名会乱码，但数值和 `~` 分隔符都是 ASCII，不受影响。
- 指数名用内置表（`sh000001 → 上证指数` 等 8 项），自选股名用用户在 `/market add` 时给的名字，缺省显示代码。
- 备选：在沙箱里手写 GBK 解码表——体积大、收益小，不做。

### D3 涨跌由现价和昨收计算
- 用 `[3]` 现价、`[4]` 昨收自行算涨跌额和涨跌幅，不依赖 `[31]/[32]` 的位置；昨收为 0 时涨跌幅记为 0。
- 理由：减少对字段位置的依赖，三个市场只需要两个字段对齐。

### D4 单一 10 秒 tick + 节流
- `session.start` 中启动一个 `$.clock.every(10_000)`；每个 tick 先检查面板是否打开（`$.ui.panes()`），未打开直接返回；打开时按"任一市场在交易时段 → 10s，否则 300s"判断距上次拉取是否到期，到期才请求。
- 备选：按市场状态动态 cancel / 重建 timer——状态更多、热重载更容易漏取消。单 tick 方案在热重载时随旧环境一起被引擎取消，不会重复。
- 面板打开（`/market` 或自动打开）时立即拉一次，不等 tick。

### D5 交易时段按北京时间纯函数判断
- `isMarketOpen(market, nowMs)`：A股 工作日 09:30–11:30、13:00–15:00；港股 工作日 09:30–12:00、13:00–16:00；美股 美东时间 09:30–16:00（工作日按美东日期判断），夏令时规则：3 月第二个周日至 11 月第一个周日。
- 全部基于 UTC 毫秒手算偏移，不依赖沙箱里的时区数据。

### D6 状态分层
- `$.state`（类型契约见 `types/index.d.ts`）：
  - `quotes: Record<code, Quote>`，`Quote = { price, prevClose, change, pct, isMissing }`
  - `feed: { status: 'loading' | 'ok' | 'stale', lastOkAt?: number, lastFetchAt?: number }`
  - `watchlist: WatchItem[]`，`WatchItem = { code, name }`
- `$.store` 只存 `watchlist`。`session.start` 时从 store 读到 state；每次增删先写 state 再写 store。
- 所有更新走 `update($, atom, fn)` 返回新对象，不原地修改。

### D7 文件拆分
```
mods/market-pane/
  .claude-plugin/plugin.json      # name, version, description, types
  hooks/hooks.json                # { "modules": ["./register.tsx"] }
  hooks/register.tsx              # 只做事件接线：session.start / command.run / ui.render
  hooks/symbols.ts                # 代码校验与规范化、内置指数表
  hooks/parse.ts                  # 拼 URL、解析响应
  hooks/hours.ts                  # 交易时段判断与刷新间隔
  hooks/watchlist.ts              # 自选增删纯函数、子命令解析
  hooks/view.tsx                  # 面板绘制（分组、着色、状态行）
  types/index.d.ts                # PluginState 契约
  tests/*.test.ts                 # claude plugin test
```
- 实测（任务 1.2/2.4）：相对 import 可用，但 `claude plugin validate` 要求 `$` 只能传给**同一文件内**声明的函数，`atom` 也必须在调用 `read/update` 的同一文件中定义。因此：所有用到 `$` 的逻辑（刷新、tick、命令处理、atom 定义）集中在 `register.tsx`；`symbols.ts`、`parse.ts`、`hours.ts`、`watchlist.ts` 只放纯函数；`view.tsx` 接收 `$.ui.resolve(e)` 解析出的元素表和纯数据，不接触 `$`。原计划的 `state.ts`/`feed.ts` 合并进 `register.tsx`。

### D8 命令设计
- 注册一个 `/market` 命令，`args` 首词分派：空 → 开关面板；`add` / `remove` / `list` → 自选；其他 → 用法。
- 开关判断用 `$.ui.panes()` 查看 `market-pane` 是否已打开，而不是模块变量（热重载安全）。

## Risks / Trade-offs

- [接口变更或限流] → 解析失败走"过期"降级，不崩溃；解析集中在 `parse.ts`，换源成本低。
- [字段位置变化导致数值错乱] → 解析时校验现价、昨收为有限正数，否则该标的标记为未找到而不是显示错误数字。
- [节假日空轮询] → 每 10 秒一个小请求，可接受；后续可加节假日表。
- [窄终端看不到自动面板] → 引擎规则如此，`/market` 手动打开兜底；在 README 说明。
- [组织策略禁止 web fetch] → fetch 被拒同样走过期降级，面板显示状态但无数据。

## Migration Plan

全新 mod，无迁移。加载方式：`claude --plugin-dir <项目>/mods/market-pane`；回滚即不带该参数启动。
