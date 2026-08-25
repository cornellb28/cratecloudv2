import Database from 'better-sqlite3'
import { join, basename } from 'path'
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
  status_is_manual: number
  folder: string | null
  folder_id: number | null
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
  artwork_path: string | null
  created_at: number | null
  updated_at: number | null
  // Real on-disk modification time (epoch seconds) — distinct from
  // created_at/updated_at, which are CrateCloud's own bookkeeping. Lets a
  // future pass ask "has this file changed since we last analyzed it" without
  // re-reading/re-hashing every file.
  last_modified: number | null
  filename: string | null
  client_uuid: string | null
  // Cheap fingerprint (sha256 of a 64KB slice ~40% into the file, skipping
  // metadata containers at the head/tail) — captured once at import time so
  // it survives after the file itself goes missing. Null for tracks imported
  // before this column existed; those just can't use the hash tie-break.
  partial_hash: string | null
  // Set when a rescan can't find the file at its stored path; cleared on relink.
  missing_since: number | null
}

export type DismissedDuplicatePair = {
  track_id_a: number
  track_id_b: number
  dismissed_at: number
}

export type FolderRow = {
  id: number
  name: string
  parent_folder_id: number | null
  created_at: number
  updated_at: number | null
  // Absolute on-disk directory this folder corresponds to. Only ever set at
  // import time, when the real root path is known — never inferred from a
  // child track's filepath (folder_id can be logically reassigned without
  // moving the file, so that would be a guess, not a fact). NULL for
  // manually-created folders and for folders imported before this column
  // existed; such folders can't be a drag-move destination.
  path: string | null
  // Which registered library_roots row this folder's tree belongs to, if
  // any. NULL for folders spawned by a one-time "Add Files" import (see
  // useImport.ts) or created manually — those are never a registered root.
  root_folder_id: number | null
}

export type LibraryRootStatus = 'online' | 'offline' | 'missing'

export type LibraryRootRow = {
  id: number
  name: string
  path: string
  created_at: number
  last_scanned_at: number | null
  status: LibraryRootStatus
}

export type BoardRow = {
  id: number
  name: string
  color: string
  position: number
  created_at: number
  criteria: string | null  // JSON-encoded string[] | null = manual-only
}

// created_at/updated_at/client_uuid/missing_since are all set server-side at insert
// time (strftime/randomblob defaults, or NULL) — callers never supply them.
export type DbTrackInsert = Omit<
  DbTrackRow,
  'id' | 'created_at' | 'updated_at' | 'client_uuid' | 'missing_since'
