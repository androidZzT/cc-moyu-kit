# Design

## Context

原型在 `~/.claude/dev-mods/<session>/video-player`，已在 Ghostty 里实测出画面（测试彩条和 Blender《Sintel》720p）。原型的做法：ffprobe 读尺寸 → ffmpeg 把整片解成 640 宽 PNG 写进 `mktemp -d` 目录 → `$.clock.every` 按经过时间算出该显示的帧 → `$.ui.blit` 把 keyed `Image` 的 `{ file, format: 'png' }` 换成那一帧的路径。帧计数来自 ffmpeg `-progress pipe:1` 的 `frame=N`。声音后来接上了 ffplay，但用户还没完整验证过同步。

约束来自 mod 沙箱：
- `$.process.spawn` 的输出按 UTF-8 文本读，二进制帧不能从 stdout 传，所以帧必须落盘（或走 shm）
- `$.audio.play` 只能播 mod 自带的文件，而且要完整文件，不适合播源文件的音轨
- `Image` 的 file 源由终端自己读文件，像素不经过 `$`；只有 kitty、Ghostty 这类终端显示真图，其他终端画 alt，blit 返回 deny
- `$` 只能在定义它的文件里传递，引擎相关逻辑都在 `register.tsx`，其余模块保持纯函数（沿用 market-pane 的分法）

## Goals / Non-Goals

**Goals:**
- 原型的播放链路原样保留，补上磁盘占用、清理、降级和测试
- 纯逻辑（参数解析、ffmpeg 参数、帧号计算、时间格式、清理判定）全部可单测

**Non-Goals:**
- 不做音画精确同步（不读 ffplay 的播放时钟），以"同一时刻开始 + 画面按墙钟走"为准
- 不支持 Linux/Windows 的声音以外的差异处理；路径与命令按 macOS + Homebrew 验证

## Decisions

### D1 解码按播放速度推进：`-readrate 1 -readrate_initial_burst 2`

ffmpeg 解码比实时快几十倍（20 秒测试片 0.36 秒解完），不加限制就会把整片写盘。用 ffmpeg 自带的读速限制：先突发读入 2 秒建立领先，之后按 1 倍速读。实测（突发 3 秒时）15 fps 下 6 秒时已解 121 帧、应播 90 帧，领先稳定在约 2 秒；改用原始像素帧后每帧变大，突发降为 2 秒以控制占用。

- 备选：mod 自己暂停/恢复 ffmpeg（`kill -STOP/-CONT`）按水位控制。更精确，但要管进程信号和竞态，收益不大
- 备选：分段解码（每次 `-ss` 解 10 秒）。段间衔接要处理关键帧对齐，复杂

### D2 播过即删

每次换帧成功后删除比当前帧早的帧。删除走 `$.process.run(['rm', ...])`，按批（每秒一次，删上一秒之前的帧）避免每帧起一个进程。加上 D1，目录里常驻约 2 秒领先加最多 1 秒未删的帧（15 fps × 3 秒 × 522 KB ≈ 24 MB），不超过 spec 的 50 MB。

### D3 临时目录与遗留清理

所有播放目录放在 `$TMPDIR/cc-moyu-video/` 下，每次播放一个 `mktemp -d` 子目录。会话启动时用 `find -mmin +10` 找出这个根目录下 10 分钟内没有修改过的子目录并删除：正在播放的目录每秒都有新帧写入和旧帧删除，修改时间总是新的；超过 10 分钟没动的必然是被打断的遗留。这样不需要跨会话登记，多个会话同时播放也互不误删。

- 备选：用 `$.store` 记录目录。store 跨会话共享，并发会话下难判断归属，而且进程崩溃时来不及更新

### D4 播完的判定与收尾

ffmpeg 退出且当前时间对应的帧号超过已解出的总帧数时视为播完：停掉计时器和 ffplay，删除目录，状态改为「播放完毕」。目录删了以后 Image 没有源，所以播完时面板只显示状态行。

### D5 声音：ffplay 无窗口播源文件

`ffplay -nodisp -autoexit -vn -sn <path>`，在第一帧显示时启动，和画面计时同一时刻开始。启动前用 `which ffplay`（`$.process.run`）判断有无，无则状态行注明「无声音」。没有音轨的文件 ffplay 会直接退出，不影响画面。

### D6 依赖检查与错误提示

播放前依次：`ffprobe` 读视频流尺寸和时长（失败区分"没有 ffprobe"和"不是视频"），再起 ffmpeg。第一次 blit 返回 deny 且原因是画 alt（终端不支持图片）时，立即停止解码和声音，面板提示换终端。

### D7 状态与重绘

