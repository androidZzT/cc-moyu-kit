// Pure planning for frame directories: where they live and which ones an earlier session left behind.

const ROOT_NAME = 'cc-moyu-video'
const FALLBACK_TMPDIR = '/tmp'
/** A playing directory changes every second; one untouched this long was left by an interrupted session. */
export const STALE_MINUTES = 10

/** The root every playback's directory sits under, inside the temp dir. */
export const frameRoot = (tmpdir: string | undefined): string =>
  `${(tmpdir ?? FALLBACK_TMPDIR).replace(/\/+$/, '')}/${ROOT_NAME}`

export const staleArgv = (root: string): readonly string[] => [
  'find', root, '-mindepth', '1', '-maxdepth', '1', '-type', 'd', '-mmin', `+${STALE_MINUTES}`,
]

/** The direct children of `root` that find printed; anything else is dropped so a removal never leaves the root. */
export const parseStale = (stdout: string, root: string): readonly string[] =>
  stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      const name = line.slice(root.length + 1)
      return line.startsWith(`${root}/`) && /^[\w.-]+$/.test(name) && name !== '.' && name !== '..'
    })
