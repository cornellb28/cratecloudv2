import { useLibraryStore } from '../stores/useLibraryStore'

const TABS = ['Library', 'Board', 'Setlist', 'AI Match']

export function TitleBar(): React.JSX.Element {
  const { activeTab, setActiveTab } = useLibraryStore()

  return (
    <div className="titlebar">
      <div className="tb-dots">
        <div className="tb-dot" style={{ background: '#ff5f57' }} />
        <div className="tb-dot" style={{ background: '#febc2e' }} />
        <div className="tb-dot" style={{ background: '#28c840' }} />
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
        <button className="icon-btn">⬆ Import</button>
        <button className="icon-btn">☁ Sync</button>
        <button className="icon-btn accent">+ Add tracks</button>
      </div>
    </div>
  )
}
