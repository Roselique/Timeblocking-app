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

  // ---------- shared color palette (time blocks + lists) ----------

  const PALETTE = [
    { hex: '#f4d35e', name: 'Amber' },
    { hex: '#f2836b', name: 'Coral' },
    { hex: '#6fb3d2', name: 'Sky' },
    { hex: '#8fbc74', name: 'Sage' },
    { hex: '#b28dd0', name: 'Lilac' },
    { hex: '#f0a04b', name: 'Tangerine' },
    { hex: '#e0688c', name: 'Rose' },
    { hex: '#5fb8a4', name: 'Teal' },
    { hex: '#c9a86a', name: 'Ochre' },
    { hex: '#8f9fd6', name: 'Periwinkle' },
    { hex: '#d4c05e', name: 'Mustard' },
    { hex: '#a1a8b5', name: 'Slate' },
  ];
  const COLORS = PALETTE.map((p) => p.hex);
  const COLOR_NAMES = PALETTE.map((p) => p.name);

  // ---------- state ----------

  let lists = loadState('tb-lists', [{ id: 'default', name: 'My Tasks', tasks: [] }]);
  let blocks = loadState('tb-blocks', []);
  let meals = loadState('tb-meals', []);
  let activeListId = lists[0] ? lists[0].id : null;

  // Assign a color to any list saved before list colors existed.
  let migratedLists = false;
  lists = lists.map((l, i) => {
    if (l.color) return l;
    migratedLists = true;
    return { ...l, color: COLORS[i % COLORS.length] };
  });
  if (migratedLists) saveState('tb-lists', lists);

  // Migrate blocks saved before manual time entry (30-min slot indices -> minutes).
  const OLD_DAY_START = 6 * 60;
  const OLD_SLOT_MINUTES = 30;
  let migratedBlocks = false;
  blocks = blocks.map((b) => {
    if (b.startMin != null && b.endMin != null) return b;
    migratedBlocks = true;
    return {
      id: b.id,
      date: b.date,
      title: b.title,
      color: b.color,
      startMin: OLD_DAY_START + b.startSlot * OLD_SLOT_MINUTES,
      endMin: OLD_DAY_START + b.endSlot * OLD_SLOT_MINUTES,
    };
  });
  if (migratedBlocks) saveState('tb-blocks', blocks);

  function persistLists() {
    saveState('tb-lists', lists);
  }

  function persistBlocks() {
    saveState('tb-blocks', blocks);
  }

  function persistMeals() {
    saveState('tb-meals', meals);
  }

  // ---------- tabs ----------

  document.querySelectorAll('.main-tabs .tab-index').forEach((btn) => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('.main-tabs .tab-index')
        .forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.querySelectorAll('.sub-tabs .tab-index').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.tab-panel');
      section.querySelectorAll('.sub-tabs .tab-index').forEach((b) => b.classList.remove('active'));
      section.querySelectorAll('.subtab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('subtab-' + btn.dataset.subtab).classList.add('active');
      if (btn.dataset.subtab === 'matrix') renderMatrix();
      if (btn.dataset.subtab === 'shopping') renderShoppingList();
    });
  });

  // =====================================================================
  // Time Blocking
  // =====================================================================

  const START_HOUR = 6; // 6am
  const END_HOUR = 23; // 11pm
  const DAY_START = START_HOUR * 60; // minutes since midnight
  const DAY_END = END_HOUR * 60;
  const SLOT_MINUTES = 30; // drag/ruler snap unit
  const TOTAL_SLOTS = (DAY_END - DAY_START) / SLOT_MINUTES;
  const SLOT_HEIGHT = 28; // px per slot (per SLOT_MINUTES)
  const PX_PER_MIN = SLOT_HEIGHT / SLOT_MINUTES;

  const datePicker = document.getElementById('date-picker');
  datePicker.value = todayIso();
  const grid = document.getElementById('timeblock-grid');
  const datelineEl = document.getElementById('dateline');

  let dragStart = null;
  let dragEnd = null;
  let justCreatedId = null;

  function renderDateline() {
    const [y, m, d] = datePicker.value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    datelineEl.textContent = date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  // Minutes since midnight -> "6:00 AM" / "9:15 AM"
  function timeLabel(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + period;
  }

  // Minutes since midnight -> "06:00" for <input type="time">
  function toInputValue(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  // "06:00" -> exact minutes since midnight, no rounding
  function fromInputValue(value) {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesForSlot(slot) {
    return DAY_START + slot * SLOT_MINUTES;
  }

  function dayBlocks() {
    return blocks.filter((b) => b.date === datePicker.value);
  }

  function isRangeFree(startMin, endMin, excludeId) {
    return !dayBlocks().some(
      (b) => b.id !== excludeId && startMin < b.endMin && endMin > b.startMin
    );
  }

  function slotIsOccupied(slot) {
    return !isRangeFree(minutesForSlot(slot), minutesForSlot(slot + 1), null);
  }

  function findFreeRange(sizeSlots) {
    for (let start = 0; start <= TOTAL_SLOTS - sizeSlots; start++) {
      let fits = true;
      for (let slot = start; slot < start + sizeSlots; slot++) {
        if (slotIsOccupied(slot)) {
          fits = false;
          break;
        }
      }
      if (fits) return { startMin: minutesForSlot(start), endMin: minutesForSlot(start + sizeSlots) };
    }
    return null;
  }

  function renderGrid() {
    grid.innerHTML = '';
    grid.style.height = TOTAL_SLOTS * SLOT_HEIGHT + 'px';

    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const isHourStart = minutesForSlot(slot) % 60 === 0;
      const el = document.createElement('div');
      el.className = 'slot' + (isHourStart ? ' hour-start' : '');
      el.dataset.slot = String(slot);
      if (isHourStart) {
        const label = document.createElement('span');
        label.className = 'slot-label';
        label.textContent = timeLabel(minutesForSlot(slot));
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
      el.className = 'time-block' + (b.id === justCreatedId ? ' settle' : '');
      el.style.top = (b.startMin - DAY_START) * PX_PER_MIN + 'px';
      el.style.height = (b.endMin - b.startMin) * PX_PER_MIN - 2 + 'px';
      el.style.background = b.color;
      if (b.id === justCreatedId) {
        el.addEventListener('animationend', () => el.classList.remove('settle'), {
          once: true,
        });
      }

      const time = document.createElement('span');
      time.className = 'time-block-time';
      time.textContent = timeLabel(b.startMin) + ' – ' + timeLabel(b.endMin);

      const title = document.createElement('span');
      title.className = 'time-block-title';
      title.textContent = b.title || 'Untitled';

      el.appendChild(time);
      el.appendChild(title);
      el.addEventListener('click', () => openBlockModal(b.id));
      grid.appendChild(el);
    });

    justCreatedId = null;
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
      startMin: minutesForSlot(startSlot),
      endMin: minutesForSlot(endSlot),
      title: '',
      color,
    };
    blocks.push(block);
    persistBlocks();
    dragStart = null;
    dragEnd = null;
    justCreatedId = block.id;
    renderGrid();
    openBlockModal(block.id);
  });

  datePicker.addEventListener('change', () => {
    renderDateline();
    renderGrid();
  });

  function shiftDate(deltaDays) {
    const [y, m, d] = datePicker.value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + deltaDays);
    const iso =
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0');
    datePicker.value = iso;
    renderDateline();
    renderGrid();
  }

  document.getElementById('prev-day-btn').addEventListener('click', () => shiftDate(-1));
  document.getElementById('next-day-btn').addEventListener('click', () => shiftDate(1));

  // block modal

  const blockModal = document.getElementById('block-modal');
  const blockStartInput = document.getElementById('block-start-input');
  const blockEndInput = document.getElementById('block-end-input');
  const blockTimeError = document.getElementById('block-time-error');
  const blockTitleInput = document.getElementById('block-title-input');
  const blockColorRow = document.getElementById('block-color-row');
  const blockDeleteBtn = document.getElementById('block-delete-btn');
  const blockDoneBtn = document.getElementById('block-done-btn');
  const newBlockBtn = document.getElementById('new-block-btn');
  let editingBlockId = null;

  COLORS.forEach((c, i) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.background = c;
    swatch.dataset.color = c;
    swatch.setAttribute('aria-label', COLOR_NAMES[i]);
    swatch.title = COLOR_NAMES[i];
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
      const isSelected = swatch.dataset.color === color;
      swatch.classList.toggle('selected', isSelected);
      swatch.setAttribute('aria-pressed', String(isSelected));
    });
  }

  function showTimeError(message) {
    blockTimeError.textContent = message;
    blockTimeError.style.display = message ? 'block' : 'none';
  }

  function openBlockModal(blockId) {
    editingBlockId = blockId;
    const b = blocks.find((x) => x.id === blockId);
    if (!b) return;
    blockStartInput.value = toInputValue(b.startMin);
    blockEndInput.value = toInputValue(b.endMin);
    blockStartInput.min = toInputValue(DAY_START);
    blockStartInput.max = toInputValue(DAY_END);
    blockEndInput.min = toInputValue(DAY_START);
    blockEndInput.max = toInputValue(DAY_END);
    showTimeError('');
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

  function applyTimeChange() {
    const b = blocks.find((x) => x.id === editingBlockId);
    if (!b) return;

    if (!blockStartInput.value || !blockEndInput.value) return;

    let newStart = fromInputValue(blockStartInput.value);
    let newEnd = fromInputValue(blockEndInput.value);
    newStart = Math.max(DAY_START, Math.min(newStart, DAY_END - 1));
    newEnd = Math.max(DAY_START + 1, Math.min(newEnd, DAY_END));

    if (newEnd <= newStart) {
      showTimeError('End time must be after the start time.');
      return;
    }

    if (!isRangeFree(newStart, newEnd, b.id)) {
      showTimeError('That overlaps another block.');
      return;
    }

    showTimeError('');
    b.startMin = newStart;
    b.endMin = newEnd;
    persistBlocks();
    renderGrid();
  }

  blockStartInput.addEventListener('change', applyTimeChange);
  blockEndInput.addEventListener('change', applyTimeChange);

  newBlockBtn.addEventListener('click', () => {
    const range = findFreeRange(2) || {
      startMin: DAY_START,
      endMin: Math.min(DAY_START + 60, DAY_END),
    };
    const color = COLORS[blocks.length % COLORS.length];
    const block = {
      id: uid(),
      date: datePicker.value,
      startMin: range.startMin,
      endMin: range.endMin,
      title: '',
      color,
    };
    blocks.push(block);
    persistBlocks();
    justCreatedId = block.id;
    renderGrid();
    openBlockModal(block.id);
  });

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
    const color = COLORS[lists.length % COLORS.length];
    const list = { id: uid(), name, tasks: [], color };
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
    const list = lists.find((l) => l.id === id);
    if (list && list.tasks.length > 0) {
      const ok = window.confirm(
        'Delete "' + list.name + '" and its ' + list.tasks.length + ' task(s)?'
      );
      if (!ok) return;
    }
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
      const isActive = l.id === activeListId;
      li.className = isActive ? 'active' : '';
      li.style.borderBottomColor = isActive ? l.color : '';

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'list-select';
      selectBtn.setAttribute('aria-pressed', String(isActive));
      selectBtn.addEventListener('click', () => {
        activeListId = l.id;
        renderLists();
      });

      const dot = document.createElement('span');
      dot.className = 'list-dot';
      dot.style.background = l.color;
      dot.setAttribute('aria-hidden', 'true');
      selectBtn.appendChild(dot);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = l.name;
      selectBtn.appendChild(nameSpan);

      li.appendChild(selectBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-btn';
      delBtn.title = 'Delete list';
      delBtn.setAttribute('aria-label', 'Delete "' + l.name + '"');
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteList(l.id);
      });
      li.appendChild(delBtn);

      listNamesEl.appendChild(li);
    });
  }

  function makeStampButton(task, field, glyph, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stamp stamp-' + field;
    btn.setAttribute('aria-pressed', String(!!task[field]));
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.textContent = glyph;
    btn.classList.toggle('is-set', !!task[field]);
    btn.addEventListener('click', () => {
      task[field] = !task[field];
      persistLists();
      btn.classList.toggle('is-set', task[field]);
      btn.setAttribute('aria-pressed', String(task[field]));
    });
    return btn;
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
    titleInput.setAttribute('aria-label', 'List name');
    titleInput.addEventListener('input', () => {
      list.name = titleInput.value;
      persistLists();
      renderListNames();
    });
    listDetailEl.appendChild(titleInput);

    const listColorRow = document.createElement('div');
    listColorRow.className = 'color-row';
    listColorRow.setAttribute('role', 'group');
    listColorRow.setAttribute('aria-label', 'List color');
    COLORS.forEach((c, i) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'color-swatch';
      swatch.style.background = c;
      swatch.dataset.color = c;
      swatch.setAttribute('aria-label', COLOR_NAMES[i]);
      swatch.title = COLOR_NAMES[i];
      const isSelected = list.color === c;
      swatch.classList.toggle('selected', isSelected);
      swatch.setAttribute('aria-pressed', String(isSelected));
      swatch.addEventListener('click', () => {
        list.color = c;
        persistLists();
        Array.from(listColorRow.children).forEach((sw) => {
          const sel = sw.dataset.color === c;
          sw.classList.toggle('selected', sel);
          sw.setAttribute('aria-pressed', String(sel));
        });
        renderListNames();
      });
      listColorRow.appendChild(swatch);
    });
    listDetailEl.appendChild(listColorRow);

    const addRow = document.createElement('div');
    addRow.className = 'add-task-row';
    const taskInput = document.createElement('input');
    taskInput.type = 'text';
    taskInput.placeholder = 'Add a task…';
    taskInput.setAttribute('aria-label', 'New task');
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add task';
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
      doneCb.setAttribute('aria-label', 'Mark "' + t.text + '" done');
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

      li.appendChild(makeStampButton(t, 'important', '★', 'Important'));
      li.appendChild(makeStampButton(t, 'urgent', '●', 'Urgent'));

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.textContent = '×';
      delBtn.setAttribute('aria-label', 'Delete "' + t.text + '"');
      delBtn.title = 'Delete task';
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
        cb.setAttribute('aria-label', 'Mark "' + t.text + '" done');
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
        const sourceList = lists.find((l) => l.id === t.listId);
        const sourceDot = document.createElement('span');
        sourceDot.className = 'source-dot';
        sourceDot.style.background = sourceList ? sourceList.color : 'var(--ink-faint)';
        sourceDot.setAttribute('aria-hidden', 'true');
        sourceSpan.appendChild(sourceDot);
        sourceSpan.appendChild(document.createTextNode(t.listName));
        li.appendChild(sourceSpan);

        container.appendChild(li);
      });
    });
  }

  // =====================================================================
  // Meals
  // =====================================================================

  const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
  const MEAL_TYPE_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function toIsoDate(date) {
    return (
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0')
    );
  }

  function parseIsoDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDaysIso(iso, delta) {
    const date = parseIsoDate(iso);
    date.setDate(date.getDate() + delta);
    return toIsoDate(date);
  }

  function mondayOf(iso) {
    const date = parseIsoDate(iso);
    const day = date.getDay(); // 0 = Sun ... 6 = Sat
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return toIsoDate(date);
  }

  function formatCost(n) {
    return '€' + (Math.round(n * 100) / 100).toFixed(2);
  }

  // Single click fires onSingle after a short wait; a second click within
  // that window cancels it and fires onDouble instead (native dblclick).
  function attachClickAndDblClick(el, onSingle, onDouble) {
    let timer = null;
    el.addEventListener('click', () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        onSingle();
      }, 280);
    });
    el.addEventListener('dblclick', () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      onDouble();
    });
  }

  const mealWeekPicker = document.getElementById('meal-week-picker');
  mealWeekPicker.value = todayIso();
  const mealWeekLabel = document.getElementById('meal-week-label');
  const mealGridHead = document.getElementById('meal-grid-head');
  const mealGridBody = document.getElementById('meal-grid-body');
  const mealWeekTotalEl = document.getElementById('meal-week-total');

  let weekStart = mondayOf(mealWeekPicker.value);

  function weekDays() {
    return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  }

  function getMeal(date, type) {
    return meals.find((m) => m.date === date && m.type === type);
  }

  function ensureMeal(date, type) {
    let m = getMeal(date, type);
    if (!m) {
      m = { id: uid(), date, type, name: '', notes: '', ingredients: [] };
      meals.push(m);
    }
    return m;
  }

  function mealCost(m) {
    return m.ingredients.reduce((sum, ing) => sum + (ing.cost || 0), 0);
  }

  function pruneEmptyMeal(date, type) {
    const m = getMeal(date, type);
    if (m && !m.name.trim() && !(m.notes && m.notes.trim()) && m.ingredients.length === 0) {
      meals = meals.filter((x) => x.id !== m.id);
      persistMeals();
    }
  }

  function renderMealWeekLabel() {
    const days = weekDays();
    const start = parseIsoDate(days[0]);
    const end = parseIsoDate(days[6]);
    const fmt = (d, withYear) =>
      d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: withYear ? 'numeric' : undefined,
      });
    const sameYear = start.getFullYear() === end.getFullYear();
    mealWeekLabel.textContent = fmt(start, !sameYear) + ' – ' + fmt(end, true);
  }

  function renderMealGrid() {
    const days = weekDays();
    const today = todayIso();

    mealGridHead.innerHTML = '';
    const corner = document.createElement('th');
    corner.scope = 'col';
    mealGridHead.appendChild(corner);
    days.forEach((date, i) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.className = 'meal-day-head' + (date === today ? ' is-today' : '');
      const dayName = document.createElement('span');
      dayName.className = 'meal-day-name';
      dayName.textContent = DAY_LABELS[i];
      const dayNum = document.createElement('span');
      dayNum.className = 'meal-day-num';
      dayNum.textContent = String(parseIsoDate(date).getDate());
      th.appendChild(dayName);
      th.appendChild(dayNum);
      mealGridHead.appendChild(th);
    });

    mealGridBody.innerHTML = '';
    let weekTotal = 0;

    MEAL_TYPES.forEach((type) => {
      const tr = document.createElement('tr');
      const rowHead = document.createElement('th');
      rowHead.scope = 'row';
      rowHead.className = 'meal-type-head';
      rowHead.textContent = MEAL_TYPE_LABELS[type];
      tr.appendChild(rowHead);

      days.forEach((date) => {
        const td = document.createElement('td');
        td.className = date === today ? 'is-today' : '';
        const m = getMeal(date, type);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'meal-cell' + (m && m.name.trim() ? ' is-filled' : '');
        cell.setAttribute(
          'aria-label',
          (m && m.name.trim() ? m.name.trim() : 'Add meal') +
            ' – ' +
            DAY_LABELS[days.indexOf(date)] +
            ' ' +
            MEAL_TYPE_LABELS[type]
        );

        if (m && m.name.trim()) {
          const nameEl = document.createElement('span');
          nameEl.className = 'meal-cell-name';
          nameEl.textContent = m.name.trim();
          cell.appendChild(nameEl);
          const cost = mealCost(m);
          weekTotal += cost;
          if (cost > 0) {
            const costEl = document.createElement('span');
            costEl.className = 'meal-cell-cost';
            costEl.textContent = formatCost(cost);
            cell.appendChild(costEl);
          }
        } else {
          const plus = document.createElement('span');
          plus.className = 'meal-cell-plus';
          plus.textContent = '+';
          cell.appendChild(plus);
        }

        attachClickAndDblClick(
          cell,
          () => selectMealCell(date, type),
          () => openMealNameModal(date, type)
        );
        td.appendChild(cell);
        tr.appendChild(td);
      });

      mealGridBody.appendChild(tr);
    });

    mealWeekTotalEl.textContent = weekTotal > 0 ? 'Week total: ' + formatCost(weekTotal) : '';
  }

  function refreshMealWeek() {
    hideMealDetail();
    weekStart = mondayOf(mealWeekPicker.value);
    renderMealWeekLabel();
    renderMealGrid();
  }

  function shiftMealWeek(deltaWeeks) {
    mealWeekPicker.value = addDaysIso(mealWeekPicker.value, deltaWeeks * 7);
    refreshMealWeek();
  }

  document.getElementById('prev-week-btn').addEventListener('click', () => shiftMealWeek(-1));
  document.getElementById('next-week-btn').addEventListener('click', () => shiftMealWeek(1));
  mealWeekPicker.addEventListener('change', refreshMealWeek);

  // quick-name modal (double-click a cell)

  const mealNameModal = document.getElementById('meal-name-modal');
  const mealNameModalHeading = document.getElementById('meal-name-modal-heading');
  const mealNameQuickInput = document.getElementById('meal-name-quick-input');

  let quickEditDate = null;
  let quickEditType = null;

  function openMealNameModal(date, type) {
    quickEditDate = date;
    quickEditType = type;
    const m = getMeal(date, type);
    const dayIdx = weekDays().indexOf(date);
    mealNameModalHeading.textContent = DAY_LABELS[dayIdx] + ' · ' + MEAL_TYPE_LABELS[type];
    mealNameQuickInput.value = m ? m.name : '';
    mealNameModal.style.display = 'flex';
    mealNameQuickInput.focus();
    mealNameQuickInput.select();
  }

  function closeMealNameModal() {
    mealNameModal.style.display = 'none';
    pruneEmptyMeal(quickEditDate, quickEditType);
    quickEditDate = null;
    quickEditType = null;
    renderMealGrid();
    renderShoppingList();
  }

  mealNameQuickInput.addEventListener('input', () => {
    const m = ensureMeal(quickEditDate, quickEditType);
    m.name = mealNameQuickInput.value;
    persistMeals();
    if (selectedMealDate === quickEditDate && selectedMealType === quickEditType) {
      mealDetailNameInput.value = m.name;
    }
  });

  mealNameQuickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') closeMealNameModal();
  });

  document.getElementById('meal-name-done-btn').addEventListener('click', closeMealNameModal);
  mealNameModal.addEventListener('click', (e) => {
    if (e.target === mealNameModal) closeMealNameModal();
  });

  // inline meal detail panel (single-click a cell): ingredients + notes

  const mealDetailEl = document.getElementById('meal-detail');
  const mealDetailWhen = document.getElementById('meal-detail-when');
  const mealDetailNameInput = document.getElementById('meal-detail-name-input');
  const mealDetailIngredientList = document.getElementById('meal-detail-ingredient-list');
  const mealDetailIngredientName = document.getElementById('meal-detail-ingredient-name-input');
  const mealDetailIngredientCost = document.getElementById('meal-detail-ingredient-cost-input');
  const mealDetailAddIngredientBtn = document.getElementById('meal-detail-add-ingredient-btn');
  const mealDetailTotalEl = document.getElementById('meal-detail-total');
  const mealDetailNotesInput = document.getElementById('meal-detail-notes-input');
  const mealDetailDeleteBtn = document.getElementById('meal-detail-delete-btn');
  const mealDetailCloseBtn = document.getElementById('meal-detail-close-btn');

  let selectedMealDate = null;
  let selectedMealType = null;

  function renderMealDetailIngredients() {
    mealDetailIngredientList.innerHTML = '';
    const m = getMeal(selectedMealDate, selectedMealType);
    const ingredients = m ? m.ingredients : [];

    if (ingredients.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-hint';
      li.textContent = 'No ingredients yet.';
      mealDetailIngredientList.appendChild(li);
    }

    ingredients.forEach((ing) => {
      const li = document.createElement('li');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ingredient-name';
      nameSpan.textContent = ing.name;
      const costSpan = document.createElement('span');
      costSpan.className = 'ingredient-cost';
      costSpan.textContent = formatCost(ing.cost || 0);
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-btn';
      delBtn.textContent = '×';
      delBtn.setAttribute('aria-label', 'Remove ' + ing.name);
      delBtn.addEventListener('click', () => {
        m.ingredients = m.ingredients.filter((x) => x.id !== ing.id);
        persistMeals();
        renderMealDetailIngredients();
        renderMealGrid();
        renderShoppingList();
      });
      li.appendChild(nameSpan);
      li.appendChild(costSpan);
      li.appendChild(delBtn);
      mealDetailIngredientList.appendChild(li);
    });

    const total = m ? mealCost(m) : 0;
    mealDetailTotalEl.textContent = 'Total: ' + formatCost(total);
  }

  function renderMealDetail() {
    const m = getMeal(selectedMealDate, selectedMealType);
    const dayIdx = weekDays().indexOf(selectedMealDate);
    mealDetailWhen.textContent = DAY_LABELS[dayIdx] + ' · ' + MEAL_TYPE_LABELS[selectedMealType];
    mealDetailNameInput.value = m ? m.name : '';
    mealDetailNotesInput.value = m && m.notes ? m.notes : '';
    mealDetailIngredientName.value = '';
    mealDetailIngredientCost.value = '';
    renderMealDetailIngredients();
  }

  function selectMealCell(date, type) {
    if (selectedMealDate && (selectedMealDate !== date || selectedMealType !== type)) {
      pruneEmptyMeal(selectedMealDate, selectedMealType);
    }
    selectedMealDate = date;
    selectedMealType = type;
    mealDetailEl.hidden = false;
    renderMealDetail();
    renderMealGrid();
    mealDetailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideMealDetail() {
    if (selectedMealDate) {
      pruneEmptyMeal(selectedMealDate, selectedMealType);
    }
    selectedMealDate = null;
    selectedMealType = null;
    mealDetailEl.hidden = true;
    renderMealGrid();
    renderShoppingList();
  }

  mealDetailNameInput.addEventListener('input', () => {
    const m = ensureMeal(selectedMealDate, selectedMealType);
    m.name = mealDetailNameInput.value;
    persistMeals();
    renderMealGrid();
  });

  mealDetailNotesInput.addEventListener('input', () => {
    const m = ensureMeal(selectedMealDate, selectedMealType);
    m.notes = mealDetailNotesInput.value;
    persistMeals();
  });

  function addDetailIngredient() {
    const name = mealDetailIngredientName.value.trim();
    if (!name) return;
    const cost = parseFloat(mealDetailIngredientCost.value);
    const m = ensureMeal(selectedMealDate, selectedMealType);
    m.ingredients.push({ id: uid(), name, cost: isNaN(cost) ? 0 : cost, bought: false });
    persistMeals();
    mealDetailIngredientName.value = '';
    mealDetailIngredientCost.value = '';
    renderMealDetailIngredients();
    renderMealGrid();
    renderShoppingList();
    mealDetailIngredientName.focus();
  }

  mealDetailAddIngredientBtn.addEventListener('click', addDetailIngredient);
  mealDetailIngredientName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDetailIngredient();
    }
  });
  mealDetailIngredientCost.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDetailIngredient();
    }
  });

  mealDetailDeleteBtn.addEventListener('click', () => {
    const m = getMeal(selectedMealDate, selectedMealType);
    if (m && (m.ingredients.length > 0 || (m.notes && m.notes.trim()))) {
      const ok = window.confirm('Delete this meal and its ingredients?');
      if (!ok) return;
    }
    if (m) {
      meals = meals.filter((x) => x.id !== m.id);
      persistMeals();
    }
    selectedMealDate = null;
    selectedMealType = null;
    mealDetailEl.hidden = true;
    renderMealGrid();
    renderShoppingList();
  });

  mealDetailCloseBtn.addEventListener('click', hideMealDetail);

  // shopping list

  const shoppingListEl = document.getElementById('shopping-list');
  const shoppingEmptyHint = document.getElementById('shopping-empty-hint');
  const shoppingTotalEl = document.getElementById('shopping-total');

  function weekIngredientGroups() {
    const days = weekDays();
    const map = new Map();
    meals
      .filter((m) => days.includes(m.date))
      .forEach((m) => {
        m.ingredients.forEach((ing) => {
          const key = ing.name.trim().toLowerCase();
          if (!key) return;
          if (!map.has(key)) map.set(key, { name: ing.name.trim(), totalCost: 0, items: [] });
          const g = map.get(key);
          g.totalCost += ing.cost || 0;
          g.items.push({ mealId: m.id, ingredientId: ing.id, bought: !!ing.bought });
        });
      });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderShoppingList() {
    shoppingListEl.innerHTML = '';
    const groups = weekIngredientGroups();
    shoppingEmptyHint.style.display = groups.length === 0 ? 'block' : 'none';

    let total = 0;
    groups.forEach((g) => {
      total += g.totalCost;
      const li = document.createElement('li');
      const allBought = g.items.every((it) => it.bought);
      li.className = allBought ? 'done' : '';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = allBought;
      cb.setAttribute('aria-label', 'Mark "' + g.name + '" bought');
      cb.addEventListener('change', () => {
        const nextState = cb.checked;
        g.items.forEach((it) => {
          const m = meals.find((x) => x.id === it.mealId);
          const ing = m && m.ingredients.find((x) => x.id === it.ingredientId);
          if (ing) ing.bought = nextState;
        });
        persistMeals();
        renderShoppingList();
      });
      li.appendChild(cb);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'task-text';
      nameSpan.textContent = g.name;
      if (g.items.length > 1) {
        const countSpan = document.createElement('span');
        countSpan.className = 'ingredient-count';
        countSpan.textContent = '×' + g.items.length;
        nameSpan.appendChild(document.createTextNode(' '));
        nameSpan.appendChild(countSpan);
      }
      li.appendChild(nameSpan);

      const costSpan = document.createElement('span');
      costSpan.className = 'ingredient-cost';
      costSpan.textContent = formatCost(g.totalCost);
      li.appendChild(costSpan);

      shoppingListEl.appendChild(li);
    });

    shoppingTotalEl.textContent = groups.length > 0 ? 'Total: ' + formatCost(total) : '';
  }

  // ---------- init ----------

  renderDateline();
  renderGrid();
  renderLists();
  renderMatrix();
  renderMealWeekLabel();
  renderMealGrid();
  renderShoppingList();
})();
