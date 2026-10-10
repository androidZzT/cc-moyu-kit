# Tasks

## 1. 脚手架与环境验证

- [x] 1.1 创建 `mods/market-pane/` 目录结构、`plugin.json`（含 `types`）、`hooks/hooks.json`、`types/index.d.ts` 契约和一个只注册 `/market` 的最小 `register.tsx`，验证 `claude plugin validate mods/market-pane` 无报错
- [x] 1.2 在最小模块里从 `./symbols.ts` 相对 import 一个常量，验证 validate 通过且 `claude plugin test` 能跑一个空测试；不支持则按 design D7 退回单文件方案并在 design.md 记录
- [x] 1.3 用最小模块调用一次 `$.http.fetch('https://qt.gtimg.cn/q=sh000001')`，通过 `claude --plugin-dir` 加载后在 `$.ui.status` 显示返回的现价字段，验证沙箱可访问该接口

## 2. 行情数据（quote-feed）

- [x] 2.1 实现 `symbols.ts`：代码校验与规范化、内置 8 个指数及名称表；测试覆盖 spec「标的代码格式」的合法/非法场景
- [x] 2.2 实现 `parse.ts`：拼批量 URL、解析多行响应为 `Record<code, Quote>`，用现价/昨收计算涨跌，处理 `pv_none_match` 和非法数值；用 2026-10-09 实测响应做 fixture，测试覆盖「批量拉取」「未知标的」「不依赖中文字段」场景
- [x] 2.3 实现 `hours.ts`：三市场交易时段判断（含美股夏令时边界）和刷新间隔；测试覆盖 A股盘中、午休、周末、美股夏/冬令时开收盘边界
- [x] 2.4 在 `register.tsx` 接入 10 秒 tick + 节流拉取，写入 `quotes` / `feed` 状态，失败时置 `stale` 且不 toast；用 mock clock 和 mock http 测试「按交易时段刷新」「面板关闭停止请求」「失败降级与恢复」

## 3. 面板（market-pane）

- [x] 3.1 实现 `view.tsx`：四组布局、▲/▼ 与红涨绿跌、加载中/过期状态行、空自选提示；测试在 `terminal` 和 `desktop` 两个 surface 上挂载，断言分组顺序、符号和状态文本
- [x] 3.2 接入 `/market` 无参数开关（基于 `$.ui.panes()`）和打开即刷新；测试「打开」「关闭」场景
- [x] 3.3 `session.start` 自动请求打开面板；在 ≥144 列终端实际加载验证自动出现、<144 列不占位，输入 prompt 时刷新不影响光标

## 4. 自选（watchlist）

- [x] 4.1 实现 `watchlist.ts`：子命令解析、add（去重更新名称、20 项上限）、remove、list 的纯函数；测试覆盖 watchlist spec 全部场景
- [x] 4.2 接入 `command.run`：变更写 `$.state` 再写 `$.store`，`session.start` 从 `$.store` 恢复；测试「跨会话持久化」（重新执行 register 后列表仍在）和「未知子命令」

## 5. 集成与文档

- [x] 5.1 编写 `mods/market-pane/README.md`：加载方式（`claude --plugin-dir`）、`/market` 用法、窄终端说明、数据源声明；按 README 步骤从零加载一遍验证可用
- [x] 5.2 全量运行 `claude plugin validate` 与 `claude plugin test`、`tsc -p mods/market-pane`，全部通过；在真实会话中盘中观察 2 分钟，确认数据刷新且无 toast
