# Spec Delta

## MODIFIED Requirements

### Requirement: 批量拉取行情
系统 SHALL 在一次 HTTP 请求中拉取全部指数、自选标的与面板关注板块的行情，每条行情至少包含现价、昨收、涨跌额、涨跌幅和数据时间。

#### Scenario: 一次请求覆盖全部标的
- **WHEN** 触发一次刷新，且有 8 个指数、3 只自选股和 5 个关注板块
- **THEN** 系统只发出一次请求，并为 16 个标的分别得到行情
