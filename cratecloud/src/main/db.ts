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
  remixer: string | null
  grouping: string | null
  composer: string | null
  comment: string | null
  label: string | null
  waveform: string | null
}

export type DbTrackInsert = Omit<DbTrackRow, 'id'>

export type CrateRow = {
  id: number
  name: string
  color: string
  created_at: number
}

export type TagRow = {
  id: number
  field: string
  value: string
  color: string
}

let _db: Database.Database | null = null

function db(): Database.Database {
  if (!_db) {
    _db = new Database(join(app.getPath('userData'), 'library.db'))
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')

    // Stage 1: create all tables (always safe — IF NOT EXISTS)
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
        remixer      TEXT,
        grouping     TEXT,
        composer     TEXT,
        comment      TEXT,
        label        TEXT,
        waveform     TEXT
      );
      CREATE TABLE IF NOT EXISTS _schema_migrations (name TEXT PRIMARY KEY);
      INSERT OR IGNORE INTO _schema_migrations VALUES ('add_extended_fields_v2');
      CREATE TABLE IF NOT EXISTS crates (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        color      TEXT    NOT NULL DEFAULT '#7f77dd',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS tags (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        field TEXT    NOT NULL,
        value TEXT    NOT NULL,
        color TEXT    NOT NULL DEFAULT '#7f77dd',
        UNIQUE(field, value)
      );
      CREATE TABLE IF NOT EXISTS crate_tracks (
        crate_id   INTEGER NOT NULL REFERENCES crates(id) ON DELETE CASCADE,
        track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        added_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY (crate_id, track_id)
      );
    `)

    // Stage 2: ALTER TABLE for existing DBs missing columns
    const existing = _db.prepare('PRAGMA table_info(tracks)').all() as { name: string }[]
    const colNames = new Set(existing.map((c) => c.name))
    for (const col of ['remixer', 'grouping', 'composer', 'comment', 'label']) {
      if (!colNames.has(col)) {
        _db.exec(`ALTER TABLE tracks ADD COLUMN ${col} TEXT`)
      }
    }

    // Stage 3: deduplicate tracks before adding unique index
    // (pre-existing DBs may have duplicates from before INSERT OR IGNORE was added)
    _db.exec(`
      DELETE FROM tracks
      WHERE id NOT IN (
        SELECT MIN(id) FROM tracks WHERE filepath IS NOT NULL GROUP BY filepath
      ) AND filepath IS NOT NULL
    `)

    // Stage 4: unique filepath index — separate so a failure here never blocks the rest
    try {
      _db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_filepath
         ON tracks(filepath) WHERE filepath IS NOT NULL`
      )
    } catch {
      // Index may already exist with a different definition; non-fatal
    }
  }
  return _db
}

export function getAllTracks(): DbTrackRow[] {
  return db().prepare('SELECT * FROM tracks ORDER BY id').all() as DbTrackRow[]
}

export function insertTracks(rows: DbTrackInsert[]): number[] {
  if (!rows.length) return []
  const stmt = db().prepare(`
    INSERT OR IGNORE INTO tracks
      (title, artist, bpm, key_val, genre, energy, column_name, folder, filepath,
       camelot, openkey, duration_str, duration_sec, file_size_mb, format, album, year,
       remixer, grouping, composer, comment, label, waveform)
    VALUES
      (@title, @artist, @bpm, @key_val, @genre, @energy, @column_name, @folder, @filepath,
       @camelot, @openkey, @duration_str, @duration_sec, @file_size_mb, @format, @album, @year,
       @remixer, @grouping, @composer, @comment, @label, @waveform)
  `)
  const insertAll = db().transaction((rows: DbTrackInsert[]) =>
    rows.map((row) => Number(stmt.run(row).lastInsertRowid))
  )
  return insertAll(rows)
}

export function updateTrackFields(id: number, fields: Record<string, unknown>): void {
  const keys = Object.keys(fields)
  if (!keys.length) return
  // Sanitize: SQLite3 only accepts null/number/string/bigint/Buffer.
  // undefined → null; arrays/objects (e.g. waveform: number[]) → JSON string.
  const safe: Record<string, unknown> = {}
  for (const k of keys) {
    const v = fields[k]
    if (v === undefined) safe[k] = null
    else if (Array.isArray(v) || (typeof v === 'object' && v !== null)) safe[k] = JSON.stringify(v)
    else safe[k] = v
  }
  const setClauses = keys.map((k) => `${k} = @${k}`).join(', ')
  db()
    .prepare(`UPDATE tracks SET ${setClauses} WHERE id = @id`)
    .run({ ...safe, id })
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

// ── Crates ────────────────────────────────────────────────────────────────────

export function getCrates(): CrateRow[] {
  return db().prepare('SELECT * FROM crates ORDER BY created_at').all() as CrateRow[]
}

export function insertCrate(name: string, color: string): number {
  return Number(
    db().prepare('INSERT INTO crates (name, color) VALUES (?, ?)').run(name, color).lastInsertRowid
  )
}

export function updateCrateRow(id: number, name: string, color: string): void {
  db().prepare('UPDATE crates SET name = ?, color = ? WHERE id = ?').run(name, color, id)
}

export function deleteCrateRow(id: number): void {
  db().prepare('DELETE FROM crates WHERE id = ?').run(id)
}

export function getAllCrateTrackIds(): { crate_id: number; track_id: number }[] {
  return db()
    .prepare('SELECT crate_id, track_id FROM crate_tracks ORDER BY added_at')
    .all() as { crate_id: number; track_id: number }[]
}

export function addTracksToCrate(crateId: number, trackIds: number[]): void {
  if (!trackIds.length) return
  const stmt = db().prepare('INSERT OR IGNORE INTO crate_tracks (crate_id, track_id) VALUES (?, ?)')
  db().transaction(() => { for (const id of trackIds) stmt.run(crateId, id) })()
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export function getTags(): TagRow[] {
  return db().prepare('SELECT * FROM tags ORDER BY field, value').all() as TagRow[]
}

export function insertTag(field: string, value: string, color: string): number {
  const result = db()
    .prepare('INSERT OR IGNORE INTO tags (field, value, color) VALUES (?, ?, ?)')
    .run(field, value, color)
  return result.changes > 0 ? Number(result.lastInsertRowid) : -1
}

export function deleteTag(id: number): void {
  db().prepare('DELETE FROM tags WHERE id = ?').run(id)
}

export function updateTag(id: number, value: string, color: string): void {
  db().prepare('UPDATE tags SET value = ?, color = ? WHERE id = ?').run(value, color, id)
}

export function removeTracksFromCrate(crateId: number, trackIds: number[]): void {
  if (!trackIds.length) return
  db()
    .prepare(
      `DELETE FROM crate_tracks WHERE crate_id = ? AND track_id IN (SELECT value FROM json_each(?))`
    )
    .run(crateId, JSON.stringify(trackIds))
}
