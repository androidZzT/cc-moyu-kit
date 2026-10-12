<div align="center">
  <img src="docs/market-pane.png" width="720" alt="Claude Code 里的 market-pane" style="border-radius: 16px;">
  <h1>claude-trading-mods</h1>
  <p><strong>在 Claude Code 的侧边面板里看 A股、港股、美股行情。</strong></p>
  <p><em>基于 Claude Code 插件 hook 的 Claude Mods：不用 API key，不开新窗口，面板不抢输入焦点。</em></p>

  <p>
    <a href="https://github.com/androidZzT/claude-trading-mods/stargazers"><img src="https://img.shields.io/github/stars/androidZzT/claude-trading-mods?style=flat-square" alt="Stars"></a>
    <img src="https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.295-D97757?style=flat-square" alt="Claude Code">
    <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/API%20key-not%20required-brightgreen?style=flat-square" alt="No API key">
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=flat-square" alt="Platform">
  </p>

  <p>
    <a href="#-为什么做">为什么做</a> &bull;
    <a href="#-功能">功能</a> &bull;
    <a href="#-快速开始">快速开始</a> &bull;
    <a href="#%EF%B8%8F-命令">命令</a> &bull;
    <a href="#-刷新与数据源">数据</a> &bull;
    <a href="#%EF%B8%8F-开发">开发</a> &bull;
    <a href="README.md">English</a> | 简体中文
  </p>
</div>

---

## 🤔 为什么做

agent 跑一个长任务，人只能在旁边等。切到行情软件或浏览器看一眼盘，就离开了终端，Claude 什么时候需要你确认也容易错过。

Claude Code 2.1.287 加入了 **Claude Mods**：插件可以开自己的面板、注册命令、通过宿主拉数据。`market-pane` 借这个能力，在对话右侧放一块行情面板。瞄一眼就能看盘，输入焦点一直留在 prompt 上。

> claude-trading-mods 是社区项目，与 Anthropic 无关。行情仅供参考，不构成投资建议。

---

## 🚀 功能

### 📈 三地指数
> A股（上证指数、深证成指、创业板指）、港股（恒生指数、恒生科技指数）、美股（道琼斯、纳斯达克、标普500），按市场分组，各带盘中/休市指示灯。

### ⭐ 自选股
> 最多 20 只，A股、港股、美股都支持，存在插件存储里，跨会话保留。

### 〰️ 当日走势线
> 每个标的第二行画当日走势，按它自己当天的最高、最低价缩放；旁边一根按涨跌幅比例的条形（每格 1%，精度 1/8 格，涨跌 4% 及以上画满）。

### 🟥 关注板块
> 半导体（芯片概念）、人工智能、机器人、券商、创新药 5 个板块的色块，涨跌 3% 及以上用深色。想换板块改 `mods/market-pane/hooks/boards.ts`。

### ⚡ 跳动高亮
> 现价比上次刷新有变化时，反色显示一个刷新周期。

### 🔕 低打扰
> 不抢输入焦点，没有弹窗和声音；拉取失败时继续显示旧数据，并标上「过期」。

### 🕹️ 休市玩 K 线猜涨跌
> `/market play` 把面板切成小游戏：随机抽一只 A股/港股的一段真实日 K，隐去名称和日期，猜 5 个交易日后收盘是涨是跌。猜完后隐藏的 K 线逐根揭晓，同时显示标的、日期区间和 5 日涨跌幅。局数、正确率和连对跨会话保存。

<p align="center">
  <img src="docs/kline-game.png" width="600" alt="market-pane 里的 K 线猜涨跌">
</p>

### 🎨 没有颜色也能看
> 红涨绿跌，同时用 ▲/▼ 标方向，不显示颜色的终端也能看出涨跌；现价带千分位，三列数字右对齐。

---

## ⚡ 快速开始

在 Claude Code 终端会话里输入：

```
/plugin install market-pane --marketplace androidZzT/claude-trading-mods
```

提示添加 marketplace 时按 `y`，再回车装到用户级。装完立即生效，不用重启。

想从源码运行（开发用）：

```bash
git clone https://github.com/androidZzT/claude-trading-mods.git
claude --plugin-dir ./claude-trading-mods/mods/market-pane
```

终端宽度 ≥144 列时，会话启动后面板自动出现在右侧；窄于 144 列时 Claude Code 不自动放置，用 `/market` 手动打开。

---

## ⌨️ 命令

| 命令 | 作用 |
| --- | --- |
| `/market` | 开关面板 |
| `/market add <代码> [名称]` | 添加自选；已经添加过的代码会改成新名称 |
| `/market remove <代码>` | 删除自选 |
| `/market list` | 列出自选 |
| `/market play` | 在行情和 K 线猜涨跌之间切换 |

游戏里先点一下面板让它接收按键：`↑`/`k` 猜涨，`↓`/`j` 猜跌，`Enter`/`n` 下一局，`q` 回到行情，`Esc` 把键盘交还给输入框。也可以用鼠标点按钮。三个市场都休市时，热力图下方会有一行暗色提示指向 `/market play`。

| 市场 | 格式 | 示例 |
| --- | --- | --- |
| A股 | `sh` / `sz` / `bj` + 6 位数字 | `sh600519`、`sz000001` |
| 港股 | `hk` + 5 位数字 | `hk00700` |
| 美股 | `us` + 代码 | `usAAPL`、`usBRK.B` |

接口返回的中文名是 GBK 编码，mod 读不了，所以自选股显示的是你给的名称；没给名称就显示代码。

---

## 🔄 刷新与数据源

| 数据 | 盘中 | 休市 |
| --- | --- | --- |
| 报价与关注板块（任一市场盘中即算盘中） | 每 10 秒 | 每 5 分钟 |
| A股/港股分时走势 | 每 60 秒 | 每 30 分钟 |

- 面板关闭时什么都不请求。
- 游戏每局拉一次该标的的日 K（320 天，前复权），只在出题时请求。
- 美股接口没有分时数据，走势线用面板打开期间每次报价刷新的价格采样。
- 交易时段按北京时间判断，美股自动处理夏令时；不处理节假日。

数据都来自腾讯行情的公开接口，不需要 key。这些是非官方接口，没有可用性保证；接口变更或限流时，对应数据会停在上一次。

---

## 🛠️ 开发

```bash
cd mods/market-pane
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .   # 先用 --plugin-dir 加载一次，生成 .claude-plugin/types
```

所有碰 `$`（引擎）的调用都集中在 `hooks/register.tsx`；解析、交易时段、绘制、自选逻辑都是纯函数模块，各有测试。文件说明见 [`mods/market-pane/README.md`](mods/market-pane/README.md)。

需求和变更记录用 [OpenSpec](openspec/) 管理。

---

## 📄 许可证

[MIT](LICENSE)
