import { basename, extname } from 'path'

// Standalone export module — pure string generation only. Actual file
// dialogs and disk writes live in index.ts's IPC handlers (Section 2), same
// separation of concerns as reconcile.ts vs. its callers.

export interface ExportTrack {
  id: number
  filepath: string
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  bpm: number | null
  key_camelot: string | null
  key_openkey: string | null
  energy: number | null
  duration_sec: number | null
}

export interface ExportCrate {
  id: number
  name: string
  trackIds: number[]
}

function escapeXml(value: string): string {
  // & first — escaping it after the others would double-escape the
  // ampersands those replacements just introduced (e.g. &lt; → &amp;lt;).
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Falls back to the filename (minus extension) when a track has no title —
// shared by both formats so an untitled track reads the same way in either.
function titleFallback(filepath: string): string {
  const base = basename(filepath)
  const ext = extname(base)
  return ext ? base.slice(0, -ext.length) : base
}

// rekordbox's Location attribute is a file:// URI, not a raw path — Windows
// paths use backslashes on disk but need forward slashes (and a leading
// slash before the drive letter) to form a valid URI; POSIX paths already
// have forward slashes and a leading slash, so they pass through unchanged.
function toFileUri(filepath: string): string {
  const forwardSlashed = filepath.replace(/\\/g, '/')
  const withLeadingSlash = /^[a-zA-Z]:\//.test(forwardSlashed) ? `/${forwardSlashed}` : forwardSlashed
  return `file://localhost${encodeURI(withLeadingSlash)}`
}

export function generateRekordboxXML(tracks: ExportTrack[], crates: ExportCrate[]): string {
  const trackEntries = tracks
    .map((t) => {
      const name = t.title || titleFallback(t.filepath)
      const totalTime = t.duration_sec != null ? String(Math.round(t.duration_sec)) : '0'
      const averageBpm = t.bpm != null ? t.bpm.toFixed(2) : '0.00'
      const attrs = [
        `TrackID="${escapeXml(String(t.id))}"`,
        `Name="${escapeXml(name)}"`,
        `Artist="${escapeXml(t.artist ?? '')}"`,
        `Album="${escapeXml(t.album ?? '')}"`,
        `Genre="${escapeXml(t.genre ?? '')}"`,
        `TotalTime="${totalTime}"`,
        `Tonality="${escapeXml(t.key_camelot ?? '')}"`,
        `AverageBpm="${averageBpm}"`,
        `Rating="0"`,
        `Location="${escapeXml(toFileUri(t.filepath))}"`,
        `Colour="#7F77DD"`,
      ]
      return `      <TRACK ${attrs.join(' ')}/>`
    })
    .join('\n')

  const playlistNodes = crates
    .map((c) => {
      const trackRefs = c.trackIds
        .map((id) => `        <TRACK Key="${escapeXml(String(id))}"/>`)
        .join('\n')
      return (
        `      <NODE Type="1" Name="${escapeXml(c.name)}" Count="${c.trackIds.length}" KeyType="0">\n` +
        (trackRefs ? `${trackRefs}\n` : '') +
        `      </NODE>`
      )
    })
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<DJ_PLAYLISTS Version="1.0.0">\n` +
    `  <PRODUCT Name="CrateCloud" Version="1.0" Company="CrateCloud"/>\n` +
    `  <COLLECTION Entries="${tracks.length}">\n` +
    (trackEntries ? `${trackEntries}\n` : '') +
    `  </COLLECTION>\n` +
    `  <PLAYLISTS>\n` +
    `    <NODE Type="0" Name="ROOT" Count="${crates.length}">\n` +
    (playlistNodes ? `${playlistNodes}\n` : '') +
    `    </NODE>\n` +
    `  </PLAYLISTS>\n` +
    `</DJ_PLAYLISTS>\n`
  )
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, '_').trim()
  return cleaned || 'Untitled'
}

// Second line (#PLAYLIST:) is a standard Extended M3U tag — the only place
// crateName is actually used, since the per-track lines never reference it.
export function generateSeratoM3U(tracks: ExportTrack[], crateName: string): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${crateName}`]
  for (const t of tracks) {
    const duration = t.duration_sec != null ? Math.round(t.duration_sec) : 0
    const artist = t.artist ?? ''
    const title = t.title || titleFallback(t.filepath)
    lines.push(`#EXTINF:${duration},${artist} - ${title}`)
    lines.push(t.filepath)
  }
  return lines.join('\n') + '\n'
}

// key format: "{CrateName}.m3u8", plus "All Tracks.m3u8" for everything.
// Names are sanitized for filesystem safety and de-duplicated so two crates
// that sanitize to the same name (or a crate literally named "All Tracks")
// don't silently overwrite each other's file once Section 2 writes the map.
export function generateAllSeratoM3U(
  tracks: ExportTrack[],
  crates: ExportCrate[]
): Map<string, string> {
  const result = new Map<string, string>()
  const byId = new Map(tracks.map((t) => [t.id, t]))

  const uniqueKey = (base: string): string => {
    if (!result.has(base)) return base
    const ext = extname(base)
    const stem = base.slice(0, -ext.length)
    let i = 2
    while (result.has(`${stem} (${i})${ext}`)) i++
    return `${stem} (${i})${ext}`
  }

  for (const crate of crates) {
    const crateTracks = crate.trackIds
      .map((id) => byId.get(id))
      .filter((t): t is ExportTrack => !!t)
    const key = uniqueKey(`${sanitizeFilename(crate.name)}.m3u8`)
    result.set(key, generateSeratoM3U(crateTracks, crate.name))
  }

  const allKey = uniqueKey('All Tracks.m3u8')
  result.set(allKey, generateSeratoM3U(tracks, 'All Tracks'))

  return result
}
