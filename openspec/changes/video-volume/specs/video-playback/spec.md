# Spec Delta

## ADDED Requirements

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
