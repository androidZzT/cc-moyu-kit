# Proposal

## Why

`/video` 目前只能放本机文件，想看的东西多半在网上，得先自己下载。ffmpeg、ffplay 本身能读 http(s)，B 站、YouTube 这类网页链接则要先解析出真实的音视频地址和请求头（实测 B 站不带 Referer 返回 403），本机的 yt-dlp 正好做这件事。

## What Changes

- `/video <http(s) 链接> [fps]` 播放网络视频，支持两类：
  - 直链（`.mp4`、`.m3u8` 等 ffmpeg 能直接读的地址）：直接交给 ffmpeg/ffplay
  - 网页链接（B 站、YouTube 等）：用本机 yt-dlp 解析出画面地址、声音地址和请求头，选短边不超过 480 的清晰度（画面只解到 640 宽，更高清没有意义），优先 H.264
- 暂停、跳转、音量、进度条对网络视频同样可用
- 声音起播后，画面时钟对齐声音的实际位置（本地和网络都生效）；实测网络跳转后声音要约 1.3 秒才出来，而画面 0.6 秒就到
- 降级提示：网页链接但没装 yt-dlp、解析失败、直播、链接过期
- 不在范围内：直播、需要登录或 cookie 的内容、播放列表、链接过期后自动重新解析、选择清晰度

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `video-playback`：增加「网络链接」「网页链接解析」「网络播放的降级」「音画对齐」四项需求

## Impact

- `mods/video-player`：新增纯模块 `hooks/source.ts`（链接判断、yt-dlp 命令行与输出解析、请求头参数）；`plan.ts` 的 ffprobe/ffmpeg/ffplay 命令行接受请求头，`parseArgs` 接受链接，`TOOLS` 增加 yt-dlp；`register.tsx` 增加解析流程与音画对齐
- 新的可选依赖 yt-dlp（`brew install yt-dlp`），只有网页链接需要
- 播放网络视频时持续占用带宽（480p 约 1 Mbps），画面与声音各一条连接
- 依赖 `video-player`、`video-volume` 两个 change 先归档
