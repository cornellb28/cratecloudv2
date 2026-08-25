import { useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useLibraryRootsStore } from '../stores/useLibraryRootsStore'
import { useImport } from '../hooks/useImport'

const TABS = ['Library', 'Artist', 'Setlist', 'Track Match', 'Settings']

export function TitleBar(): React.JSX.Element {
  const { activeTab, setActiveTab, importStatus } = useLibraryStore()
  const { importFromDialog } = useImport()
  const { scanning, scanProgress, importRoot } = useLibraryRootsStore()
  const [scanError, setScanError] = useState<string | null>(null)
  const importing = importStatus !== null || scanning

  const handleImportLibrary = async () => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    setScanError(null)
    try {
      await importRoot(folder)
    } catch (err) {
      setScanError(String(err))
    }
  }

  return (
    <div className="titlebar">
      <div className="tb-dots">
        <div
          className="tb-dot"
          style={{ background: '#ff5f57' }}
          onClick={() => window.api.window.close()}
          title="Close"
        />
        <div
          className="tb-dot"
          style={{ background: '#febc2e' }}
          onClick={() => window.api.window.minimize()}
          title="Minimize"
        />
        <div
          className="tb-dot"
          style={{ background: '#28c840' }}
          onClick={() => window.api.window.maximize()}
          title="Maximize"
        />
      </div>

      <span className="tb-logo">⬡ CrateCloud</span>

      <div className="tb-tabs">
        {TABS.map((tab) => (
          <div
            key={tab}
            className={`tb-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </div>
        ))}
      </div>

      <div className="tb-actions">
        {importStatus && (
          <span className="tb-import-status">
            {importStatus.total > 0
              ? `${importStatus.current}/${importStatus.total} — ${importStatus.label}`
              : importStatus.label}
          </span>
        )}
        {scanning && scanProgress && (
          <span className="tb-import-status">
            {scanProgress.total > 0
              ? `Scanning ${scanProgress.current}/${scanProgress.total} — ${scanProgress.file}`
              : 'Walking folder…'}
          </span>
        )}
        {scanError && !importing && (
          <span className="tb-import-status tb-import-error" onClick={() => setScanError(null)} title="Dismiss">
            {scanError}
          </span>
        )}

        <button
          className="btn btn-outline"
          onClick={handleImportLibrary}
          disabled={importing}
          title="Register a root music folder as a library — CrateCloud remembers it and can rescan it later without re-importing everything"
        >
          ⬆ Import Library
        </button>

        <button
          className="btn btn-solid"
          onClick={() => importFromDialog('files')}
          disabled={importing}
          title="Pick one or more audio files to add — a one-time addition, not tracked as a library source"
        >
          + Add Files
        </button>
      </div>
    </div>
  )
}
