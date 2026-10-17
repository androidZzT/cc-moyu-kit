# video-playback Specification

## Purpose
让用户在 agent 跑任务时，在 Claude Code 侧边面板里播放本地视频文件或网络视频（画面与声音），不抢输入焦点，并且不让临时文件占满磁盘。

## Requirements

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
解出的帧 SHALL 只领先当前播放位置几秒，已经显示过的帧 SHALL 被删除，使播放期间的临时占用与片长无关（640 宽、15 fps 下不超过约 50 MB）。

#### Scenario: 长片
- **WHEN** 播放一部 15 分钟的影片到第 10 分钟
- **THEN** 临时帧目录里只有当前帧之后几秒的帧

### Requirement: 临时帧清理
播完、停止、换片时 SHALL 删除本次播放的临时帧目录。会话启动时 SHALL 删除之前会话遗留、且不属于任何正在播放或暂停中的会话的临时帧目录。

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

### Requirement: 暂停与继续
播放中 SHALL 能暂停：画面停在当前帧，声音停止，进度不再前进。暂停中 SHALL 能继续，从暂停的位置接着放画面和声音。面板上的暂停/播放按钮、面板获得焦点时的 `p` 键、`/video pause` 与 `/video resume` 命令 SHALL 都能操作；没有播放时这些操作 SHALL 不做任何事并回复没有在播放。

#### Scenario: 暂停
- **WHEN** 播放到 01:05 时用户按面板上的暂停按钮
- **THEN** 声音停止，画面停在 01:05 那一帧，状态行以「⏸」开头，按钮变为播放

#### Scenario: 继续
- **WHEN** 暂停在 01:05，用户输入 `/video resume`
- **THEN** 画面与声音从 01:05 接着播放

#### Scenario: 长时间暂停
- **WHEN** 暂停超过 10 分钟后，另一个会话启动
- **THEN** 这次播放的临时帧目录不被当作遗留删除

### Requirement: 跳转
SHALL 能跳到指定位置：面板上的「« 10s」「10s »」按钮与 `h`、`l` 键各后退、前进 10 秒；`/video seek <mm:ss 或 秒>` 跳到绝对位置，`/video seek +N` / `-N` 相对跳 N 秒。目标位置 SHALL 被限制在片头到片尾之间。跳转后 SHALL 从新位置播放画面和声音；暂停中跳转也 SHALL 开始播放。

#### Scenario: 前进 10 秒
- **WHEN** 播放到 01:05 时按「10s »」
- **THEN** 画面和声音从 01:15 继续

#### Scenario: 跳到绝对位置
- **WHEN** 用户输入 `/video seek 05:30`
- **THEN** 从 05:30 开始播放

#### Scenario: 越过片头
- **WHEN** 播放到 00:04 时按「« 10s」
- **THEN** 从 00:00 开始播放

### Requirement: 进度条
画面下方 SHALL 有一条与面板同宽的进度条，已播放部分与未播放部分用不同字符区分，至少每秒更新一次；点击进度条的某一格 SHALL 跳到该格对应的位置。

#### Scenario: 显示进度
- **WHEN** 总长 14:48 的片子播到一半，面板宽 60 列
- **THEN** 进度条前约 30 格为已播放字符，其余为未播放字符

#### Scenario: 点击跳转
- **WHEN** 用户点击 60 格进度条的第 45 格（从 0 数）
- **THEN** 从 11:06 附近开始播放

### Requirement: 音量
视频的音量 SHALL 能独立于系统音量调节，范围 0–100%，默认 100%。`/video volume <0–100>` SHALL 设为该值，`/video mute` SHALL 切换静音；面板控制行 SHALL 提供减 10%（快捷键 `j`）、加 10%（`k`）、静音切换（`m`）三个按钮，加减时 SHALL 同时取消静音。状态行 SHALL 显示「音量 N%」或「静音」。音量与静音状态 SHALL 跨会话保留。调整音量 SHALL 只影响声音：画面、进度与段 SHALL NOT 重启，声音 SHALL 从当前播放位置以新音量继续。视频没有声音时 SHALL NOT 显示这三个按钮。

