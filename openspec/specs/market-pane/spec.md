# market-pane Specification

## Purpose

在 Claude Code 终端侧边以低打扰的方式展示三大市场指数和自选个股行情，并提供面板的开关与自动打开规则。

## Requirements

### Requirement: 面板内容分组
面板 SHALL 按「A股 / 港股 / 美股 / 自选」四组展示，A股组含上证指数、深证成指、创业板指，港股组含恒生指数、恒生科技指数，美股组含道琼斯、纳斯达克、标普500。每行展示显示名、现价、涨跌幅。自选为空时 SHALL 显示添加提示。

#### Scenario: 默认内容
- **WHEN** 用户没有自选股并打开面板
- **THEN** 面板显示 8 个指数分三组排列，自选组显示 `/market add <代码>` 的提示

### Requirement: 涨跌着色
面板 SHALL 按 A股习惯着色：上涨红色、下跌绿色、平盘默认色，并用 ▲/▼ 符号标注方向，保证无颜色终端也能分辨。

#### Scenario: 上涨标的
- **WHEN** 某标的涨跌幅为 +0.82%
- **THEN** 该行以红色显示 `▲0.82%`

#### Scenario: 下跌标的
- **WHEN** 某标的涨跌幅为 -1.79%
- **THEN** 该行以绿色显示 `▼1.79%`

### Requirement: 数据时间与状态
面板 SHALL 显示最近一次成功刷新的时间；数据过期时 SHALL 以暗色显示并附「过期」标记；首次数据到达前 SHALL 显示加载中。

#### Scenario: 首次打开
- **WHEN** 面板刚打开，首次请求尚未返回
- **THEN** 面板显示「加载中」

#### Scenario: 数据过期
- **WHEN** 最近一次刷新失败
- **THEN** 行情以暗色显示，标题区出现「过期」及上次成功时间

### Requirement: /market 开关面板
无参数的 `/market` 命令 SHALL 在面板关闭时打开它、打开时关闭它，且在任意终端宽度下都能打开。

#### Scenario: 打开
- **WHEN** 面板关闭时用户输入 `/market`
- **THEN** 面板打开并立即触发一次刷新

#### Scenario: 关闭
- **WHEN** 面板打开时用户输入 `/market`
- **THEN** 面板关闭

### Requirement: 会话启动自动打开
会话启动时系统 SHALL 请求打开面板；终端宽度不足 144 列时 SHALL NOT 挤占对话区（由引擎让面板等待），用户仍可通过 `/market` 打开。

#### Scenario: 宽终端
- **WHEN** 在 160 列终端启动会话
- **THEN** 面板自动出现在侧边

#### Scenario: 窄终端
- **WHEN** 在 100 列终端启动会话
- **THEN** 面板不自动占位，对话区不受影响

### Requirement: 不抢占输入
面板 SHALL NOT 抢占输入焦点，刷新 SHALL NOT 产生 toast、通知或声音。

#### Scenario: 刷新期间输入
- **WHEN** 用户正在输入 prompt 时面板刷新
- **THEN** 输入光标和内容不受影响
