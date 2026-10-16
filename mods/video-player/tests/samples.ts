// yt-dlp -j output, trimmed from a real Bilibili run (2026-10-16) to the fields the mod reads.

const HEADERS = { 'User-Agent': 'UA', Referer: 'https://www.bilibili.com/' }

export const BILI_JSON = JSON.stringify({
  title: 'sample',
  duration: 212.393,
  is_live: null,
  requested_formats: [
    { format_id: '30032', vcodec: 'avc1.64001F', acodec: 'none', url: 'https://upos.bilivideo.com/v-30032.m4s?e=1', http_headers: HEADERS },
    { format_id: '30280', vcodec: 'none', acodec: 'mp4a.40.2', url: 'https://upos.bilivideo.com/a-30280.m4s?e=1', http_headers: HEADERS },
  ],
})

export const COMBINED_JSON = JSON.stringify({
  duration: 60,
  is_live: false,
  url: 'https://cdn.example/v.mp4',
  vcodec: 'avc1',
  acodec: 'mp4a',
  http_headers: { 'User-Agent': 'UA', Bogus: 3 },
})

export const LIVE_JSON = JSON.stringify({ is_live: true, url: 'https://live.example/x.m3u8', http_headers: {} })

/** ffprobe on the resolved picture address: video only, 852×480, 3:32. */
export const BILI_VIDEO_PROBE = '{"streams":[{"codec_type":"video","width":852,"height":480}],"format":{"duration":"212.261000"}}'
