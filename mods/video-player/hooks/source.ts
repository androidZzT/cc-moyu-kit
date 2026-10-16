// Pure network-source logic: which inputs are links, the yt-dlp command line and reading its answer.

/** An address ffmpeg, ffprobe and ffplay read, with the request headers it needs (none for a local file). */
export type Media = Readonly<{ url: string; headers: Readonly<Record<string, string>> }>
export type Resolved = Readonly<{ video: Media; audio: Media; isLive: boolean }>

/** Short side of the picture asked for: frames are decoded 640 wide, so more is wasted bandwidth. */
export const MAX_SHORT_SIDE = 480

const URL_PATTERN = /^https?:\/\/\S+$/

export const isUrl = (text: string): boolean => URL_PATTERN.test(text)

/** A local path or a direct link, read as it is with no request headers. */
export const plainMedia = (url: string): Media => ({ url, headers: {} })

/** One video (no playlist), picture plus sound or one combined format, short side up to 480, H.264 first. */
export const ytdlpArgv = (url: string): readonly string[] => [
  'yt-dlp', '-j', '--no-playlist', '--no-warnings', '-f', 'bv*+ba/b', '-S', `res:${MAX_SHORT_SIDE},vcodec:avc`, '--', url,
]

type Format = { url?: unknown; vcodec?: unknown; acodec?: unknown; http_headers?: unknown }

/** Only string-valued headers are kept. */
const readHeaders = (value: unknown): Record<string, string> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}

const mediaOf = (format: Format | undefined): Media | undefined =>
  format !== undefined && typeof format.url === 'string' && isUrl(format.url)
    ? { url: format.url, headers: readHeaders(format.http_headers) }
    : undefined

const hasCodec = (codec: unknown): boolean => typeof codec === 'string' && codec !== 'none'

/** yt-dlp's `-j` answer as the picture and sound to read; undefined when it names no usable http(s) address. */
export const parseYtdlp = (stdout: string): Resolved | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const info = parsed as Format & { requested_formats?: unknown; is_live?: unknown }
  const isLive = info.is_live === true
  const formats: readonly Format[] = Array.isArray(info.requested_formats) ? info.requested_formats : []
  if (formats.length === 0) {
    const media = mediaOf(info)
    return media === undefined ? undefined : { video: media, audio: media, isLive }
  }
  const video = mediaOf(formats.find(format => hasCodec(format.vcodec)))
  const audio = mediaOf(formats.find(format => hasCodec(format.acodec) && !hasCodec(format.vcodec))) ?? video
  return video === undefined || audio === undefined ? undefined : { video, audio, isLive }
}

/** `-headers` with each header on its own CRLF-ended line, or nothing when there are none. */
export const headersArgs = (headers: Readonly<Record<string, string>>): readonly string[] => {
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`)
  return lines.length === 0 ? [] : ['-headers', lines.join('')]
}
