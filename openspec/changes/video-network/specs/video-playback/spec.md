# Spec Delta

## ADDED Requirements

### Requirement: 网络链接
`/video` SHALL 接受以 `http://` 或 `https://` 开头、不含空白的链接，后面可跟 fps。ffprobe 能直接读出视频流的链接 SHALL 直接播放；暂停、继续、跳转、音量、进度条 SHALL 与本地文件一致。

#### Scenario: 直链
- **WHEN** 用户输入 `/video https://example.com/a.mp4`
- **THEN** 不调用 yt-dlp，ffmpeg 与 ffplay 直接读这个链接，面板开始播放

#### Scenario: 网络视频跳转
- **WHEN** 正在播放网络视频，用户按 `l`
- **THEN** 新的段从 10 秒后开始，ffmpeg 与 ffplay 读的仍是同一地址

### Requirement: 网页链接解析
ffprobe 读不出视频流的链接 SHALL 交给本机 yt-dlp 解析（单个视频、不展开播放列表），选短边不超过 480 的清晰度并优先 H.264；解析结果有分开的画面与声音地址时，画面 SHALL 读画面地址、声音 SHALL 读声音地址；解析给出的请求头 SHALL 随每次 ffprobe、ffmpeg、ffplay 请求一起发送。

#### Scenario: B 站链接
- **WHEN** 用户输入 `/video https://www.bilibili.com/video/BV1GJ411x7h7`
- **THEN** yt-dlp 解析出画面与声音两个地址，ffmpeg 带着 Referer 等请求头读画面地址，ffplay 读声音地址，面板开始播放

#### Scenario: 没装 yt-dlp
- **WHEN** 网页链接 ffprobe 读不出视频且本机没有 yt-dlp
- **THEN** 不开始播放，回复「播放网页链接需要 yt-dlp：brew install yt-dlp」

### Requirement: 网络播放的降级
解析失败、链接是直播或拿不到时长时 SHALL 不开始播放并回复一行原因；播放中网络读取失败（包括地址过期）SHALL 按解码失败处理，面板显示一行原因。

#### Scenario: 直播
- **WHEN** yt-dlp 返回的是直播
- **THEN** 不开始播放，回复「不支持直播」

#### Scenario: 解析失败
- **WHEN** yt-dlp 退出码非 0
- **THEN** 不开始播放，回复「解析不了这个链接」并附 yt-dlp 错误的前 200 个字符

### Requirement: 音画对齐
有声音时，ffplay 报告出第一个声音时钟后，画面时钟 SHALL 对齐到这个位置：声音比画面晚时画面停在当前帧等声音追上，SHALL NOT 回退已显示的帧。每次 ffplay 重新起播（继续、跳转、调音量）SHALL 重新对齐一次。静音或没有声音时画面时钟照旧从第一帧开始。

#### Scenario: 声音晚到
- **WHEN** 画面已经走了 0.7 秒，ffplay 才报告声音位于段起点 0.0 秒
- **THEN** 画面停在当前帧约 0.7 秒，之后与声音同步推进

#### Scenario: 静音
- **WHEN** 静音播放
- **THEN** 不起 ffplay，画面从第一帧起按真实时间推进