>

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
        waveform     TEXT,
        artwork_path TEXT,
        created_at   INTEGER,
        last_modified INTEGER,
        filename     TEXT
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
      CREATE TABLE IF NOT EXISTS setlists (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS setlist_tracks (
        setlist_id INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
        track_id   INTEGER NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
        position   INTEGER NOT NULL DEFAULT 0,
        UNIQUE(setlist_id, track_id)
      );
      CREATE TABLE IF NOT EXISTS bookmarks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        url        TEXT    NOT NULL,
        label      TEXT    NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS library_roots (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        name             TEXT    NOT NULL,
        path             TEXT    NOT NULL UNIQUE,
        created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        last_scanned_at  INTEGER,
        status           TEXT    NOT NULL DEFAULT 'online'
      );
      CREATE TABLE IF NOT EXISTS folders (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        name             TEXT    NOT NULL,
        parent_folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at       INTEGER,
        path             TEXT,
        root_folder_id   INTEGER REFERENCES library_roots(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS boards (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        color      TEXT    NOT NULL DEFAULT '#888888',
        position   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS dismissed_duplicate_pairs (
        track_id_a   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        track_id_b   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        dismissed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY (track_id_a, track_id_b)
      );
    `)

    // Stage 2: ALTER TABLE for existing DBs missing columns
    const existing = _db.prepare('PRAGMA table_info(tracks)').all() as { name: string }[]
    const colNames = new Set(existing.map((c) => c.name))
    for (const col of ['remixer', 'grouping', 'composer', 'comment', 'label', 'artwork_path']) {
      if (!colNames.has(col)) {
        _db.exec(`ALTER TABLE tracks ADD COLUMN ${col} TEXT`)
      }
    }
    if (!colNames.has('folder_id')) {
      _db.exec(`ALTER TABLE tracks ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL`)
    }
    if (!colNames.has('status_is_manual')) {
      _db.exec(`ALTER TABLE tracks ADD COLUMN status_is_manual INTEGER NOT NULL DEFAULT 0`)
    }
    if (!colNames.has('created_at')) {
      // Nullable — existing rows have no known "date added", new inserts set it explicitly
      _db.exec(`ALTER TABLE tracks ADD COLUMN created_at INTEGER`)
    }
    if (!colNames.has('updated_at')) {
      _db.exec(`ALTER TABLE tracks ADD COLUMN updated_at INTEGER`)
    }
    if (!colNames.has('client_uuid')) {
      _db.exec(`ALTER TABLE tracks ADD COLUMN client_uuid TEXT`)
    }
    if (!colNames.has('partial_hash')) {
      _db.exec(`ALTER TABLE tracks ADD COLUMN partial_hash TEXT`)
    }
    if (!colNames.has('missing_since')) {
      _db.exec(`ALTER TABLE tracks ADD COLUMN missing_since INTEGER`)
    }
    if (!colNames.has('last_modified')) {
      _db.exec(`ALTER TABLE tracks ADD COLUMN last_modified INTEGER`)
    }
    if (!colNames.has('filename')) {
      _db.exec(`ALTER TABLE tracks ADD COLUMN filename TEXT`)
    }

    // Stage 2a2: backfill client_uuid for any row that predates the column.
    // Logical identity only (see decision doc) — not used as a join/lookup key
    // anywhere, so a SQLite-side random id is fine; no need for Node's crypto.
    _db.exec(`UPDATE tracks SET client_uuid = lower(hex(randomblob(16))) WHERE client_uuid IS NULL`)

    // Stage 2b: boards.criteria column
    const boardCols = _db.prepare('PRAGMA table_info(boards)').all() as { name: string }[]
    if (!new Set(boardCols.map((c) => c.name)).has('criteria')) {
      _db.exec(`ALTER TABLE boards ADD COLUMN criteria TEXT DEFAULT NULL`)
    }

    // Stage 2c: folders.path column — nullable, only ever populated at import
    // time going forward (see FolderRow). Existing rows stay NULL; never backfilled by inference.
    const folderCols = _db.prepare('PRAGMA table_info(folders)').all() as { name: string }[]
    if (!new Set(folderCols.map((c) => c.name)).has('path')) {
      _db.exec(`ALTER TABLE folders ADD COLUMN path TEXT`)
    }
    const folderColNames = new Set(
      (_db.prepare('PRAGMA table_info(folders)').all() as { name: string }[]).map((c) => c.name)
    )
    if (!folderColNames.has('updated_at')) {
      _db.exec(`ALTER TABLE folders ADD COLUMN updated_at INTEGER`)
    }
    if (!folderColNames.has('root_folder_id')) {
      _db.exec(`ALTER TABLE folders ADD COLUMN root_folder_id INTEGER REFERENCES library_roots(id) ON DELETE SET NULL`)
    }

    // Stage 2.5: seed default boards (runs once, guarded by migration table)
    const boardsSeeded = !!_db.prepare("SELECT 1 FROM _schema_migrations WHERE name = 'seed_boards_v1'").get()
    if (!boardsSeeded) {
      _db.exec(`
        INSERT OR IGNORE INTO boards (name, color, position) VALUES
          ('Untagged',    '#888888', 0),
          ('Tagged',      '#378add', 1),
          ('Crate ready', '#1d9e75', 2),
          ('Gig ready',   '#7f77dd', 3);
        INSERT INTO _schema_migrations VALUES ('seed_boards_v1');
      `)
    }

    // Stage 2.6: seed criteria on the three auto-computed default boards
    const criteriaSeeded = !!_db.prepare("SELECT 1 FROM _schema_migrations WHERE name = 'seed_board_criteria_v1'").get()
    if (!criteriaSeeded) {
      _db.exec(`
        UPDATE boards SET criteria = '[]'                             WHERE name = 'Untagged';
        UPDATE boards SET criteria = '["bpm","key","genre"]'          WHERE name = 'Tagged';
        UPDATE boards SET criteria = '["bpm","key","genre","energy"]' WHERE name = 'Crate ready';
        INSERT INTO _schema_migrations VALUES ('seed_board_criteria_v1');
      `)
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
    try {
      _db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_client_uuid
         ON tracks(client_uuid) WHERE client_uuid IS NOT NULL`
      )
    } catch {
      // non-fatal
    }

    // Stage 5: grouped-view indexes (Artists/Albums/Genres) — these fields
    // are queried/grouped constantly once a library reaches tens of
    // thousands of tracks; a full scan per view load doesn't hold up at scale.
    _db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_tracks_album  ON tracks(album);
      CREATE INDEX IF NOT EXISTS idx_tracks_genre  ON tracks(genre);
      CREATE INDEX IF NOT EXISTS idx_folders_root   ON folders(root_folder_id);
      CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_folder_id);
    `)
  }
  return _db
}

export function getAllTracks(): DbTrackRow[] {
  return db().prepare('SELECT * FROM tracks ORDER BY id').all() as DbTrackRow[]
}

export function getTrackById(id: number): DbTrackRow | undefined {
  return db().prepare('SELECT * FROM tracks WHERE id = ?').get(id) as DbTrackRow | undefined
}

// Same ORDER BY as getAllTracks() (id ascending) so pages concatenate into
// an identical result to a single getAllTracks() call — the renderer streams
// this in chunks purely to avoid one huge synchronous fetch/setState on
// large libraries, not to change what ends up loaded or in what order.
export function getTracksPaginated(offset: number, limit: number): DbTrackRow[] {
  return db()
    .prepare('SELECT * FROM tracks ORDER BY id LIMIT ? OFFSET ?')
    .all(limit, offset) as DbTrackRow[]
}

export function getTracksCount(): number {
  const row = db().prepare('SELECT COUNT(*) as total FROM tracks').get() as { total: number }
  return row.total
}

// Used to fetch full rows for tracks the watcher already inserted (it only
// notifies the renderer with the bare filepaths, not full rows) so the UI
// can reflect them without a full library reload.
export function getTracksByFilepaths(filepaths: string[]): DbTrackRow[] {
  if (!filepaths.length) return []
  return db()
    .prepare(`SELECT * FROM tracks WHERE filepath IN (SELECT value FROM json_each(?))`)
    .all(JSON.stringify(filepaths)) as DbTrackRow[]
}

// ── Genre / Artist browsing (sidebar) ───────────────────────────────────────
// missing_since IS NULL is this schema's "not missing" — there is no boolean
// `missing` column (see markTracksMissing/relinkTrackFilepath above).

export type GenreCount = { genre: string; track_count: number }
export type ArtistCount = { artist: string; track_count: number }

export function getAllGenres(): GenreCount[] {
  return db()
    .prepare(
      `SELECT genre, COUNT(*) as track_count
       FROM tracks
       WHERE genre IS NOT NULL AND genre != ''
       AND missing_since IS NULL
       GROUP BY genre
       ORDER BY genre ASC`
    )
    .all() as GenreCount[]
}

export function getTracksByGenre(genre: string, offset: number, limit: number): DbTrackRow[] {
  return db()
    .prepare(
      `SELECT * FROM tracks
       WHERE genre = ? AND missing_since IS NULL
       ORDER BY artist ASC, title ASC
       LIMIT ? OFFSET ?`
    )
    .all(genre, limit, offset) as DbTrackRow[]
}

export function getTracksByGenreCount(genre: string): number {
  const row = db()
    .prepare(`SELECT COUNT(*) as total FROM tracks WHERE genre = ? AND missing_since IS NULL`)
    .get(genre) as { total: number }
  return row.total
}

// Board view for GenreView — each board column paginates independently
// (mirrors how the main BoardColumn already gets one array per column).
export function getTracksByGenreAndColumn(
  genre: string,
  column: string,
  offset: number,
  limit: number
): DbTrackRow[] {
  return db()
    .prepare(
      `SELECT * FROM tracks
       WHERE genre = ? AND column_name = ? AND missing_since IS NULL
       ORDER BY artist ASC, title ASC
       LIMIT ? OFFSET ?`
    )
    .all(genre, column, limit, offset) as DbTrackRow[]
}

export function getTracksByGenreAndColumnCount(genre: string, column: string): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) as total FROM tracks
       WHERE genre = ? AND column_name = ? AND missing_since IS NULL`
    )
    .get(genre, column) as { total: number }
  return row.total
}

