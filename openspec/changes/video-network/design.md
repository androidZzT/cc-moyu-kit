# Design

## Context

实测（2026-10-16，本机网络）：
- B 站页面链接经 yt-dlp `-j` 解析出分开的画面（avc1 852×480）和声音地址，地址带签名、几小时后过期；不带 yt-dlp 给的请求头（Referer、User-Agent）会 403
- YouTube 同样分开两路，过期时间写在地址里
- ffprobe、ffmpeg（含 `-ss` 跳转）、ffplay 都接受 `-headers`；ffmpeg 网络跳转 100 秒后第一帧 0.63 秒落盘
- ffplay 在 `-loglevel info` 下每秒约 26 行状态 `  99.97 M-A: ...`，第一个数字是声音时钟，开始前是 `nan`；起播耗时本地约 0.34 秒，网络跳转后约 1.29 秒

## Goals / Non-Goals

**Goals:**
- 直链与常见网页链接都能用一条 `/video` 播放
- 网络起播延迟下音画仍然对齐

**Non-Goals:**
- 直播、登录/cookie、播放列表、过期后自动重新解析、选清晰度、下载缓存

## Decisions

### D1 先 ffprobe，读不出再 yt-dlp
直链 ffprobe 一次就能拿到宽高与时长，不必等 yt-dlp（启动约 2–5 秒）。网页链接 ffprobe 读到的是 HTML，很快失败，再交给 yt-dlp。备选：一律走 yt-dlp（它也认直链）——每次多几秒，放弃。

### D2 媒体输入 = 地址 + 请求头
`Run` 里的 `path` 换成画面输入与声音输入两个 `{ url, headers }`，本地文件是没有请求头的同一路径。命令行构造只在有请求头时加 `-headers`（按 `Key: Value\r\n` 拼接）。解析后再用 ffprobe 读一次画面地址，宽高、时长的来源和本地文件统一；有分开的声音地址即视为有音轨。

### D3 yt-dlp 参数
`yt-dlp -j --no-playlist --no-warnings -f "bv*+ba/b" -S "res:480,vcodec:avc" -- <链接>`。`-S res:480` 按短边选，竖屏短视频也合适；`--` 防止链接被当成参数。解析结果 `is_live` 为真或没有正时长视为直播。

### D4 音画对齐：以 ffplay 的第一个声音时钟为准
ffplay 改用 `-loglevel info`，逐块读 stderr 找第一个 `<秒> M-A:`。读到后把段的 `startedAt` 改成 `now - (声音时钟 - 段起点) × 1000`。之后显示的帧号若小于已显示的，按现有逻辑不回退、停帧等待。每个 ffplay 只对齐一次，之后的状态行丢弃。备选：持续用声音时钟驱动画面——每秒 26 次回调换来的收益不大，且网络卡顿时会和解码等待叠加，先不做。

### D5 校验
链接只接受 `^https?://\S+$`；命令行均以 argv 传递，不经过 shell。yt-dlp 输出按 JSON 校验每个字段，地址必须是 http(s)，请求头只保留字符串值。

### D6 文件划分
`hooks/source.ts`：`isUrl`、`ytdlpArgv`、`parseYtdlp`、`headersArgs`；`timeline.ts` 或 `plan.ts` 增加 `firstAudioClock(text)`。`register.tsx` 增加 `resolveSource`，其余流程不变。

## Risks / Trade-offs

- 地址过期后跳转会 403 → 面板显示 ffmpeg 错误，重新 `/video` 即可；记录为非目标
- 网络慢于播放速度时画面停帧、声音继续（ffplay 有自己的缓冲）→ D4 只在起播对齐，长时间卡顿后会失步，下一次跳转或继续时重新对齐
- 两条连接各自下载，带宽约为单路的两倍（480p 下仍约 1 Mbps）
- yt-dlp 会随网站改版失效 → 解析失败提示里带 yt-dlp 的错误，用户可自行升级
