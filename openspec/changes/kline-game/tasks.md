# Tasks

## 1. 修复分时与板块拉取

- [x] 1.1 诊断：在会话中加诊断输出，确认 `web.ifzq.gtimg.cn` / `proxy.finance.qq.com` 的 fetch 因证书校验失败
- [x] 1.2 分时接口改为 `ifzq.gtimg.cn`，板块排行改为 http；更新测试与 README 接口表
- [x] 1.3 会话实测：周末走势线与板块热力图正常显示

## 2. 纯函数模块（先测后写）

- [x] 2.1 `kline.ts`：日 K URL 与解析（A股 `qfqday`、港股 `day`、异常响应抛错）
- [x] 2.2 `game.ts`：题库、可复现随机数、出题（平盘重抽）、判定、计分更新、存储清洗
- [x] 2.3 `kline-chart.ts`：K 线字符图布局（定标、实体/影线、同色合并、超范围截断）

## 3. 接入

- [x] 3.1 `watchlist.ts`：`/market play` 子命令
- [x] 3.2 `game-surface.tsx`：Client 模块（按键、按钮、逐根揭晓、结果行）
- [x] 3.3 `register.tsx`：模式切换、出题拉取、`ui.message` 处理（next/guess/quit）、计分持久化、休市提示
- [x] 3.4 集成测试：`$.ui.mount` 驱动按键完成一局；失败重试；退出回到行情

## 4. 验收

- [x] 4.1 `claude plugin test` / `validate` / `tsc` 全通过
- [x] 4.2 tmux 会话实测并截图
- [x] 4.3 README（中英）补充 `/market play`
