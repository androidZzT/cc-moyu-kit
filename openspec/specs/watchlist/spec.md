# watchlist Specification

## Purpose

让用户通过 /market 子命令管理自选个股列表（含自定义显示名），并在会话之间持久保存，供行情面板展示。

## Requirements

### Requirement: 添加自选
`/market add <代码> [显示名]` SHALL 校验代码格式后将其加入自选列表末尾；未给显示名时 SHALL 以代码作为显示名。重复添加同一代码 SHALL 更新显示名而不产生重复项。

#### Scenario: 添加带名称
- **WHEN** 用户输入 `/market add sh600519 茅台`
- **THEN** 自选列表新增 `sh600519`，显示名「茅台」，命令回复添加成功

#### Scenario: 格式错误
- **WHEN** 用户输入 `/market add 600519`
- **THEN** 列表不变，命令回复代码格式说明

#### Scenario: 重复添加
- **WHEN** `sh600519` 已在列表中，用户输入 `/market add sh600519 贵州茅台`
- **THEN** 列表仍只有一项 `sh600519`，显示名更新为「贵州茅台」

### Requirement: 删除自选
`/market remove <代码>` SHALL 从自选列表删除该代码；代码不在列表中时 SHALL 回复未找到且列表不变。

#### Scenario: 删除存在的代码
- **WHEN** 用户输入 `/market remove sh600519`
- **THEN** 该项被删除，面板下次绘制不再显示

#### Scenario: 删除不存在的代码
- **WHEN** 用户输入 `/market remove sz000001`，而列表中没有它
- **THEN** 回复未找到，列表不变

### Requirement: 查看自选
`/market list` SHALL 以文本回复当前自选列表（代码与显示名）；列表为空时回复添加用法。

#### Scenario: 列出
- **WHEN** 自选有两项时用户输入 `/market list`
- **THEN** 回复两行，每行包含代码和显示名

### Requirement: 自选数量上限
自选列表 SHALL 最多 20 项，超出时拒绝添加并提示上限。

#### Scenario: 达到上限
- **WHEN** 已有 20 项时用户再添加一项
- **THEN** 列表不变，回复已达上限

### Requirement: 跨会话持久化
自选列表的每次变更 SHALL 持久保存，新会话启动时 SHALL 恢复上次的列表。

#### Scenario: 重启后保留
- **WHEN** 用户添加自选后退出，再开一个新会话
- **THEN** 面板自选组显示之前添加的标的

### Requirement: 未知子命令
`/market` 后跟无法识别的子命令时 SHALL 回复用法说明，且不改变面板和列表。

#### Scenario: 拼错子命令
- **WHEN** 用户输入 `/market ad sh600519`
- **THEN** 回复 `/market [add|remove|list]` 用法说明
