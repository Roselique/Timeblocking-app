import { useState } from 'react';
import type { TaskList } from './types';
import Matrix from './Matrix';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  lists: TaskList[];
  setLists: (lists: TaskList[]) => void;
}

export default function ListsView({ lists, setLists }: Props) {
  const [subTab, setSubTab] = useState<'lists' | 'matrix'>('lists');
  const [activeListId, setActiveListId] = useState<string>(lists[0]?.id ?? '');
  const [newTaskText, setNewTaskText] = useState('');
  const [newListName, setNewListName] = useState('');

  const activeList = lists.find((l) => l.id === activeListId) ?? lists[0];

  function addList() {
    const name = newListName.trim() || 'New list';
    const list: TaskList = { id: uid(), name, tasks: [] };
    setLists([...lists, list]);
    setActiveListId(list.id);
    setNewListName('');
  }

  function deleteList(id: string) {
    const remaining = lists.filter((l) => l.id !== id);
    setLists(remaining);
    if (activeListId === id) setActiveListId(remaining[0]?.id ?? '');
  }

  function renameList(id: string, name: string) {
    setLists(lists.map((l) => (l.id === id ? { ...l, name } : l)));
  }

  function addTask() {
    if (!activeList || !newTaskText.trim()) return;
    const task = {
      id: uid(),
      text: newTaskText.trim(),
      done: false,
      important: false,
      urgent: false,
    };
    setLists(
      lists.map((l) =>
        l.id === activeList.id ? { ...l, tasks: [...l.tasks, task] } : l
      )
    );
    setNewTaskText('');
  }

  function updateTask(taskId: string, patch: Partial<TaskList['tasks'][number]>) {
    if (!activeList) return;
    setLists(
      lists.map((l) =>
        l.id === activeList.id
          ? {
              ...l,
              tasks: l.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
            }
          : l
      )
    );
  }

  function deleteTask(taskId: string) {
    if (!activeList) return;
    setLists(
      lists.map((l) =>
        l.id === activeList.id
          ? { ...l, tasks: l.tasks.filter((t) => t.id !== taskId) }
          : l
      )
    );
  }

  return (
    <div className="lists-view">
      <div className="sub-tabs">
        <button
          className={subTab === 'lists' ? 'sub-tab active' : 'sub-tab'}
          onClick={() => setSubTab('lists')}
        >
          Lists
        </button>
        <button
          className={subTab === 'matrix' ? 'sub-tab active' : 'sub-tab'}
          onClick={() => setSubTab('matrix')}
        >
          Priority Matrix
        </button>
      </div>

      {subTab === 'lists' && (
        <div className="lists-body">
          <aside className="list-sidebar">
            <div className="new-list-row">
              <input
                placeholder="New list name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addList()}
              />
              <button onClick={addList}>+</button>
            </div>
            <ul className="list-names">
              {lists.map((l) => (
                <li
                  key={l.id}
                  className={l.id === activeListId ? 'active' : ''}
                  onClick={() => setActiveListId(l.id)}
                >
                  <span>{l.name}</span>
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteList(l.id);
                    }}
                    title="Delete list"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="list-detail">
            {activeList ? (
              <>
                <input
                  className="list-title-input"
                  value={activeList.name}
                  onChange={(e) => renameList(activeList.id, e.target.value)}
                />
                <div className="add-task-row">
                  <input
                    placeholder="Add a task..."
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTask()}
                  />
                  <button onClick={addTask}>Add</button>
                </div>
                <ul className="task-list">
                  {activeList.tasks.map((t) => (
                    <li key={t.id} className={t.done ? 'done' : ''}>
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={(e) => updateTask(t.id, { done: e.target.checked })}
                      />
                      <span className="task-text">{t.text}</span>
                      <label className="flag important">
                        <input
                          type="checkbox"
                          checked={t.important}
                          onChange={(e) =>
                            updateTask(t.id, { important: e.target.checked })
                          }
                        />
                        Important
                      </label>
                      <label className="flag urgent">
                        <input
                          type="checkbox"
                          checked={t.urgent}
                          onChange={(e) => updateTask(t.id, { urgent: e.target.checked })}
                        />
                        Urgent
                      </label>
                      <button className="icon-btn" onClick={() => deleteTask(t.id)}>
                        ×
                      </button>
                    </li>
                  ))}
                  {activeList.tasks.length === 0 && (
                    <li className="empty-hint">No tasks yet. Add one above.</li>
                  )}
                </ul>
              </>
            ) : (
              <p className="empty-hint">Create a list to get started.</p>
            )}
          </section>
        </div>
      )}

      {subTab === 'matrix' && <Matrix lists={lists} setLists={setLists} />}
    </div>
  );
}
