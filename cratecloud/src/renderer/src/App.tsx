import { useEffect } from 'react'
import { useLibraryStore } from './stores/useLibraryStore'
import { ContextMenuProvider } from './contexts/ContextMenuContext'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { BulkBar } from './components/BulkBar'
import { ContextMenu } from './components/ContextMenu'
import { DeleteDialog } from './components/DeleteDialog'
import { EditTagsDialog } from './components/EditTagsDialog'
import { CrateDialog } from './components/CrateDialog'
import { DropOverlay } from './components/DropOverlay'
import { BoardView } from './components/board/BoardView'
import { LibraryView } from './components/library/LibraryView'
import { SetlistView } from './components/setlist/SetlistView'
import { Inspector } from './components/Inspector'

function AppInner(): React.JSX.Element {
  const { activeTab, initFromDb } = useLibraryStore()
  const showInspector = activeTab !== 'AI Match'

  useEffect(() => {
    initFromDb()
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <div className="main">
        {activeTab !== 'Setlist' && <Sidebar />}

        <div className="content">
          {activeTab !== 'Setlist' && (
            <>
              <Toolbar />
              <BulkBar />
            </>
          )}

          {activeTab === 'Library' && <LibraryView />}
          {activeTab === 'Board' && <BoardView />}
          {activeTab === 'Setlist' && <SetlistView />}
          {activeTab === 'AI Match' && (
            <div className="view-placeholder">
              <div className="view-placeholder-icon">✦</div>
              <div className="view-placeholder-title">AI Match</div>
              <div className="view-placeholder-sub">Harmonic matching and recommendations coming soon.</div>
            </div>
          )}
        </div>

        {showInspector && <Inspector />}
      </div>

      {/* Global overlays */}
      <ContextMenu />
      <DeleteDialog />
      <EditTagsDialog />
      <CrateDialog />
      <DropOverlay />
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <ContextMenuProvider>
      <AppInner />
    </ContextMenuProvider>
  )
}

export default App
