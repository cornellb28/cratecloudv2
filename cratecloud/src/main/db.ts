import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

export type DbTrackRow = {
  id: number
  title: string
  artist: string
  bpm: string
  key_val: string
  genre: string
  energy: string
  column_name: string
  folder: string | null
  filepath: string | null
  camelot: string | null
  openkey: string | null
  duration_str: string | null
  duration_sec: number | null
  file_size_mb: number | null
  format: string | null
  album: string | null
  year: string | null
  waveform: string | null
}

export type DbTrackInsert = Omit<DbTrackRow, 'id'>

let _db: Database.Database | null = null

function db(): Database.Database {
  if (!_db) {
    _db = new Database(join(app.getPath('userData'), 'library.db'))
    _db.pragma('journal_mode = WAL')
    _db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL DEFAULT '',
        artist       TEXT    DEFAULT '',
        bpm          TEXT    DEFAULT '',
        key_val      TEXT    DEFAULT '',
        genre        TEXT    DEFAULT '',
        energy       TEXT    DEFAULT '',
        column_name  TEXT    NOT NULL DEFAULT 'Untagged',
        folder       TEXT,
        filepath     TEXT,
        camelot      TEXT,
        openkey      TEXT,
        duration_str TEXT,
        duration_sec REAL,
        file_size_mb REAL,
        format       TEXT,
        album        TEXT,
        year         TEXT,
        waveform     TEXT
      );
    `)
  }
  return _db
}

export function getAllTracks(): DbTrackRow[] {
  return db().prepare('SELECT * FROM tracks ORDER BY id').all() as DbTrackRow[]
}

export function insertTracks(rows: DbTrackInsert[]): number[] {
  if (!rows.length) return []
  const stmt = db().prepare(`
    INSERT INTO tracks
      (title, artist, bpm, key_val, genre, energy, column_name, folder, filepath,
       camelot, openkey, duration_str, duration_sec, file_size_mb, format, album, year, waveform)
    VALUES
      (@title, @artist, @bpm, @key_val, @genre, @energy, @column_name, @folder, @filepath,
       @camelot, @openkey, @duration_str, @duration_sec, @file_size_mb, @format, @album, @year, @waveform)
  `)
  const insertAll = db().transaction((rows: DbTrackInsert[]) =>
    rows.map((row) => Number(stmt.run(row).lastInsertRowid))
  )
  return insertAll(rows)
}

export function updateTrackFields(id: number, fields: Record<string, unknown>): void {
  const keys = Object.keys(fields)
  if (!keys.length) return
  const setClauses = keys.map((k) => `${k} = @${k}`).join(', ')
  db()
    .prepare(`UPDATE tracks SET ${setClauses} WHERE id = @id`)
    .run({ ...fields, id })
}

export function deleteTracks(ids: number[]): void {
  if (!ids.length) return
  db()
    .prepare(`DELETE FROM tracks WHERE id IN (SELECT value FROM json_each(?))`)
    .run(JSON.stringify(ids))
}

export function moveTracksToColumn(ids: number[], column_name: string): void {
  if (!ids.length) return
  db()
    .prepare(`UPDATE tracks SET column_name = ? WHERE id IN (SELECT value FROM json_each(?))`)
    .run(column_name, JSON.stringify(ids))
}
