import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { BulkBar } from './components/BulkBar'
import { BoardView } from './components/board/BoardView'
import { Inspector } from './components/Inspector'

function App(): React.JSX.Element {
  return (
    <div className="app">
      <TitleBar />
      <div className="main">
        <Sidebar />
        <div className="content">
          <Toolbar />
          <BulkBar />
          <BoardView />
        </div>
        <Inspector />
      </div>
    </div>
  )
}

export default App
