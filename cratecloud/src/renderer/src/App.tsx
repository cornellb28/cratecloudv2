import { useEffect } from 'react'
import { useLibraryStore } from './stores/useLibraryStore'
import { useTagStore } from './stores/useTagStore'
import { useFolderStore } from './stores/useFolderStore'
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
import { ArtistExplorer } from './components/ArtistExplorer'
import { PlayerBar } from './components/PlayerBar'
import { FolderHierarchyView } from './components/FolderHierarchyView'
import { SettingsView } from './components/SettingsView'

function AppInner(): React.JSX.Element {
  const { activeTab, activeView, initFromDb, setAudioPort } = useLibraryStore()
  const { init: initTags } = useTagStore()
  const { init: initFolders } = useFolderStore()

  useEffect(() => {
    initFromDb()
    initTags()
    initFolders()
    window.api.audio.serverPort().then(setAudioPort)
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <div className="main">
        {activeTab !== 'Setlist' && activeTab !== 'Artist' && activeTab !== 'Settings' && <Sidebar />}

        <div className="content">
          {activeTab !== 'Setlist' && activeTab !== 'Artist' && activeTab !== 'Settings' && (
            <>
              <Toolbar />
              <BulkBar />
            </>
          )}

          {activeTab === 'Library' && activeView === 'List' && <LibraryView />}
          {activeTab === 'Library' && activeView === 'Board' && <BoardView />}
          {activeTab === 'Library' && activeView === 'Grid' && <LibraryView gridMode />}
          {activeTab === 'Library' && activeView === 'Folders' && <FolderHierarchyView />}
          {activeTab === 'Artist' && <ArtistExplorer />}
          {activeTab === 'Setlist' && <SetlistView />}
          {activeTab === 'Settings' && <SettingsView />}
          {activeTab === 'AI Match' && (
            <div className="view-placeholder">
              <div className="view-placeholder-icon">✦</div>
              <div className="view-placeholder-title">AI Match</div>
              <div className="view-placeholder-sub">Harmonic matching and recommendations coming soon.</div>
            </div>
          )}
        </div>
      </div>

      <PlayerBar />

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
