# Tasks

## 1. 脚手架

- [x] 1.1 新建 `mods/video-player/`（`.claude-plugin/plugin.json` 含 types 与 author、`hooks/hooks.json`、`tsconfig.json`、`types/index.d.ts` 按 design D7 声明 `player` 状态），在 `.claude-plugin/marketplace.json` 增加 `video-player` 条目；验证 `claude plugin validate mods/video-player` 与仓库根 `claude plugin validate .` 通过

## 2. 纯函数

- [x] 2.1 `hooks/plan.ts`：参数解析（绝对路径、fps 1–60 默认 15、stop、用法）、ffprobe 参数与输出解析（宽高 + 时长，无视频流返回 undefined）、ffmpeg 参数（含 `-readrate 1 -readrate_initial_burst 3`、`-progress pipe:1`）、ffplay 参数、进度 `frame=N` 解析；`tests/plan.test.ts` 覆盖 spec「默认帧率」「相对路径」「帧率越界」「不是视频」的解析部分
- [x] 2.2 `hooks/timeline.ts`：经过时间 → 帧号、解码落后时取已解最后一帧、mm:ss 格式、状态行文字（含「无声音」「播放完毕」）、给定当前帧算出可删的帧号区间；`tests/timeline.test.ts` 覆盖 spec「正常播放」（2 秒 → 第 31 帧）「解码落后」「播放中」（`01:05 / 14:48 · 15 fps`）
- [x] 2.3 `hooks/cleanup.ts`：遗留目录查找参数（`find <根> -mindepth 1 -maxdepth 1 -type d -mmin +10`）与输出过滤（只保留根目录的直接子目录，防止误删根外路径）；`tests/cleanup.test.ts` 覆盖参数含 10 分钟阈值、根外路径与根本身被过滤

## 3. 引擎接线（register.tsx）

- [x] 3.1 命令与依赖检查：注册 `/video`；播放前 ffprobe，区分缺少 ffprobe/ffmpeg 与不是视频；在 `$TMPDIR/cc-moyu-video/` 下建本次目录；用 mock process 测试 spec「缺少 ffmpeg」「不是视频」「相对路径」不起解码进程
- [x] 3.2 解码与换帧：spawn ffmpeg 读进度，第一帧到达后开始计时，每帧周期按 timeline 取帧并 blit `{ file, format: 'png' }`，换帧不写 state；状态行每秒更新；mock clock + process 测试「正常播放」的 blit 路径序列与「解码落后」停帧
- [x] 3.3 播过即删与收尾：每秒批量删除已显示的帧；ffmpeg 退出且帧号越过总帧数时停计时器、停声音、删目录、状态「播放完毕」；测试 spec「长片」（目录里只剩当前帧之后的帧，用 mock 的 rm 调用参数断言）与「自然播完」
- [x] 3.4 停止与换片：`/video stop` 停解码、停声音、删目录、关面板；播放中再次 `/video` 先停旧的；测试 spec「播放中停止」「播放中换片」（旧进程被结束、旧目录被删）
- [x] 3.5 声音：`which ffplay` 判断，有则在第一帧时 spawn ffplay，随停止/换片/播完结束；无则状态行含「无声音」；测试 spec「有音轨」「没有 ffplay」
- [x] 3.6 降级：首次 blit 因画 alt 被拒时停解码与声音并提示换终端；非终端界面渲染只显示提示；会话启动时按 cleanup 删除遗留目录；测试 spec「终端不支持图片」「被重载打断后的遗留」

## 4. 面板与文档

- [x] 4.1 渲染：解出第一帧前显示状态文字；之后显示按宽高比算行数的 keyed Image（源为当前帧）加状态行；挂载测试断言 Image 的 columns/rows 与 alt、播完时只有状态行
- [x] 4.2 新增 `mods/video-player/README.md`（命令、依赖 ffmpeg/ffplay、支持的终端、磁盘占用、不支持的功能），在根 `README.md`、`README_CN.md` 增加 video-player 小节与安装命令；按 README 的命令在本机实际执行一遍核对
- [x] 4.3 删除 dev-mods 里的原型目录；验证 `claude plugin test mods/video-player`、`npx -y -p typescript tsc -p mods/video-player` 通过

## 5. 实机验证

- [ ] 5.1 在 Ghostty 新会话里用 `/video` 播放《Sintel》720p 至少 3 分钟：画面连贯、声音与画面同时开始且无明显漂移、状态行实际帧率接近 15、播放中 `du -sh $TMPDIR/cc-moyu-video` 不超过 50 MB；`/video stop` 后声音停止且目录被删
