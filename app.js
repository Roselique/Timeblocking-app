(function () {
  'use strict';

  // ---------- storage ----------

  function loadState(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveState(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // ignore write errors
    }
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------- state ----------

  let lists = loadState('tb-lists', [{ id: 'default', name: 'My Tasks', tasks: [] }]);
  let blocks = loadState('tb-blocks', []);
  let activeListId = lists[0] ? lists[0].id : null;

  function persistLists() {
    saveState('tb-lists', lists);
  }

  function persistBlocks() {
    saveState('tb-blocks', blocks);
  }

  // ---------- tabs ----------

  document.querySelectorAll('.main-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.main-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.querySelectorAll('.sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.subtab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('subtab-' + btn.dataset.subtab).classList.add('active');
      if (btn.dataset.subtab === 'matrix') renderMatrix();
    });
  });

  // =====================================================================
  // Time Blocking
  // =====================================================================

  const START_HOUR = 6; // 6am
  const END_HOUR = 23; // 11pm
  const SLOTS_PER_HOUR = 2; // 30-min slots
  const TOTAL_SLOTS = (END_HOUR - START_HOUR) * SLOTS_PER_HOUR;
  const SLOT_HEIGHT = 28;
  const COLORS = ['#6c8cff', '#ff8a65', '#66bb6a', '#ba68c8', '#ffca28', '#4dd0e1'];

  const datePicker = document.getElementById('date-picker');
  datePicker.value = todayIso();
  const grid = document.getElementById('timeblock-grid');

  let dragStart = null;
  let dragEnd = null;

  function slotLabel(slot) {
    const totalMinutes = START_HOUR * 60 + slot * 30;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + period;
  }

  function dayBlocks() {
    return blocks.filter((b) => b.date === datePicker.value);
  }

  function slotIsOccupied(slot) {
    return dayBlocks().some((b) => slot >= b.startSlot && slot < b.endSlot);
  }

  function renderGrid() {
    grid.innerHTML = '';
    grid.style.height = TOTAL_SLOTS * SLOT_HEIGHT + 'px';

    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const isHourStart = slot % SLOTS_PER_HOUR === 0;
      const el = document.createElement('div');
      el.className = 'slot' + (isHourStart ? ' hour-start' : '');
      el.dataset.slot = String(slot);
      if (isHourStart) {
        const label = document.createElement('span');
        label.className = 'slot-label';
        label.textContent = slotLabel(slot);
        el.appendChild(label);
      }
      if (
        dragStart !== null &&
        dragEnd !== null &&
        slot >= Math.min(dragStart, dragEnd) &&
        slot <= Math.max(dragStart, dragEnd)
      ) {
        el.classList.add('dragging');
      }
      grid.appendChild(el);
    }

    dayBlocks().forEach((b) => {
      const el = document.createElement('div');
      el.className = 'time-block';
      el.style.top = b.startSlot * SLOT_HEIGHT + 'px';
      el.style.height = (b.endSlot - b.startSlot) * SLOT_HEIGHT - 2 + 'px';
      el.style.background = b.color;

      const time = document.createElement('span');
      time.className = 'time-block-time';
      time.textContent = slotLabel(b.startSlot) + ' – ' + slotLabel(b.endSlot);

      const title = document.createElement('span');
      title.className = 'time-block-title';
      title.textContent = b.title || 'Untitled';

      el.appendChild(time);
      el.appendChild(title);
      el.addEventListener('click', () => openBlockModal(b.id));
      grid.appendChild(el);
    });
  }

  function slotAtEvent(e) {
    const rect = grid.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let slot = Math.floor(y / SLOT_HEIGHT);
    if (slot < 0) slot = 0;
    if (slot >= TOTAL_SLOTS) slot = TOTAL_SLOTS - 1;
    return slot;
  }

  grid.addEventListener('mousedown', (e) => {
    if (e.target.closest('.time-block')) return;
    const slot = slotAtEvent(e);
    if (slotIsOccupied(slot)) return;
    dragStart = slot;
    dragEnd = slot;
    renderGrid();
  });

  document.addEventListener('mousemove', (e) => {
    if (dragStart === null) return;
    const slot = slotAtEvent(e);
    if (slotIsOccupied(slot)) return;
    if (slot === dragEnd) return;
    dragEnd = slot;
    renderGrid();
  });

  document.addEventListener('mouseup', () => {
    if (dragStart === null || dragEnd === null) {
      dragStart = null;
      dragEnd = null;
      return;
    }
    const startSlot = Math.min(dragStart, dragEnd);
    const endSlot = Math.max(dragStart, dragEnd) + 1;
    const color = COLORS[blocks.length % COLORS.length];
    const block = {
      id: uid(),
      date: datePicker.value,
      startSlot,
      endSlot,
      title: '',
      color,
    };
    blocks.push(block);
    persistBlocks();
    dragStart = null;
    dragEnd = null;
    renderGrid();
    openBlockModal(block.id);
  });

  datePicker.addEventListener('change', renderGrid);

  // block modal

  const blockModal = document.getElementById('block-modal');
  const blockModalTime = document.getElementById('block-modal-time');
  const blockTitleInput = document.getElementById('block-title-input');
  const blockColorRow = document.getElementById('block-color-row');
  const blockDeleteBtn = document.getElementById('block-delete-btn');
  const blockDoneBtn = document.getElementById('block-done-btn');
  let editingBlockId = null;

  COLORS.forEach((c) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.background = c;
    swatch.dataset.color = c;
    swatch.addEventListener('click', () => {
      const b = blocks.find((x) => x.id === editingBlockId);
      if (!b) return;
      b.color = c;
      persistBlocks();
      renderGrid();
      updateColorSelection(c);
    });
    blockColorRow.appendChild(swatch);
  });

  function updateColorSelection(color) {
    Array.from(blockColorRow.children).forEach((swatch) => {
      swatch.classList.toggle('selected', swatch.dataset.color === color);
    });
  }

  function openBlockModal(blockId) {
    editingBlockId = blockId;
    const b = blocks.find((x) => x.id === blockId);
    if (!b) return;
    blockModalTime.textContent = slotLabel(b.startSlot) + ' – ' + slotLabel(b.endSlot);
    blockTitleInput.value = b.title;
    updateColorSelection(b.color);
    blockModal.style.display = 'flex';
    blockTitleInput.focus();
  }

  function closeBlockModal() {
    blockModal.style.display = 'none';
    editingBlockId = null;
    renderGrid();
  }

  blockTitleInput.addEventListener('input', () => {
    const b = blocks.find((x) => x.id === editingBlockId);
    if (!b) return;
    b.title = blockTitleInput.value;
    persistBlocks();
  });

  blockTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') closeBlockModal();
  });

  blockDeleteBtn.addEventListener('click', () => {
    blocks = blocks.filter((x) => x.id !== editingBlockId);
    persistBlocks();
    closeBlockModal();
  });

  blockDoneBtn.addEventListener('click', closeBlockModal);

  blockModal.addEventListener('click', (e) => {
    if (e.target === blockModal) closeBlockModal();
  });

  // =====================================================================
  // Lists
  // =====================================================================

  const newListInput = document.getElementById('new-list-input');
  const addListBtn = document.getElementById('add-list-btn');
  const listNamesEl = document.getElementById('list-names');
  const listDetailEl = document.getElementById('list-detail');

  function addList() {
    const name = newListInput.value.trim() || 'New list';
    const list = { id: uid(), name, tasks: [] };
    lists.push(list);
    activeListId = list.id;
    newListInput.value = '';
    persistLists();
    renderLists();
  }

  addListBtn.addEventListener('click', addList);
  newListInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addList();
  });

  function deleteList(id) {
    lists = lists.filter((l) => l.id !== id);
    if (activeListId === id) activeListId = lists[0] ? lists[0].id : null;
    persistLists();
    renderLists();
  }

  function getActiveList() {
    return lists.find((l) => l.id === activeListId) || lists[0];
  }

  function renderListNames() {
    listNamesEl.innerHTML = '';
    lists.forEach((l) => {
      const li = document.createElement('li');
      li.className = l.id === activeListId ? 'active' : '';

      const span = document.createElement('span');
      span.textContent = l.name;
      li.appendChild(span);

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.title = 'Delete list';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteList(l.id);
      });
      li.appendChild(delBtn);

      li.addEventListener('click', () => {
        activeListId = l.id;
        renderLists();
      });

      listNamesEl.appendChild(li);
    });
  }

  function renderListDetail() {
    listDetailEl.innerHTML = '';
    const list = getActiveList();
    if (!list) {
      const hint = document.createElement('p');
      hint.className = 'empty-hint';
      hint.textContent = 'Create a list to get started.';
      listDetailEl.appendChild(hint);
      return;
    }
    if (!activeListId) activeListId = list.id;

    const titleInput = document.createElement('input');
    titleInput.className = 'list-title-input';
    titleInput.value = list.name;
    titleInput.addEventListener('input', () => {
      list.name = titleInput.value;
      persistLists();
      renderListNames();
    });
    listDetailEl.appendChild(titleInput);

    const addRow = document.createElement('div');
    addRow.className = 'add-task-row';
    const taskInput = document.createElement('input');
    taskInput.type = 'text';
    taskInput.placeholder = 'Add a task...';
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add';
    function addTask() {
      if (!taskInput.value.trim()) return;
      list.tasks.push({
        id: uid(),
        text: taskInput.value.trim(),
        done: false,
        important: false,
        urgent: false,
      });
      taskInput.value = '';
      persistLists();
      renderListDetail();
    }
    addBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTask();
    });
    addRow.appendChild(taskInput);
    addRow.appendChild(addBtn);
    listDetailEl.appendChild(addRow);

    const ul = document.createElement('ul');
    ul.className = 'task-list';

    if (list.tasks.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-hint';
      li.textContent = 'No tasks yet. Add one above.';
      ul.appendChild(li);
    }

    list.tasks.forEach((t) => {
      const li = document.createElement('li');
      li.className = t.done ? 'done' : '';

      const doneCb = document.createElement('input');
      doneCb.type = 'checkbox';
      doneCb.checked = t.done;
      doneCb.addEventListener('change', () => {
        t.done = doneCb.checked;
        persistLists();
        renderListDetail();
      });
      li.appendChild(doneCb);

      const textSpan = document.createElement('span');
      textSpan.className = 'task-text';
      textSpan.textContent = t.text;
      li.appendChild(textSpan);

      const importantLabel = document.createElement('label');
      importantLabel.className = 'flag important';
      const importantCb = document.createElement('input');
      importantCb.type = 'checkbox';
      importantCb.checked = t.important;
      importantCb.addEventListener('change', () => {
        t.important = importantCb.checked;
        persistLists();
      });
      importantLabel.appendChild(importantCb);
      importantLabel.appendChild(document.createTextNode('Important'));
      li.appendChild(importantLabel);

      const urgentLabel = document.createElement('label');
      urgentLabel.className = 'flag urgent';
      const urgentCb = document.createElement('input');
      urgentCb.type = 'checkbox';
      urgentCb.checked = t.urgent;
      urgentCb.addEventListener('change', () => {
        t.urgent = urgentCb.checked;
        persistLists();
      });
      urgentLabel.appendChild(urgentCb);
      urgentLabel.appendChild(document.createTextNode('Urgent'));
      li.appendChild(urgentLabel);

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        list.tasks = list.tasks.filter((x) => x.id !== t.id);
        persistLists();
        renderListDetail();
      });
      li.appendChild(delBtn);

      ul.appendChild(li);
    });

    listDetailEl.appendChild(ul);
  }

  function renderLists() {
    renderListNames();
    renderListDetail();
  }

  // =====================================================================
  // Matrix
  // =====================================================================

  const quadrantEls = {
    do: document.getElementById('quadrant-do'),
    schedule: document.getElementById('quadrant-schedule'),
    delegate: document.getElementById('quadrant-delegate'),
    delete: document.getElementById('quadrant-delete'),
  };
  const matrixEmptyHint = document.getElementById('matrix-empty-hint');

  function quadrantKeyFor(important, urgent) {
    if (important && urgent) return 'do';
    if (important && !urgent) return 'schedule';
    if (!important && urgent) return 'delegate';
    return 'delete';
  }

  function renderMatrix() {
    Object.values(quadrantEls).forEach((el) => (el.innerHTML = ''));

    const flatTasks = [];
    lists.forEach((l) => {
      l.tasks.forEach((t) => {
        flatTasks.push(Object.assign({ listId: l.id, listName: l.name }, t));
      });
    });

    matrixEmptyHint.style.display = flatTasks.length === 0 ? 'block' : 'none';

    const grouped = { do: [], schedule: [], delegate: [], delete: [] };
    flatTasks.forEach((t) => {
      grouped[quadrantKeyFor(t.important, t.urgent)].push(t);
    });

    Object.keys(grouped).forEach((key) => {
      const tasks = grouped[key];
      const container = quadrantEls[key];
      if (tasks.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-hint';
        li.textContent = 'Nothing here';
        container.appendChild(li);
        return;
      }
      tasks.forEach((t) => {
        const li = document.createElement('li');
        li.className = t.done ? 'done' : '';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = t.done;
        cb.addEventListener('change', () => {
          const list = lists.find((l) => l.id === t.listId);
          const task = list && list.tasks.find((x) => x.id === t.id);
          if (task) {
            task.done = cb.checked;
            persistLists();
            renderMatrix();
            if (getActiveList() && getActiveList().id === t.listId) renderListDetail();
          }
        });
        li.appendChild(cb);

        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = t.text;
        li.appendChild(textSpan);

        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'source-list';
        sourceSpan.textContent = t.listName;
        li.appendChild(sourceSpan);

        container.appendChild(li);
      });
    });
  }

  // ---------- init ----------

  renderGrid();
  renderLists();
  renderMatrix();
})();
