# Tasks

## 1. 纯函数

- [x] 1.1 `hooks/source.ts`：`isUrl`、`ytdlpArgv`、`parseYtdlp`（分开/合并两种结果、请求头、直播、缺字段返回 undefined）、`headersArgs`；用实测 B 站 JSON 的精简样本测试
- [x] 1.2 `plan.ts`：`parseArgs` 接受链接；`probeArgv`、`decodeArgv`、`audioArgv` 接受 `{ url, headers }`；ffplay 改 `-loglevel info`；`TOOLS` 加 yt-dlp；`firstAudioClock` 解析 `nan` 与数字两种状态行；测试

## 2. 接线

- [x] 2.1 `register.tsx` 解析流程：本地路径照旧；链接先 ffprobe，失败再 yt-dlp，再 ffprobe 画面地址；`Run` 持有画面与声音输入；测试 spec「直链」「B 站链接」「没装 yt-dlp」「直播」「解析失败」「网络视频跳转」
- [x] 2.2 音画对齐：读 ffplay stderr 的第一个声音时钟改 `startedAt`；测试 spec「声音晚到」「静音」，以及调音量后重新对齐

## 3. 文档与验证

- [x] 3.1 更新 mod README 与根 README（命令、yt-dlp 依赖、带宽、不支持项）；validate、test、tsc 通过；同步 dev-mods 副本
- [x] 3.2 在 Ghostty 里实际播放一个 B 站链接与一个直链，确认画面、声音对齐，跳转可用
