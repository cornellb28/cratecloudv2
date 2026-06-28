import { useRef, useEffect, useState } from 'react'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useLibraryStore } from '../stores/useLibraryStore'

const BAR_COUNT = 120

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PlayerBar(): React.JSX.Element | null {
  const {
    currentTrack, isPlaying, volume, currentTime, duration,
    setIsPlaying, togglePlay, setVolume, setCurrentTime, setDuration, playTrack,
  } = usePlayerStore()
  const { allTracks } = useLibraryStore()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [audioPort, setAudioPort] = useState<number>(0)

  // Fetch server port once on mount
  useEffect(() => {
    window.api.audio.serverPort().then((port) => {
      console.log('[PlayerBar] audio server port:', port)
      setAudioPort(port)
    })
  }, [])

  // Build the URL only when we have both a track and a port.
  // null means "nothing to play yet".
  // encodeURI preserves path separators; encodeURIComponent would turn / into %2F
  // which Chromium rejects for audio src paths.
  const trackUrl =
    audioPort > 0 && currentTrack?.filepath
      ? `http://127.0.0.1:${audioPort}${encodeURI(currentTrack.filepath)}`
      : null

  // Single consolidated effect — never calls play() without a real src.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!trackUrl) {
      audio.pause()
      return
    }

    if (audio.src !== trackUrl) {
      // New track or port just resolved — load first, then play
      console.log('[PlayerBar] loading src:', trackUrl)
      audio.src = trackUrl
      audio.load()
      if (isPlaying) {
        audio.play().catch((err) => console.error('[PlayerBar] play error:', err))
      }
    } else {
      // Same track, user toggled play/pause
      if (isPlaying) audio.play().catch((err) => console.error('[PlayerBar] play error:', err))
      else audio.pause()
    }
  }, [trackUrl, isPlaying])

  // Volume stays separate — no side-effects on playback
  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume])

  if (!currentTrack) return null

  const progress = duration > 0 ? currentTime / duration : 0

  const raw = currentTrack.waveform
  const wavePoints = Array.from({ length: BAR_COUNT }, (_, i) => {
    if (!raw || raw.length === 0) return 0.3
    return raw[Math.floor((i * raw.length) / BAR_COUNT)] ?? 0
  })
  const maxAmp = Math.max(...wavePoints, 0.01)
  const playedBars = Math.round(progress * BAR_COUNT)

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const audio = audioRef.current
    if (audio && isFinite(audio.duration)) {
      audio.currentTime = ratio * audio.duration
      setCurrentTime(ratio * audio.duration)
    }
  }

  const queue = allTracks().filter((t) => t.filepath)
  const currentIdx = queue.findIndex((t) => t.id === currentTrack.id)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < queue.length - 1

  const playNext = () => { if (hasNext) playTrack(queue[currentIdx + 1]) }
  const playPrev = () => { if (currentIdx > 0) playTrack(queue[currentIdx - 1]) }

  const volIcon = volume === 0 ? '🔇' : volume < 0.4 ? '🔉' : '🔊'

  return (
    <div className="player-bar">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onEnded={playNext}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={(e) => {
          const err = e.currentTarget.error
          console.error('[PlayerBar] audio error code:', err?.code, 'message:', err?.message, 'src:', e.currentTarget.src)
        }}
      />

      <div className="player-controls">
        <button className="player-btn" onClick={playPrev} disabled={!hasPrev} title="Previous">⏮</button>
        <button className="player-btn player-play-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="player-btn" onClick={playNext} disabled={!hasNext} title="Next">⏭</button>
      </div>

      <div className="player-info">
        <div className="player-title">{currentTrack.title}</div>
        <div className="player-meta">
          {currentTrack.artist || ''}
          {currentTrack.format ? ` · ${currentTrack.format}` : ''}
          {currentTrack.bpm ? ` · ${currentTrack.bpm} BPM` : ''}
        </div>
      </div>

      <div className="player-wave" onClick={handleSeek} title="Click to seek">
        {wavePoints.map((h, i) => (
          <div
            key={i}
            className={`pw-bar${i < playedBars ? ' pw-played' : ''}`}
            style={{ height: `${Math.max(2, Math.round((h / maxAmp) * 38))}px` }}
          />
        ))}
        <div className="pw-head" style={{ left: `${progress * 100}%` }} />
      </div>

      <div className="player-time">
        <span>{formatTime(currentTime)}</span>
        <span className="player-time-sep">/</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="player-volume">
        <span className="player-vol-icon">{volIcon}</span>
        <input
          className="player-vol-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  )
}
