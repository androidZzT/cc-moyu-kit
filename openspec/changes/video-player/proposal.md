# Proposal

## Why

套件目前只有行情面板，agent 跑长任务时能做的事有限。dev-mods 里的原型已经证明：用本机 ffmpeg 解帧、`$.ui.blit` 换 `Image` 的文件路径，能在 Ghostty 的侧边面板里放出真实画面，ffplay 也能同时出声。但原型会把整部片子先解到磁盘（15 分钟约 2.8 GB，曾在一台只剩 500 MB 的机器上差点写满），播完不清理，被重载打断还会留下孤儿目录，因此要正式化成套件里的第二个 mod。

## What Changes

- 新增 mod `mods/video-player`，登记到 `.claude-plugin/marketplace.json`，README 增加说明
- `/video <绝对路径> [fps]` 在侧边面板播放本地视频文件（画面 + 声音），`/video stop` 停止
- 基础播放控制：暂停/继续、前后跳 10 秒、可点击的进度条；面板按钮、快捷键（p/h/l）和 `/video pause|resume|seek` 命令都能操作
- 帧用原始 RGB 像素而不是 PNG，终端不用逐帧解码（首次实测 PNG 帧播放卡顿）
- 解码按播放速度推进，只领先几秒；播过的帧随即删除，磁盘占用与片长无关
- 播完、停止、重新播放时清理临时帧；会话启动时清理之前会话遗留的临时目录
- 面板下方一行显示进度（当前时间/总时长）与实际帧率
- 缺少 ffmpeg/ffprobe/ffplay、文件读不了、终端不能显示图片时，给出明确的一行提示，不弹窗
- 不在范围内：网络流/直播、字幕、倍速、音量（由后续 change `video-volume` 加入）、非终端界面（desktop/vscode 只显示提示）

## Capabilities

### New Capabilities

- `video-playback`：在侧边面板播放本地视频：命令、画面换帧、声音、暂停/跳转/进度条、进度显示、临时帧的磁盘占用与清理、依赖缺失与不支持终端时的降级

### Modified Capabilities

（无。market-pane 的行为不变）

## Impact

- 新目录 `mods/video-player/`（hooks、types、tests），代码从 `~/.claude/dev-mods/.../video-player` 原型迁入并重写
- `.claude-plugin/marketplace.json` 增加一个 plugin 条目；`README.md`、`README_CN.md` 增加 video-player 小节
- 运行时依赖本机 ffmpeg、ffprobe、ffplay（Homebrew 的 ffmpeg 自带）；声音依赖 ffplay，缺少时只放画面
- 只有支持图形协议的终端（kitty、Ghostty 等）能显示画面
- 播放期间本机临时目录占用约 30 MB（15 fps）；CPU 占用来自 ffmpeg 解码与终端绘制像素
