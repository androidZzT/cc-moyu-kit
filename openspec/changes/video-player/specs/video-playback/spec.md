# Spec Delta

## Purpose

让用户在 agent 跑任务时，在 Claude Code 侧边面板里播放本地视频文件（画面与声音），不抢输入焦点，并且不让临时文件占满磁盘。

## ADDED Requirements

### Requirement: 播放命令
`/video <绝对路径> [fps]` SHALL 在侧边面板开始播放该文件；fps 为 1 到 60 的整数，省略时为 15。参数不合法时 SHALL 只回复用法、不开始播放。已经在播放时，新的播放命令 SHALL 先停止当前播放。命令回复 SHALL 包含视频的分辨率与 fps。

#### Scenario: 默认帧率
- **WHEN** 用户输入 `/video /Users/me/a.mp4`
- **THEN** 面板打开并以 15 fps 播放，回复「开始播放 1280×544 @ 15 fps」形式的一行

#### Scenario: 相对路径
- **WHEN** 用户输入 `/video a.mp4`
- **THEN** 不开始播放，回复用法

#### Scenario: 帧率越界
- **WHEN** 用户输入 `/video /Users/me/a.mp4 120`
- **THEN** 不开始播放，回复用法

#### Scenario: 播放中换片
- **WHEN** 正在播放 a.mp4，用户输入 `/video /Users/me/b.mp4`
- **THEN** a.mp4 的画面与声音停止，开始播放 b.mp4

### Requirement: 停止命令
`/video stop` SHALL 停止画面与声音、删除本次播放的临时帧并关闭面板；没有在播放时 SHALL 同样关闭面板并回复已停止。

#### Scenario: 播放中停止
- **WHEN** 正在播放，用户输入 `/video stop`
- **THEN** 声音立即停止，面板关闭，本次播放的临时帧目录不再存在

### Requirement: 画面按时间推进
画面 SHALL 按播放开始后经过的真实时间显示对应的帧；解码跟不上时 SHALL 停在已解出的最后一帧等待，而不是跳回或加速。换帧 SHALL NOT 重绘面板其余部分，也 SHALL NOT 抢占输入焦点。

#### Scenario: 正常播放
- **WHEN** 以 15 fps 播放开始 2 秒后
- **THEN** 面板显示第 31 帧

#### Scenario: 解码落后
- **WHEN** 第 31 帧已到时间但只解出 28 帧
- **THEN** 面板停在第 28 帧，第 31 帧解出后立即显示

### Requirement: 声音
本机有 ffplay 时，SHALL 在第一帧显示的同时开始播放该文件的音轨，并在停止、换片、播完时随之停止。没有 ffplay 或文件没有音轨时 SHALL 只放画面，并在状态行注明无声音。

#### Scenario: 有音轨
- **WHEN** 播放带音轨的文件且本机有 ffplay
- **THEN** 声音与画面同时开始

#### Scenario: 没有 ffplay
- **WHEN** 本机没有 ffplay
- **THEN** 画面照常播放，状态行含「无声音」

### Requirement: 进度显示
画面下方 SHALL 有一行状态，显示当前时间/总时长（mm:ss）与最近一秒的实际帧率；播完时 SHALL 显示「播放完毕」。

#### Scenario: 播放中
- **WHEN** 总长 14:48 的片子播到 1 分 5 秒，实际约 15 帧/秒
- **THEN** 状态行为「01:05 / 14:48 · 15 fps」形式

### Requirement: 临时帧的磁盘占用
解出的帧 SHALL 只领先当前播放位置几秒，已经显示过的帧 SHALL 被删除，使播放期间的临时占用与片长无关（640 宽的帧下不超过约 50 MB）。

#### Scenario: 长片
- **WHEN** 播放一部 15 分钟的影片到第 10 分钟
- **THEN** 临时帧目录里只有当前帧之后几秒的帧

### Requirement: 临时帧清理
播完、停止、换片时 SHALL 删除本次播放的临时帧目录。会话启动时 SHALL 删除之前会话遗留、且不属于任何正在播放会话的临时帧目录。

#### Scenario: 自然播完
- **WHEN** 影片播到最后一帧
- **THEN** 声音停止，状态行显示「播放完毕」，本次临时帧目录被删除

#### Scenario: 被重载打断后的遗留
- **WHEN** 上次会话播放中途被重载或退出，留下了临时帧目录
- **THEN** 下次会话启动后该目录被删除

### Requirement: 降级提示
以下情况 SHALL 在面板或命令回复里给出一行明确提示，SHALL NOT 弹窗：缺少 ffmpeg 或 ffprobe；文件不存在或不是视频；终端不能显示图片（此时 SHALL 停止解码）；在非终端界面（desktop、vscode 等）打开面板。

#### Scenario: 缺少 ffmpeg
- **WHEN** 本机没有 ffmpeg，用户输入 `/video /Users/me/a.mp4`
- **THEN** 不开始播放，回复需要安装 ffmpeg（如 `brew install ffmpeg`）

#### Scenario: 不是视频
- **WHEN** 用户指定的文件没有视频流
- **THEN** 不开始播放，回复读不了这个视频

#### Scenario: 终端不支持图片
- **WHEN** 当前终端只能显示图片的替代文字
- **THEN** 解码停止，面板提示需要 kitty、Ghostty 等支持图片的终端
