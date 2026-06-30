export type Track = {
  id: number
  title: string
  artist: string
  bpm: string
  key: string
  genre: string
  energy: string
  folder?: string        // basename of the imported folder, for Library grouping
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
  remixer?: string
  grouping?: string
  composer?: string
  comment?: string
  label?: string
  artwork_path?: string
}

export type Crate = {
  id: number
  name: string
  color: string
  trackIds: Set<number>
}

export const CRATE_COLORS = [
  '#7f77dd', '#378add', '#1d9e75', '#d85a30', '#d4537e',
  '#ba7517', '#3d9e9e', '#9e3d9e', '#5a9e3d', '#c45c8a',
]

export type Setlist = {
  id: string
  name: string
  group: string
  date?: string
  venue?: string
  trackIds: number[]
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
    { id: 4, title: 'Solar Apex', artist: 'Kenji Rō', bpm: '128', key: '8A', genre: 'Tech House', energy: '7', duration_str: '6:24', format: 'MP3' },
    { id: 5, title: 'Dust & Chrome', artist: 'Femke V', bpm: '130', key: '11B', genre: 'Techno', energy: '8', duration_str: '7:12', format: 'MP3' },
    { id: 6, title: 'Neon Griot', artist: 'Asa Oke', bpm: '126', key: '3A', genre: 'Afro House', energy: '6', duration_str: '6:48', format: 'FLAC' },
  ],
  'Crate ready': [
    { id: 7, title: 'Afterglow', artist: 'Pari S', bpm: '132', key: '8B', genre: 'Tech House', energy: '9', duration_str: '8:05', format: 'MP3' },
    { id: 8, title: 'Horizon Pulse', artist: 'Kenji Rō', bpm: '124', key: '5A', genre: 'Deep House', energy: '5', duration_str: '7:33', format: 'FLAC' },
  ],
  'Gig ready': [
    { id: 9, title: 'Peak Theory', artist: 'Dali M', bpm: '134', key: '8A', genre: 'Techno', energy: '10', duration_str: '9:14', format: 'MP3' },
    { id: 10, title: 'Open Channel', artist: 'Sole B', bpm: '127', key: '11A', genre: 'Afro House', energy: '7', duration_str: '6:57', format: 'MP3' },
  ],
}

export const INITIAL_SETLISTS: Setlist[] = [
  {
    id: 'sl-1',
    name: 'Friday club set',
    group: 'The Collective',
    date: '2026-06-20',
    venue: 'Fabric, London',
    trackIds: [9, 10, 7],
  },
  {
    id: 'sl-2',
    name: 'Festival 2026',
    group: 'The Collective',
    date: '2026-08-15',
    venue: 'Glastonbury',
    trackIds: [4, 5, 6, 8],
  },
]
