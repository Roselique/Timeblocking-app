import type { TaskList, Task } from './types';

interface Props {
  lists: TaskList[];
  setLists: (lists: TaskList[]) => void;
}

interface FlatTask extends Task {
  listId: string;
  listName: string;
}

const QUADRANTS: {
  key: string;
  important: boolean;
  urgent: boolean;
  title: string;
  subtitle: string;
  className: string;
}[] = [
  {
    key: 'do',
    important: true,
    urgent: true,
    title: 'Do First',
    subtitle: 'Important & Urgent',
    className: 'q-do',
  },
  {
    key: 'schedule',
    important: true,
    urgent: false,
    title: 'Schedule',
    subtitle: 'Important & Not Urgent',
    className: 'q-schedule',
  },
  {
    key: 'delegate',
    important: false,
    urgent: true,
    title: 'Delegate',
    subtitle: 'Not Important & Urgent',
    className: 'q-delegate',
  },
  {
    key: 'delete',
    important: false,
    urgent: false,
    title: 'Eliminate',
    subtitle: 'Not Important & Not Urgent',
    className: 'q-delete',
  },
];

export default function Matrix({ lists, setLists }: Props) {
  const flatTasks: FlatTask[] = lists.flatMap((l) =>
    l.tasks.map((t) => ({ ...t, listId: l.id, listName: l.name }))
  );

  function updateTask(listId: string, taskId: string, patch: Partial<Task>) {
    setLists(
      lists.map((l) =>
        l.id === listId
          ? {
              ...l,
              tasks: l.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
            }
          : l
      )
    );
  }

  const hasAnyTask = flatTasks.length > 0;

  return (
    <div className="matrix-view">
      {!hasAnyTask && (
        <p className="empty-hint">
          No tasks yet. Add tasks in the Lists tab, then mark them Important /
          Urgent here or there — they'll appear in the matching quadrant.
        </p>
      )}
      <div className="matrix-grid">
        {QUADRANTS.map((q) => {
          const tasks = flatTasks.filter(
            (t) => t.important === q.important && t.urgent === q.urgent
          );
          return (
            <div className={`quadrant ${q.className}`} key={q.key}>
              <div className="quadrant-header">
                <h3>{q.title}</h3>
                <span>{q.subtitle}</span>
              </div>
              <ul className="quadrant-tasks">
                {tasks.map((t) => (
                  <li key={t.id} className={t.done ? 'done' : ''}>
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) =>
                        updateTask(t.listId, t.id, { done: e.target.checked })
                      }
                    />
                    <span className="task-text">{t.text}</span>
                    <span className="source-list">{t.listName}</span>
                  </li>
                ))}
                {tasks.length === 0 && <li className="empty-hint">Nothing here</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
