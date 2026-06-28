import { create } from 'zustand'
import type { Track } from '../types/track'

type PlayerState = {
  currentTrack: Track | null
  isPlaying: boolean
  volume: number
  currentTime: number
  duration: number

  playTrack: (track: Track) => void
  setIsPlaying: (v: boolean) => void
  togglePlay: () => void
  setVolume: (v: number) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  volume: 0.8,
  currentTime: 0,
  duration: 0,

  playTrack: (track) => set({ currentTrack: track, isPlaying: true, currentTime: 0, duration: 0 }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  togglePlay: () => {
    const { isPlaying } = get()
    set({ isPlaying: !isPlaying })
  },
  setVolume: (v) => set({ volume: v }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
}))
