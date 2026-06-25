export type Track = {
  id: number
  title: string
  artist: string
  bpm: string
  key: string
  genre: string
  energy: string
  filepath?: string
  camelot?: string
  openkey?: string
  duration_str?: string
  duration_sec?: number
  waveform?: number[]
  file_size_mb?: number
  format?: string
  album?: string
  year?: string
}

export const COLUMN_COLORS: Record<string, string> = {
  Untagged: '#888',
  Tagged: '#378add',
  'Crate ready': '#1d9e75',
  'Gig ready': '#7f77dd',
}

export const INITIAL_COLUMNS: Record<string, Track[]> = {
  Untagged: [
    { id: 1, title: 'Midnight Signal', artist: 'Blvck Jvck', bpm: '', key: '', genre: '', energy: '' },
    { id: 2, title: 'Pressure Drop', artist: 'Sole B', bpm: '', key: '', genre: '', energy: '' },
    { id: 3, title: 'Raw Frequency', artist: 'Dali M', bpm: '', key: '', genre: '', energy: '' },
  ],
  Tagged: [
    { id: 4, title: 'Solar Apex', artist: 'Kenji Rō', bpm: '128', key: '8A', genre: 'Tech House', energy: '7' },
    { id: 5, title: 'Dust & Chrome', artist: 'Femke V', bpm: '130', key: '11B', genre: 'Techno', energy: '8' },
    { id: 6, title: 'Neon Griot', artist: 'Asa Oke', bpm: '126', key: '3A', genre: 'Afro House', energy: '6' },
  ],
  'Crate ready': [
    { id: 7, title: 'Afterglow', artist: 'Pari S', bpm: '132', key: '8B', genre: 'Tech House', energy: '9' },
    { id: 8, title: 'Horizon Pulse', artist: 'Kenji Rō', bpm: '124', key: '5A', genre: 'Deep House', energy: '5' },
  ],
  'Gig ready': [
    { id: 9, title: 'Peak Theory', artist: 'Dali M', bpm: '134', key: '8A', genre: 'Techno', energy: '10' },
    { id: 10, title: 'Open Channel', artist: 'Sole B', bpm: '127', key: '11A', genre: 'Afro House', energy: '7' },
  ],
}