export function getAllArtists(): ArtistCount[] {
  return db()
    .prepare(
      `SELECT artist, COUNT(*) as track_count
       FROM tracks
       WHERE artist IS NOT NULL AND artist != ''
       AND missing_since IS NULL
       GROUP BY artist
       ORDER BY artist ASC`
    )
    .all() as ArtistCount[]
}

export function getTracksByArtist(artist: string, offset: number, limit: number): DbTrackRow[] {
  return db()
    .prepare(
      `SELECT * FROM tracks
       WHERE artist = ? AND missing_since IS NULL
       ORDER BY title ASC
       LIMIT ? OFFSET ?`
    )
    .all(artist, limit, offset) as DbTrackRow[]
}

export function getTracksByArtistCount(artist: string): number {
  const row = db()
    .prepare(`SELECT COUNT(*) as total FROM tracks WHERE artist = ? AND missing_since IS NULL`)
    .get(artist) as { total: number }
  return row.total
}

// ── Label Manager (genre/artist value cleanup) ──────────────────────────────
// Field name is interpolated into SQL (no parameterized column names in
// sqlite) — LABEL_FIELDS is the injection guard, checked before every use.
// No missing_since filter here, unlike the browsing queries above: renaming
// a mistyped genre/artist should catch every row that has it, including
// tracks whose file is currently missing.
export type LabelValueCount = { value: string; count: number }
const LABEL_FIELDS = new Set(['genre', 'artist'])

