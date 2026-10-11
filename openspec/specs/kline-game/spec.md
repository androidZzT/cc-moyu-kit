# kline-game Specification

## Purpose

行情休市时在面板里玩「K 线猜涨跌」：随机抽一段真实历史日 K，隐去名称和日期，猜之后 5 个交易日的涨跌，揭晓后显示标的、区间和涨跌幅，成绩跨会话保留。

## Requirements

### Requirement: 进入与退出游戏
系统 SHALL 在 `/market play` 后把行情面板切到游戏视图，并在游戏内按 `q` 或再次 `/market play` 后回到行情视图。

#### Scenario: 进入游戏
- **WHEN** 用户输入 `/market play`
- **THEN** 面板打开（若未打开）并显示游戏视图，开始拉取第一局的日 K

#### Scenario: 退出游戏
- **WHEN** 游戏视图中按 `q`
- **THEN** 面板回到行情视图，计分保留

### Requirement: 出题
系统 SHALL 从题库随机抽取一只 A股/港股标的，随机取截止日，显示截止日及之前的日 K，隐藏名称与日期。

#### Scenario: 题面不泄露答案
- **WHEN** 一局开始
- **THEN** 视图中不出现标的名称、代码或日期，截止日之后的 K 线不绘制

#### Scenario: 平盘不出题
- **WHEN** 截止日收盘价与 5 个交易日后收盘价相等
- **THEN** 重新抽取截止日

#### Scenario: 日 K 拉取失败
- **WHEN** 日 K 请求失败或响应无法解析
- **THEN** 视图显示「题目加载失败，按 Enter 重试」，不影响行情数据

### Requirement: 作答与揭晓
系统 SHALL 在用户猜涨或猜跌后逐根揭晓之后 5 个交易日的 K 线，并显示对错、标的名称、日期区间和区间涨跌幅。

#### Scenario: 猜对
- **WHEN** 用户按 `↑`，且 5 日后收盘价高于截止日收盘价
- **THEN** 显示「猜对」，正确数与连对数加 1

#### Scenario: 猜错
- **WHEN** 用户的方向与实际相反
- **THEN** 显示「猜错」，连对数归零

#### Scenario: 判定以 hooks 为准
- **WHEN** Client 上报的局号与当前局不一致或猜测值不是 up/down
- **THEN** 忽略该上报，计分不变

### Requirement: 计分持久化
系统 SHALL 跨会话保存累计局数、正确数、当前连对和最佳连对。

#### Scenario: 新会话读取计分
- **WHEN** 会话启动且存储中已有计分
- **THEN** 游戏视图显示已保存的计分

### Requirement: 休市提示
系统 SHALL 在 A股、港股、美股都休市时，于行情视图底部显示一行暗色提示「休市中 · /market play 玩 K 线猜涨跌」。

#### Scenario: 任一市场盘中
- **WHEN** 至少一个市场处于交易时段
- **THEN** 不显示该提示
