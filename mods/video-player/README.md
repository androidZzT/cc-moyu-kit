# video-player

在 Claude Code 侧边面板里播放本地视频，agent 跑长任务的时候看点东西，不用切出终端。

- **画面**：本机 ffmpeg 把视频解成 640 宽的 PNG 帧，终端直接读帧文件显示，面板其余部分不重绘
- **声音**：本机 ffplay 无窗口播放音轨，和第一帧同时开始
- **按时间推进**：画面按真实时间走，解码跟不上时停在最后一帧等待，不会加速或跳回
- **占用小**：解码只领先播放约 3 秒，播过的帧每秒删除一次，临时目录常驻约 10 MB，和片长无关
- **低打扰**：不抢输入焦点，不弹窗；出错时面板或命令回复里给一行提示

## 要求

| 要求 | 说明 |
| --- | --- |
| ffmpeg、ffprobe | 必需。macOS 上 `brew install ffmpeg`，会一起装上 ffplay |
| ffplay | 可选。没有时只放画面，状态行注明「无声音」 |
| 能显示图片的终端 | kitty、Ghostty 等支持图形协议的终端。其他终端看不到画面，播放会停下并提示换终端 |
| 终端界面 | desktop、vscode 等界面打开面板只显示一行提示 |

目前只在 macOS + Ghostty 上验证过。

## 加载

在 Claude Code 终端会话里安装（默认装在用户范围，所有项目都可用）：

```
/plugin install video-player --marketplace androidZzT/cc-moyu-kit
```

或者从源码加载：

```bash
claude --plugin-dir /path/to/cc-moyu-kit/mods/video-player
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `/video <绝对路径> [fps]` | 打开面板播放这个文件；fps 1–60，默认 15。正在播放时会先停掉旧的 |
| `/video stop` | 停止画面和声音，删除临时帧，关闭面板 |

路径里可以有空格，也可以用引号括起来：`/video "/Users/me/My Movie.mkv" 24`。

画面下方的状态行：`01:05 / 14:48 · 15 fps`，依次是当前位置、总时长、最近一秒实际显示的帧数。实际帧数明显低于设定值，说明终端读图跟不上，可以把 fps 调低。

不支持：暂停、拖动进度、网络流和直播、字幕。

## 临时文件

- 帧写在 `$TMPDIR/cc-moyu-video/play.XXXXXX/` 下，每次播放一个目录
- 播完、`/video stop`、换片时删除本次目录
- 会话启动时删除 10 分钟内没动过的目录：那是之前的会话被重载或退出打断后留下的。正在播放的目录每秒都有变化，不会被误删

## 开发

```bash
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .   # 先用 --plugin-dir 加载一次，生成 .claude-plugin/types
```

| 文件 | 内容 |
| --- | --- |
| `hooks/register.tsx` | 所有用到 `$` 的逻辑：命令、进程、计时、换帧、渲染、state |
| `hooks/plan.ts` | 参数解析，ffmpeg/ffprobe/ffplay 命令行，解析它们的输出 |
| `hooks/timeline.ts` | 帧号、是否播完、状态行、该删哪些帧、画面行数 |
| `hooks/cleanup.ts` | 临时目录位置，遗留目录的查找与过滤 |

测试里的 `tests/harness.ts` 在 mod 下面模拟时钟、终端、`which`/`ffprobe`/`rm` 等命令，以及可由测试喂进度、结束或被 mod 结束的 ffmpeg/ffplay 子进程。
