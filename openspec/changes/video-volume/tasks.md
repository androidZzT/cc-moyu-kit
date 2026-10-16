# Tasks

## 1. 纯函数

- [x] 1.1 `hooks/volume.ts`：`Volume` 类型、默认值、store 值校验、加减 10%（钳位并取消静音）、设定、静音切换、有效音量、状态行标签；`plan.ts` 的 `audioArgv` 带 `-volume`，`parseArgs` 增加 `volume <0–100>` 与 `mute`；`timeline.ts` 状态行加音量段；测试覆盖 spec「加减按钮」「参数不合法」的计算部分

## 2. 接线

- [x] 2.1 `register.tsx`：ffplay 单独记 `stopSound`；`setVolume` 更新模块变量、写 `$.store`、正在出声时只重启 ffplay（`-ss` 为段起点 + 经过时间），有效音量为 0 时不启动；`session.start` 读回音量；命令 `volume`、`mute`；测试 spec「命令设音量」「静音与取消」「跨会话记住」「暂停中调音量」「参数不合法」
- [x] 2.2 面板：控制行增加 🔉 j、🔊 k、🔇/🔈 m，无声音时不显示；挂载测试断言按钮与 hotkey、按两次 j 后状态行为「音量 80%」

## 3. 文档与验证

- [x] 3.1 更新 `mods/video-player/README.md`（命令、控制行、不支持一栏）与根 README 的 video-player 小节；`claude plugin validate`、`claude plugin test`、tsc 通过；同步 dev-mods 副本
- [ ] 3.2 在 Ghostty 里实际调音量、静音，确认画面不受影响、声音从当前位置继续