#### Scenario: 命令设音量
- **WHEN** 正在播放，用户输入 `/video volume 40`
- **THEN** 回复「音量 40%」，声音从当前位置以 40% 继续，ffmpeg 不重启，状态行含「音量 40%」

#### Scenario: 静音与取消
- **WHEN** 正在播放，用户按 `m`
- **THEN** 声音停止、画面继续，状态行含「静音」；再按 `m`，声音从当前位置以原音量继续

#### Scenario: 加减按钮
- **WHEN** 音量 100% 时按两次 `j`
- **THEN** 音量为 80%；在 100% 时按 `k` 仍为 100%

#### Scenario: 跨会话记住
- **WHEN** 上个会话把音量设为 30%，新会话播放视频
- **THEN** 声音以 30% 开始，状态行含「音量 30%」

#### Scenario: 暂停中调音量
- **WHEN** 暂停中把音量设为 50%
- **THEN** 不出声；继续播放时声音以 50% 开始

#### Scenario: 参数不合法
- **WHEN** 用户输入 `/video volume 150`
- **THEN** 只回复用法，音量不变

### Requirement: 网络链接
`/video` SHALL 接受以 `http://` 或 `https://` 开头、不含空白的链接，后面可跟 fps。ffprobe 能直接读出视频流的链接 SHALL 直接播放；暂停、继续、跳转、音量、进度条 SHALL 与本地文件一致。

#### Scenario: 直链
- **WHEN** 用户输入 `/video https://example.com/a.mp4`
- **THEN** 不调用 yt-dlp，ffmpeg 与 ffplay 直接读这个链接，面板开始播放

#### Scenario: 网络视频跳转
- **WHEN** 正在播放网络视频，用户按 `l`
- **THEN** 新的段从 10 秒后开始，ffmpeg 与 ffplay 读的仍是同一地址

### Requirement: 网页链接解析
ffprobe 读不出视频流的链接 SHALL 交给本机 yt-dlp 解析（单个视频、不展开播放列表），选短边不超过 480 的清晰度并优先 H.264；解析结果有分开的画面与声音地址时，画面 SHALL 读画面地址、声音 SHALL 读声音地址；解析给出的请求头 SHALL 随每次 ffprobe、ffmpeg、ffplay 请求一起发送。

#### Scenario: B 站链接
- **WHEN** 用户输入 `/video https://www.bilibili.com/video/BV1GJ411x7h7`
- **THEN** yt-dlp 解析出画面与声音两个地址，ffmpeg 带着 Referer 等请求头读画面地址，ffplay 读声音地址，面板开始播放

#### Scenario: 没装 yt-dlp
- **WHEN** 网页链接 ffprobe 读不出视频且本机没有 yt-dlp
- **THEN** 不开始播放，回复「播放网页链接需要 yt-dlp：brew install yt-dlp」

### Requirement: 网络播放的降级
解析失败、链接是直播或拿不到时长时 SHALL 不开始播放并回复一行原因；播放中网络读取失败（包括地址过期）SHALL 按解码失败处理，面板显示一行原因。

#### Scenario: 直播
- **WHEN** yt-dlp 返回的是直播
- **THEN** 不开始播放，回复「不支持直播」

#### Scenario: 解析失败
- **WHEN** yt-dlp 退出码非 0
- **THEN** 不开始播放，回复「解析不了这个链接」并附 yt-dlp 错误的前 200 个字符

### Requirement: 音画对齐
有声音时，ffplay 报告出第一个声音时钟后，画面时钟 SHALL 对齐到这个位置：声音比画面晚时画面停在当前帧等声音追上，SHALL NOT 回退已显示的帧。每次 ffplay 重新起播（继续、跳转、调音量）SHALL 重新对齐一次。静音或没有声音时画面时钟照旧从第一帧开始。

#### Scenario: 声音晚到
- **WHEN** 画面已经走了 0.7 秒，ffplay 才报告声音位于段起点 0.0 秒
- **THEN** 画面停在当前帧约 0.7 秒，之后与声音同步推进

#### Scenario: 静音
- **WHEN** 静音播放
- **THEN** 不起 ffplay，画面从第一帧起按真实时间推进
