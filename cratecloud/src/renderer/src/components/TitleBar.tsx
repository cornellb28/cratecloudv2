import { useLibraryStore } from '../stores/useLibraryStore'
import { useImport } from '../hooks/useImport'

const TABS = ['Library', 'Setlist', 'AI Match']

export function TitleBar(): React.JSX.Element {
  const { activeTab, setActiveTab, importStatus } = useLibraryStore()
  const { importFromDialog } = useImport()
  const importing = importStatus !== null

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
        {importing && importStatus && (
          <span className="tb-import-status">
            {importStatus.total > 0
              ? `${importStatus.current}/${importStatus.total} — ${importStatus.label}`
              : importStatus.label}
          </span>
        )}

        <button
          className="icon-btn"
          onClick={() => importFromDialog('folder')}
          disabled={importing}
          title="Pick a folder — all audio files inside will be analyzed"
        >
          ⬆ Import Folder
        </button>

        <button
          className="icon-btn accent"
          onClick={() => importFromDialog('files')}
          disabled={importing}
          title="Pick one or more audio files to add"
        >
          + Add Files
        </button>
      </div>
    </div>
  )
}
