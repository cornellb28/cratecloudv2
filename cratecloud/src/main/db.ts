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
}

export type FolderRow = {
  id: number
  name: string
  parent_folder_id: number | null
  created_at: number
}

export type BoardRow = {
  id: number
  name: string
  color: string
  position: number
  created_at: number
  criteria: string | null  // JSON-encoded string[] | null = manual-only
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
        waveform     TEXT,
        artwork_path TEXT
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
      CREATE TABLE IF NOT EXISTS folders (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        name             TEXT    NOT NULL,
        parent_folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS boards (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        color      TEXT    NOT NULL DEFAULT '#888888',
        position   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
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

    // Stage 2b: boards.criteria column
    const boardCols = _db.prepare('PRAGMA table_info(boards)').all() as { name: string }[]
    if (!new Set(boardCols.map((c) => c.name)).has('criteria')) {
      _db.exec(`ALTER TABLE boards ADD COLUMN criteria TEXT DEFAULT NULL`)
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
      (title, artist, bpm, key_val, genre, energy, column_name, folder, folder_id, filepath,
       camelot, openkey, duration_str, duration_sec, file_size_mb, format, album, year,
       remixer, grouping, composer, comment, label, waveform, artwork_path)
    VALUES
      (@title, @artist, @bpm, @key_val, @genre, @energy, @column_name, @folder, @folder_id, @filepath,
       @camelot, @openkey, @duration_str, @duration_sec, @file_size_mb, @format, @album, @year,
       @remixer, @grouping, @composer, @comment, @label, @waveform, @artwork_path)
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

export function renameFolder(id: number, name: string): void {
  db().prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id)
}

export function updateFolderParent(id: number, parentId: number | null): void {
  db().prepare('UPDATE folders SET parent_folder_id = ? WHERE id = ?').run(parentId ?? null, id)
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
// relativeDirs are paths relative to the import root (e.g. "House/Techno").
// Returns a map from relative path → folder id; "" maps to the root folder id.
export function ensureFolderTree(rootName: string, relativeDirs: string[]): Record<string, number> {
  const d = db()
  const pathToId: Record<string, number> = {}

  const run = d.transaction(() => {
    const rootId = Number(
      d.prepare('INSERT INTO folders (name, parent_folder_id) VALUES (?, NULL)').run(rootName).lastInsertRowid
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
    const ins = d.prepare('INSERT INTO folders (name, parent_folder_id) VALUES (?, ?)')

    for (const path of sorted) {
      const parts = path.split('/')
      const name = parts[parts.length - 1]
      const parentPath = parts.slice(0, -1).join('/')
      const parentId = pathToId[parentPath] ?? rootId
      pathToId[path] = Number(ins.run(name, parentId).lastInsertRowid)
    }
  })

  run()
  return pathToId
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
