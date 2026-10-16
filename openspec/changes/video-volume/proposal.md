# Proposal

## Why

画面卡顿解决后，用户想在不动系统音量的情况下单独调视频的声音：agent 跑任务时常常开着别的声音（会议、音乐），视频只想小声放或者静音看。`video-player` 把音量列在「不做」里，这次把它加进来。

## What Changes

- `/video volume <0–100>` 设定音量，`/video mute` 切换静音
- 控制行增加三个按钮：🔉 减 10%（`j`）、🔊 加 10%（`k`）、🔇/🔈 静音切换（`m`）；视频没有声音时不显示
- 状态行增加一段「音量 60%」，静音时为「静音」
- 音量与静音状态跨会话记住，下次播放沿用
- 调音量只重启声音（ffplay 带新的 `-volume`，从当前位置接着放），画面不动；每次调整声音约断 0.1–0.3 秒
- 不在范围内：放大到 100% 以上、音量渐变、按视频分别记音量

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `video-playback`：增加「音量」需求（命令、面板按钮与快捷键、状态行、跨会话记住、调整时画面不受影响）

## Impact

- `mods/video-player`：新增纯模块 `hooks/volume.ts`；`plan.ts` 的 ffplay 命令行带 `-volume`、`parseArgs` 增加 volume/mute；`timeline.ts` 状态行加音量段；`register.tsx` 增加声音单独重启、`$.store` 读写、三个按钮
- 依赖 `video-player` change 先归档（它创建 `video-playback` 主 spec）
- README 的命令表、控制说明与「不支持」一行更新
