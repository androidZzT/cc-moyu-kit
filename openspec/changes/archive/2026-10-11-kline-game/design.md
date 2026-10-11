# Design

## 数据

- 日 K：`https://ifzq.gtimg.cn/appstock/app/fqkline/get?param=<code>,day,,,320,qfq`
  - A股返回 `data.<code>.qfqday`，港股与指数返回 `data.<code>.day`；每根 `[date, open, close, high, low, volume, ...]`，数值为字符串
  - 港股条目第 7 项是公告对象，忽略
- 为什么换域名：`web.ifzq.gtimg.cn`、`proxy.finance.qq.com` 的证书链到 GlobalSign Root R3，宿主 fetch 校验失败（在会话中用诊断版 mod 抓到报错）；`ifzq.gtimg.cn`、`qt.gtimg.cn` 链到 DigiCert，正常

## 出题（game.ts，纯函数）

- 题库：内置约 20 只 A股/港股常见标的 + 3 个 A股指数 + 2 个港股指数 + 自选中的 A股/港股，去重
- 随机数：`mulberry32(seed)`，seed 取自 `$.clock.now()` 与局数；测试中时钟被 mock，出题可复现
- 截止日 `cut`：在 `[MIN_VISIBLE, candles.length - REVEAL)` 中随机；`REVEAL = 5`
- 答案：`close[cut + REVEAL]` 与 `close[cut]` 比较；相等则换截止日重抽（最多 8 次，仍相等则换标的）
- 判定在 hooks 侧完成：Client 只上报 `{ type: 'guess', round, guess }`，hooks 用自己保存的答案判定，Client 发来的数据只当输入校验

## 视图（game-surface.tsx，Client 模块）

- props（hooks → Client）：`{ status, round?, score, verdict? }`，`round` 含全部 K 线、可见根数、隐藏名称与日期
- 本地 state：`{ roundId, shown }`；`shown` 为已揭晓根数，由 `surface.every(120)` 逐根推进；只在需要推进时 `setState`，避免触发 render loop 判定
- 布局：标题行（局数/正确率/连对）→ K 线图（高度 = 区域行数 - 4）→ 操作提示/结果行
- K 线图（kline-chart.ts）：每根 1 列；按可见部分的最高最低价加 20% 余量定标，揭晓的 K 线超出范围时截在边缘；实体 `█`、影线 `│`，红涨绿跌；相邻同色同字符合并为一个 Text，控制节点数
- 截止日后画一列 `┊` 分隔，未揭晓区域留空

## 交互

| 键 | 作用 |
|---|---|
| `↑` / `k` | 猜涨 |
| `↓` / `j` | 猜跌 |
| `Enter` / `n` | 下一局（揭晓后） |
| `q` | 回到行情 |
| `Esc` | 交还输入焦点（引擎行为） |

## 状态

- `mode`: `'market' | 'game'`
- `game`: `{ status: 'idle' | 'loading' | 'ready' | 'error', round?, verdict?, error? }`
- `score`: `{ played, correct, streak, best }`，同时写入 `$.store('kline-score')`
