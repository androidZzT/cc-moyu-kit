export type PlayerStatus = 'idle' | 'decoding' | 'playing' | 'paused' | 'done' | 'error'

/** What the pane draws from; frame-by-frame counters stay out of state so a swap never redraws. */
export type Player = {
  status: PlayerStatus
  /** This playback's frame directory; absent once it is removed. */
  dir?: string
  width: number
  height: number
  /** One-line status or error under the picture. */
  line: string
}

declare module 'claude-code' {
  interface PluginState {
    'video-player': {
      player: Player
    }
  }
}
