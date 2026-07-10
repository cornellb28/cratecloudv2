import { useState, useEffect } from 'react'
import { useBookmarkStore } from '../stores/useBookmarkStore'

function isValidUrl(raw: string): boolean {
  try { new URL(raw.includes('://') ? raw : `https://${raw}`); return true } catch { return false }
}

function normalizeUrl(raw: string): string {
  return raw.includes('://') ? raw : `https://${raw}`
}

export function BookmarksPanel(): React.JSX.Element {
  const { bookmarks, init, addBookmark, removeBookmark, updateBookmark, openBookmark } = useBookmarkStore()
  const [adding, setAdding] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [urlError, setUrlError] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editUrl, setEditUrl] = useState('')
  const [editLabel, setEditLabel] = useState('')

  useEffect(() => { init() }, [])

  const handleAdd = async () => {
    const raw = urlInput.trim()
    if (!raw || !isValidUrl(raw)) { setUrlError(true); return }
    await addBookmark(normalizeUrl(raw), labelInput.trim())
    setUrlInput('')
    setLabelInput('')
    setAdding(false)
    setUrlError(false)
  }

  const startEdit = (id: number, url: string, label: string) => {
    setEditId(id)
    setEditUrl(url)
    setEditLabel(label)
  }

  const commitEdit = async () => {
    if (editId === null) return
    const raw = editUrl.trim()
    if (!raw || !isValidUrl(raw)) return
    await updateBookmark(editId, normalizeUrl(raw), editLabel.trim())
    setEditId(null)
  }

  const cancelAdd = () => {
    setAdding(false)
    setUrlInput('')
    setLabelInput('')
    setUrlError(false)
  }

  return (
    <div className="bk-panel">
      <div className="sb-section-row">
        <span className="sb-section">Bookmarks</span>
        <button
          className="sb-add-btn"
          onClick={() => { setAdding(true); setUrlError(false) }}
          title="Add bookmark"
        >
          +
        </button>
      </div>

      {adding && (
        <div className="bk-add-form">
          <input
            className={`bk-input${urlError ? ' bk-input-err' : ''}`}
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(false) }}
            placeholder="https://…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') cancelAdd()
            }}
          />
          {urlError && <span className="bk-err">Enter a valid URL</span>}
          <input
            className="bk-input"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="Label (optional)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') cancelAdd()
            }}
          />
          <div className="bk-form-actions">
            <button className="bk-btn" onClick={cancelAdd} type="button">Cancel</button>
            <button className="bk-btn bk-btn-primary" onClick={handleAdd} type="button">Add</button>
          </div>
        </div>
      )}

      {bookmarks.length === 0 && !adding && (
        <div className="sb-empty">No bookmarks yet</div>
      )}

      <div className="bk-list">
        {bookmarks.map((bk) =>
          editId === bk.id ? (
            <div key={bk.id} className="bk-edit-form">
              <input
                className="bk-input"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="URL"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditId(null)
                }}
              />
              <input
                className="bk-input"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Label"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditId(null)
                }}
              />
              <div className="bk-form-actions">
                <button className="bk-btn" onClick={() => setEditId(null)} type="button">Cancel</button>
                <button className="bk-btn bk-btn-primary" onClick={commitEdit} type="button">Save</button>
              </div>
            </div>
          ) : (
            <div key={bk.id} className="bk-item">
              <div
                className="bk-link"
                onClick={() => openBookmark(bk.url)}
                title={bk.url}
              >
                <div className="bk-label">{bk.label || (() => { try { return new URL(bk.url).hostname } catch { return bk.url } })()}</div>
                <div className="bk-url">{bk.url}</div>
              </div>
              <div className="bk-actions">
                <button
                  className="bk-icon-btn"
                  onClick={() => startEdit(bk.id, bk.url, bk.label)}
                  title="Edit"
                  type="button"
                >✎</button>
                <button
                  className="bk-icon-btn bk-icon-danger"
                  onClick={() => removeBookmark(bk.id)}
                  title="Remove"
                  type="button"
                >✕</button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