export function getLabelValueCounts(field: string): LabelValueCount[] {
  if (!LABEL_FIELDS.has(field)) throw new Error(`Invalid label field: ${field}`)
  return db()
    .prepare(
      `SELECT ${field} as value, COUNT(*) as count
       FROM tracks
       WHERE ${field} IS NOT NULL AND ${field} != ''
       GROUP BY ${field}
       ORDER BY count DESC`
    )
    .all() as LabelValueCount[]
}

export function renameLabelValue(
  field: string,
  oldValue: string,
  newValue: string
): { ok: boolean; tracksUpdated?: number; error?: string } {
  if (!LABEL_FIELDS.has(field)) return { ok: false, error: `Invalid field: ${field}` }
  try {
    const result = db().prepare(`UPDATE tracks SET ${field} = ? WHERE ${field} = ?`).run(newValue, oldValue)
    return { ok: true, tracksUpdated: result.changes }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Board view for ArtistView — mirrors getTracksByGenreAndColumn.
export function getTracksByArtistAndColumn(
  artist: string,
  column: string,
  offset: number,
  limit: number
): DbTrackRow[] {
  return db()
    .prepare(
      `SELECT * FROM tracks
       WHERE artist = ? AND column_name = ? AND missing_since IS NULL
       ORDER BY title ASC
       LIMIT ? OFFSET ?`
    )
    .all(artist, column, limit, offset) as DbTrackRow[]
}

export function getTracksByArtistAndColumnCount(artist: string, column: string): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) as total FROM tracks
       WHERE artist = ? AND column_name = ? AND missing_since IS NULL`
    )
    .get(artist, column) as { total: number }
  return row.total
}

// Used only by the local audio server (index.ts) to confirm a requested path
// is a real track's filepath before streaming it — an exact match against
// idx_tracks_filepath, never a prefix/containment check, so it isn't
// bypassable with "../" traversal tricks.
export function isKnownTrackFilepath(filepath: string): boolean {
  return !!db().prepare('SELECT 1 FROM tracks WHERE filepath = ? LIMIT 1').get(filepath)
}

export function insertTracks(rows: DbTrackInsert[]): { id: number; inserted: boolean }[] {
  if (!rows.length) return []
  const stmt = db().prepare(`
    INSERT OR IGNORE INTO tracks
      (title, artist, bpm, key_val, genre, energy, column_name, folder, folder_id, filepath,
       camelot, openkey, duration_str, duration_sec, file_size_mb, format, album, year,
       remixer, grouping, composer, comment, label, waveform, artwork_path, partial_hash,
       last_modified, filename, client_uuid, created_at)
    VALUES
      (@title, @artist, @bpm, @key_val, @genre, @energy, @column_name, @folder, @folder_id, @filepath,
       @camelot, @openkey, @duration_str, @duration_sec, @file_size_mb, @format, @album, @year,
       @remixer, @grouping, @composer, @comment, @label, @waveform, @artwork_path, @partial_hash,
       @last_modified, @filename, lower(hex(randomblob(16))), strftime('%s','now'))
  `)
  const insertAll = db().transaction((rows: DbTrackInsert[]) =>
    rows.map((row) => {
      const result = stmt.run(row)
      return { id: Number(result.lastInsertRowid), inserted: result.changes > 0 }
    })
  )
  return insertAll(rows)
}

export function updateTrackFields(id: number, fields: Record<string, unknown>): void {
  const keys = Object.keys(fields)
  if (!keys.length) return
  // Sanitize: SQLite3 only accepts null/number/string/bigint/Buffer.
  // undefined → null; arrays/objects (e.g. waveform: number[]) → JSON string;
  // booleans (e.g. status_is_manual on a full Track object passed straight
  // through from a form) → 0/1 — better-sqlite3 rejects raw JS booleans.
  const safe: Record<string, unknown> = {}
  for (const k of keys) {
    const v = fields[k]
    if (v === undefined) safe[k] = null
    else if (typeof v === 'boolean') safe[k] = v ? 1 : 0
    else if (Array.isArray(v) || (typeof v === 'object' && v !== null)) safe[k] = JSON.stringify(v)
    else safe[k] = v
  }
  // updated_at is always stamped here rather than left to callers — every
  // write path (including internal tag-writeback edits) goes through this
  // function, so this is the one place identity/freshness bookkeeping lives.
  const setClauses = [...keys.map((k) => `${k} = @${k}`), `updated_at = strftime('%s','now')`].join(', ')
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

// Manual move — marks tracks as pinned so auto-compute skips them
export function moveTracksToColumn(ids: number[], column_name: string): void {
  if (!ids.length) return
  db()
    .prepare(`UPDATE tracks SET column_name = ?, status_is_manual = 1 WHERE id IN (SELECT value FROM json_each(?))`)
    .run(column_name, JSON.stringify(ids))
}

// Auto-compute move — does NOT change status_is_manual
export function autoMoveTracksToColumn(ids: number[], column_name: string): void {
  if (!ids.length) return
  db()
    .prepare(`UPDATE tracks SET column_name = ? WHERE id IN (SELECT value FROM json_each(?))`)
    .run(column_name, JSON.stringify(ids))
}

// Clear manual pin — lets auto-compute take over again
export function resetTrackStatusManual(id: number): void {
  db().prepare(`UPDATE tracks SET status_is_manual = 0 WHERE id = ?`).run(id)
}

// Update a board's criteria JSON (null = manual-only)
export function updateBoardCriteria(id: number, criteria: string[] | null): void {
  db()
    .prepare(`UPDATE boards SET criteria = ? WHERE id = ?`)
    .run(criteria === null ? null : JSON.stringify(criteria), id)
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

// ── Setlists ──────────────────────────────────────────────────────────────────

export type SetlistRow = { id: number; name: string; created_at: number }

export function getSetlists(): SetlistRow[] {
  return db().prepare('SELECT * FROM setlists ORDER BY created_at').all() as SetlistRow[]
}

export function createSetlist(name: string): number {
  return Number(db().prepare('INSERT INTO setlists (name) VALUES (?)').run(name).lastInsertRowid)
}

export function renameSetlist(id: number, name: string): void {
  db().prepare('UPDATE setlists SET name = ? WHERE id = ?').run(name, id)
}

export function deleteSetlist(id: number): void {
  db().prepare('DELETE FROM setlists WHERE id = ?').run(id)
}

export function getSetlistTrackIds(setlistId: number): number[] {
  return (
    db()
      .prepare('SELECT track_id FROM setlist_tracks WHERE setlist_id = ? ORDER BY position')
      .all(setlistId) as { track_id: number }[]
  ).map((r) => r.track_id)
}

export function addSetlistTrack(setlistId: number, trackId: number): void {
  const maxPos = (
    db()
      .prepare('SELECT COALESCE(MAX(position),0) as m FROM setlist_tracks WHERE setlist_id = ?')
      .get(setlistId) as { m: number }
  ).m
  db()
    .prepare('INSERT OR IGNORE INTO setlist_tracks (setlist_id, track_id, position) VALUES (?,?,?)')
    .run(setlistId, trackId, maxPos + 1)
}

export function removeSetlistTrack(setlistId: number, trackId: number): void {
  db()
    .prepare('DELETE FROM setlist_tracks WHERE setlist_id = ? AND track_id = ?')
    .run(setlistId, trackId)
}

export function reorderSetlistTracks(setlistId: number, trackIds: number[]): void {
  const stmt = db().prepare(
    'UPDATE setlist_tracks SET position = ? WHERE setlist_id = ? AND track_id = ?'
  )
  db().transaction(() => {
    trackIds.forEach((id, i) => stmt.run(i, setlistId, id))
  })()
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export type BookmarkRow = { id: number; url: string; label: string; created_at: number }

export function getBookmarks(): BookmarkRow[] {
  return db().prepare('SELECT * FROM bookmarks ORDER BY created_at DESC').all() as BookmarkRow[]
}

export function insertBookmark(url: string, label: string): number {
  return Number(
    db().prepare('INSERT INTO bookmarks (url, label) VALUES (?, ?)').run(url, label).lastInsertRowid
  )
}

export function deleteBookmark(id: number): void {
  db().prepare('DELETE FROM bookmarks WHERE id = ?').run(id)
}

export function updateBookmark(id: number, url: string, label: string): void {
  db().prepare('UPDATE bookmarks SET url = ?, label = ? WHERE id = ?').run(url, label, id)
}

// ── Folders ───────────────────────────────────────────────────────────────────

export function getFolders(): FolderRow[] {
  return db().prepare('SELECT * FROM folders ORDER BY parent_folder_id, name').all() as FolderRow[]
}

export function insertFolder(name: string, parentId: number | null): number {
  return Number(
    db().prepare('INSERT INTO folders (name, parent_folder_id) VALUES (?, ?)').run(name, parentId ?? null).lastInsertRowid
  )
}

// Like insertFolder, but for a folder backed by a real directory the caller
// has already created on disk — records its path so it behaves like an
// imported folder (rename/move cascade to the real directory) instead of
// the path:null "virtual, disk-less" folders insertFolder produces.
export function insertFolderAtPath(name: string, parentId: number | null, path: string): number {
  return Number(
    db()
      .prepare('INSERT INTO folders (name, parent_folder_id, path) VALUES (?, ?, ?)')
      .run(name, parentId ?? null, path).lastInsertRowid
  )
}

// Describes a real on-disk directory move already performed by the caller
// (index.ts) — folderId's own path went from `old` to `new`. Used to cascade
// the same change into every nested folder's path and every track's
// filepath underneath it, and into library_roots.path when folderId is a
// registered root's anchor. libraryRootIdToSync should be that root's id
// (captured by the caller BEFORE any parent_folder_id change, since a move
// can simultaneously un-root a folder), or null if not applicable.
type FolderPathCascade = { old: string; new: string; libraryRootIdToSync: number | null }

function cascadeFolderPaths(d: Database.Database, cascade: FolderPathCascade): void {
  const prefix = cascade.old + '/'
  const folders = d.prepare('SELECT id, path FROM folders').all() as { id: number; path: string | null }[]
  const updateFolderPath = d.prepare('UPDATE folders SET path = ? WHERE id = ?')
  for (const f of folders) {
    if (!f.path) continue
    if (f.path === cascade.old) updateFolderPath.run(cascade.new, f.id)
    else if (f.path.startsWith(prefix)) updateFolderPath.run(cascade.new + f.path.slice(cascade.old.length), f.id)
  }
  const tracks = d.prepare('SELECT id, filepath FROM tracks WHERE filepath IS NOT NULL').all() as
    { id: number; filepath: string }[]
  const updateTrackPath = d.prepare('UPDATE tracks SET filepath = ? WHERE id = ?')
  for (const t of tracks) {
    if (t.filepath === cascade.old) updateTrackPath.run(cascade.new, t.id)
    else if (t.filepath.startsWith(prefix)) updateTrackPath.run(cascade.new + t.filepath.slice(cascade.old.length), t.id)
  }
  if (cascade.libraryRootIdToSync != null) {
    d.prepare('UPDATE library_roots SET path = ? WHERE id = ?').run(cascade.new, cascade.libraryRootIdToSync)
  }
}

// Renames a folder's DB row and, if pathChange is given (the caller already
// renamed the real directory on disk), cascades that into every nested
// folder/track path — all in one transaction so DB and disk never disagree
// partway through.
export function renameFolderWithCascade(id: number, name: string, pathChange: FolderPathCascade | null): void {
  const d = db()
  d.transaction(() => {
    d.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id)
    if (pathChange) cascadeFolderPaths(d, pathChange)
  })()
}

// Reparents a folder's DB row and, if pathChange is given (the caller
// already moved the real directory on disk), cascades that the same way.
export function moveFolderWithCascade(id: number, parentId: number | null, pathChange: FolderPathCascade | null): void {
  const d = db()
  d.transaction(() => {
    d.prepare('UPDATE folders SET parent_folder_id = ? WHERE id = ?').run(parentId ?? null, id)
    if (pathChange) cascadeFolderPaths(d, pathChange)
  })()
}

export function deleteFolder(id: number): void {
  db().prepare('DELETE FROM folders WHERE id = ?').run(id)
}

export function updateTrackFolderIds(entries: { trackId: number; folderId: number | null }[]): void {
  if (!entries.length) return
  const stmt = db().prepare('UPDATE tracks SET folder_id = ? WHERE id = ?')
  db().transaction(() => { for (const { trackId, folderId } of entries) stmt.run(folderId ?? null, trackId) })()
}

// Creates the full folder tree for one import batch.
// rootAbsolutePath is the real, absolute directory the user selected to
// import — relativeDirs are paths relative to it (e.g. "House/Techno").
// Every node's true on-disk path is recorded (see FolderRow.path) since this
// is the one place that absolute path is ever known; it's never reconstructed
// or inferred afterward. Returns a map from relative path → folder id; ""
// maps to the root folder id.
export function ensureFolderTree(rootAbsolutePath: string, relativeDirs: string[]): Record<string, number> {
  const d = db()
  const pathToId: Record<string, number> = {}
  const rootName = basename(rootAbsolutePath) || rootAbsolutePath

  const run = d.transaction(() => {
    const rootId = Number(
      d.prepare('INSERT INTO folders (name, parent_folder_id, path) VALUES (?, NULL, ?)')
        .run(rootName, rootAbsolutePath).lastInsertRowid
    )
    pathToId[''] = rootId

    const allPaths = new Set<string>()
    for (const dir of relativeDirs) {
      if (!dir) continue
      const parts = dir.split('/')
      for (let i = 1; i <= parts.length; i++) {
        allPaths.add(parts.slice(0, i).join('/'))
      }
    }

    const sorted = [...allPaths].sort((a, b) => a.split('/').length - b.split('/').length)
    const ins = d.prepare('INSERT INTO folders (name, parent_folder_id, path) VALUES (?, ?, ?)')

    for (const relPath of sorted) {
      const parts = relPath.split('/')
      const name = parts[parts.length - 1]
      const parentPath = parts.slice(0, -1).join('/')
      const parentId = pathToId[parentPath] ?? rootId
      pathToId[relPath] = Number(ins.run(name, parentId, join(rootAbsolutePath, relPath)).lastInsertRowid)
    }
  })

  run()
  return pathToId
}

// ── Library roots ("Import Library") ────────────────────────────────────────
// A registered, durable root — distinct from ensureFolderTree's one-time use
// by "Add Files". Rescanning the SAME root must merge into its existing
// folder tree rather than spawn a parallel duplicate (the bug the plain
// ensureFolderTree has, which is why Add Files stays on that path deliberately).

export function getLibraryRoots(): LibraryRootRow[] {
  return db().prepare('SELECT * FROM library_roots ORDER BY name').all() as LibraryRootRow[]
}

export function getLibraryRootByPath(rootPath: string): LibraryRootRow | undefined {
  return db().prepare('SELECT * FROM library_roots WHERE path = ?').get(rootPath) as LibraryRootRow | undefined
}

export function setLibraryRootStatus(id: number, status: LibraryRootStatus): void {
  db().prepare('UPDATE library_roots SET status = ? WHERE id = ?').run(status, id)
}

export function markLibraryRootScanned(id: number): void {
  db().prepare(`UPDATE library_roots SET last_scanned_at = strftime('%s','now'), status = 'online' WHERE id = ?`).run(id)
}

// Stops tracking a root as a registered library source. Deliberately does
// NOT delete its folders or tracks — only detaches them (root_folder_id set
// NULL via ON DELETE SET NULL) so already-imported music isn't lost.
export function deleteLibraryRoot(id: number): void {
  db().prepare('DELETE FROM library_roots WHERE id = ?').run(id)
}

// Creates the library_roots row (or reuses it if this path was already
// registered) and merges the scanned folder tree into whatever already
// exists for that root — a second scan of the same root never duplicates
// folders, it only adds what's new.
export function ensureLibraryRootTree(
  rootAbsolutePath: string,
  relativeDirs: string[]
): { libraryRootId: number; folderIdByRelPath: Record<string, number> } {
  const d = db()
  const rootName = basename(rootAbsolutePath) || rootAbsolutePath

  const run = d.transaction(() => {
    const existingRoot = d.prepare('SELECT * FROM library_roots WHERE path = ?').get(rootAbsolutePath) as
      | LibraryRootRow
      | undefined
    const libraryRootId = existingRoot
      ? existingRoot.id
      : Number(d.prepare('INSERT INTO library_roots (name, path) VALUES (?, ?)').run(rootName, rootAbsolutePath).lastInsertRowid)

    // Load whatever folder tree already exists for this root (from a prior
    // scan) so we only create what's genuinely new.
    const existingFolders = d
      .prepare('SELECT id, name, parent_folder_id FROM folders WHERE root_folder_id = ?')
      .all(libraryRootId) as { id: number; name: string; parent_folder_id: number | null }[]
    const byId = new Map(existingFolders.map((f) => [f.id, f]))

    let rootFolderId = existingFolders.find((f) => f.parent_folder_id === null)?.id
    if (rootFolderId === undefined) {
      rootFolderId = Number(
        d.prepare('INSERT INTO folders (name, parent_folder_id, path, root_folder_id) VALUES (?, NULL, ?, ?)')
          .run(rootName, rootAbsolutePath, libraryRootId).lastInsertRowid
      )
    }

    const pathToId: Record<string, number> = { '': rootFolderId }
    // Reconstruct the relative path of every pre-existing folder by walking
    // its parent chain back to the root, so a second scan recognizes it.
    for (const f of existingFolders) {
      if (f.id === rootFolderId) continue
      const chain: string[] = []
      let cur: typeof f | undefined = f
      let reachedRoot = false
      while (cur) {
        if (cur.id === rootFolderId) { reachedRoot = true; break }
        chain.unshift(cur.name)
        cur = cur.parent_folder_id !== null ? byId.get(cur.parent_folder_id) : undefined
      }
      if (reachedRoot) pathToId[chain.join('/')] = f.id
    }

    const allPaths = new Set<string>()
    for (const dir of relativeDirs) {
      if (!dir) continue
      const parts = dir.split('/')
      for (let i = 1; i <= parts.length; i++) allPaths.add(parts.slice(0, i).join('/'))
    }
    const sorted = [...allPaths].sort((a, b) => a.split('/').length - b.split('/').length)
    const ins = d.prepare('INSERT INTO folders (name, parent_folder_id, path, root_folder_id) VALUES (?, ?, ?, ?)')

    for (const relPath of sorted) {
      if (pathToId[relPath] !== undefined) continue // already exists from a prior scan of this root
      const parts = relPath.split('/')
      const name = parts[parts.length - 1]
      const parentPath = parts.slice(0, -1).join('/')
      const parentId = pathToId[parentPath] ?? rootFolderId
      pathToId[relPath] = Number(
        ins.run(name, parentId, join(rootAbsolutePath, relPath), libraryRootId).lastInsertRowid
      )
    }

    return { libraryRootId, folderIdByRelPath: pathToId }
  })

  return run()
}

// ── Boards ────────────────────────────────────────────────────────────────────

export function getBoards(): BoardRow[] {
  return db().prepare('SELECT * FROM boards ORDER BY position, id').all() as BoardRow[]
}

export function insertBoard(name: string, color: string, position: number): number {
  return Number(
    db().prepare('INSERT INTO boards (name, color, position) VALUES (?, ?, ?)').run(name, color, position).lastInsertRowid
  )
}

export function renameBoardAndCascade(id: number, oldName: string, newName: string): void {
  const d = db()
  d.transaction(() => {
    d.prepare('UPDATE boards SET name = ? WHERE id = ?').run(newName, id)
    d.prepare('UPDATE tracks SET column_name = ? WHERE column_name = ?').run(newName, oldName)
  })()
}

export function updateBoardColor(id: number, color: string): void {
  db().prepare('UPDATE boards SET color = ? WHERE id = ?').run(color, id)
}

export function updateBoardPositions(entries: { id: number; position: number }[]): void {
  if (!entries.length) return
  const stmt = db().prepare('UPDATE boards SET position = ? WHERE id = ?')
  db().transaction(() => { for (const { id, position } of entries) stmt.run(position, id) })()
}

export function deleteBoardAndCascade(id: number, fallbackName: string): void {
  const d = db()
  const board = d.prepare('SELECT name FROM boards WHERE id = ?').get(id) as { name: string } | undefined
  if (!board) return
  d.transaction(() => {
    if (fallbackName) {
      d.prepare('UPDATE tracks SET column_name = ? WHERE column_name = ?').run(fallbackName, board.name)
    }
    d.prepare('DELETE FROM boards WHERE id = ?').run(id)
  })()
}

// ── App settings (generic key/value store: license token, pending checkout, device id) ────
export function getSetting(key: string): string | null {
  const row = db().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function deleteSetting(key: string): void {
  db().prepare('DELETE FROM app_settings WHERE key = ?').run(key)
}

// ── Setlists ──────────────────────────────────────────────────────────────────
export function getSetlistFilepaths(setlistId: number): string[] {
  return (
    db()
      .prepare(
        `SELECT t.filepath FROM setlist_tracks st
         JOIN tracks t ON t.id = st.track_id
         WHERE st.setlist_id = ? AND t.filepath IS NOT NULL
         ORDER BY st.position`
      )
      .all(setlistId) as { filepath: string }[]
  ).map((r) => r.filepath)
}

// ── Orphan reconciliation ────────────────────────────────────────────────────
// Track identity is client_uuid/id, not filepath — a relink only ever updates
// the path pointer. folder_id (the user's manual organization in the app) is
// deliberately left untouched; where a file physically lives on disk moving
// shouldn't reshuffle where the user filed it in CrateCloud.
export function relinkTrackFilepath(id: number, newFilepath: string): void {
  db()
    .prepare(`UPDATE tracks SET filepath = ?, missing_since = NULL, updated_at = strftime('%s','now') WHERE id = ?`)
    .run(newFilepath, id)
}

export function markTracksMissing(ids: number[]): void {
  if (!ids.length) return
  db()
    .prepare(
      `UPDATE tracks SET missing_since = strftime('%s','now') WHERE id IN (SELECT value FROM json_each(?))`
    )
    .run(JSON.stringify(ids))
}

// ── Duplicate detection ─────────────────────────────────────────────────────
export function getDismissedDuplicatePairs(): DismissedDuplicatePair[] {
  return db()
    .prepare('SELECT track_id_a, track_id_b, dismissed_at FROM dismissed_duplicate_pairs')
    .all() as DismissedDuplicatePair[]
}

// Pair is always stored with the smaller id first so (A,B) and (B,A) collide on the same row
export function addDismissedDuplicatePair(idA: number, idB: number): void {
  const a = Math.min(idA, idB)
  const b = Math.max(idA, idB)
  db()
    .prepare('INSERT OR IGNORE INTO dismissed_duplicate_pairs (track_id_a, track_id_b) VALUES (?, ?)')
    .run(a, b)
}
