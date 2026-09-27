import { useState } from 'react';
import TimeBlockView from './TimeBlockView';
import ListsView from './ListsView';
import type { TaskList, TimeBlock } from './types';
import { loadState, saveState } from './storage';

type Tab = 'timeblock' | 'lists';

const DEFAULT_LISTS: TaskList[] = [
  { id: 'default', name: 'My Tasks', tasks: [] },
];

function App() {
  const [tab, setTab] = useState<Tab>('timeblock');
  const [lists, setListsState] = useState<TaskList[]>(() =>
    loadState('tb-lists', DEFAULT_LISTS)
  );
  const [blocks, setBlocksState] = useState<TimeBlock[]>(() =>
    loadState('tb-blocks', [])
  );

  function setLists(next: TaskList[]) {
    setListsState(next);
    saveState('tb-lists', next);
  }

  function setBlocks(next: TimeBlock[]) {
    setBlocksState(next);
    saveState('tb-blocks', next);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Time Blocker</h1>
        <nav className="main-tabs">
          <button
            className={tab === 'timeblock' ? 'main-tab active' : 'main-tab'}
            onClick={() => setTab('timeblock')}
          >
            Time Blocking
          </button>
          <button
            className={tab === 'lists' ? 'main-tab active' : 'main-tab'}
            onClick={() => setTab('lists')}
          >
            Lists
          </button>
        </nav>
      </header>

      <main className="app-main">
        {tab === 'timeblock' ? (
          <TimeBlockView blocks={blocks} setBlocks={setBlocks} />
        ) : (
          <ListsView lists={lists} setLists={setLists} />
        )}
      </main>
    </div>
  );
}

export default App;