state 只放低频变化的东西：状态（idle/decoding/playing/done/error）、目录、尺寸、时长、fps、状态行文字。帧号、已解帧数、计数器放在模块变量里，换帧不写 state，避免整面板重绘；状态行每秒更新一次。面板重绘时 Image 的源取模块变量里的当前帧，不会闪回第一帧。

### D8 文件划分

- `hooks/register.tsx`：所有用到 `$` 的逻辑（命令、进程、计时、blit、渲染）
- `hooks/plan.ts`：参数解析、ffprobe/ffmpeg/ffplay 参数、ffprobe 输出解析、进度解析
- `hooks/timeline.ts`：帧号计算、mm:ss 格式、状态行文字、该删哪些帧、跳转目标与进度条格子
- `hooks/cleanup.ts`：遗留目录判定（按修改时间）

### D9 帧格式：原始 RGB 而不是 PNG

首次实机播放《Sintel》（PNG 帧，15 fps）用户反馈"很卡"。解码端已排除（ffmpeg 稳定领先约 2 秒），瓶颈在显示端：终端每帧要读文件并解 PNG。`ImageSource` 的 `{ file, format: 'rgb', width, height }` 让终端直接拿像素，API 文档里浏览器流的例子也用这条路。ffmpeg 用 `-f image2 -c:v rawvideo -pix_fmt rgb24` 逐帧写 `.rgb` 文件（实测 640×272 每帧正好 522,240 字节）。输出高度由 mod 按宽高比算成偶数并显式传给 `scale=640:H`，保证文件大小与 blit 时声明的宽高一致。

- 备选：PNG 降低压缩级别。仍要逐帧解码，收益不确定
- 备选：POSIX shm。macOS 上 ffmpeg 不能直接写 shm，要额外的中转进程

### D10 暂停、继续与跳转：重启分段

把一次播放分成若干"段"：每段是一个 ffmpeg（`-ss <起点>`）加一个 ffplay（`-ss <起点>`），帧写进 `<播放目录>/s<段号>/`，帧号从 1 开始，位置 = 段起点 + (帧号 − 1) / fps。

- 暂停：停掉本段的 ffmpeg、ffplay 和计时器，画面停在当前帧，帧文件保留；每 60 秒 `touch` 一次播放目录，免得别的会话按 D3 把它当遗留删掉
- 继续：从当前位置开新段
- 跳转：从目标位置（限制在 0 到总时长之间）开新段，暂停中跳转也开始播放
- 新段第一帧解出后删除上一段的目录

不用 `kill -STOP/-CONT` 冻结进程：`$.process.spawn` 不给 pid，要靠 `pgrep` 按参数找进程，而且冻结的 ffplay 恢复时音频设备可能出杂音。重启的代价是继续或跳转后约 0.3 秒才出第一帧，可以接受。

### D11 控制条与进度条

画面下面两行：
- 进度条：与面板同宽的一排 `plain` 单字符 Button，已播放的格子是「━」，未播放的是暗色「─」；第 i 格的 onPress 跳到 i / 格数 × 总时长。随每秒一次的状态更新重绘
- 控制行：「⏸ 暂停 / ▶ 播放」（hotkey `p`）、「« 10s」（`h`）、「10s »」（`l`），后面跟状态行。hotkey 只在面板获得焦点时生效（点一下面板或 ctrl+x tab），不影响输入框

命令 `/video pause`、`/video resume`、`/video seek <mm:ss|秒|+N|-N>` 走同一套逻辑。

## Risks / Trade-offs

- [终端绘制跟不上，实际帧率达不到目标] → 状态行显示实际帧率，用户可降低 fps；默认 15 fps
- [原始像素帧比 PNG 大约 2.5 倍，磁盘写入约 8 MB/s] → 只领先 2 秒、每秒删除；高 fps（如 60）时占用随之变大，spec 只承诺 15 fps 下的上限
- [音画漂移：画面按墙钟，ffplay 按自己的时钟，长片可能累积偏差] → 实测《Sintel》全片观察；偏差明显时再考虑读 ffplay 进度校正（不在本次范围）
- [`-readrate` 在某些容器上首帧前的突发不足，开头卡顿] → 画面落后时停在最后一帧等待，不会错乱
- [遗留清理按 10 分钟判定，播放暂停超过 10 分钟会被误删] → 本次不做暂停，没有这个情况；以后加暂停时要同步调整
- [依赖本机 ffmpeg，非 macOS 环境未验证] → README 写明要求与安装方式

## Migration Plan

原型在 dev-mods，不对外发布，正式版写进 `mods/video-player` 后删除原型目录即可，没有迁移。
