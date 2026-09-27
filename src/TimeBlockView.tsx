import { useState } from 'react';
import type { TimeBlock } from './types';

const START_HOUR = 6; // 6am
const END_HOUR = 23; // 11pm
const SLOTS_PER_HOUR = 2; // 30-min slots
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * SLOTS_PER_HOUR;

const COLORS = ['#6c8cff', '#ff8a65', '#66bb6a', '#ba68c8', '#ffca28', '#4dd0e1'];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function slotLabel(slot: number): string {
  const totalMinutes = START_HOUR * 60 + slot * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

interface Props {
  blocks: TimeBlock[];
  setBlocks: (blocks: TimeBlock[]) => void;
}

export default function TimeBlockView({ blocks, setBlocks }: Props) {
  const [date, setDate] = useState(todayIso());
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);

  const dayBlocks = blocks.filter((b) => b.date === date);

  function slotIsOccupied(slot: number): boolean {
    return dayBlocks.some((b) => slot >= b.startSlot && slot < b.endSlot);
  }

  function handleMouseDown(slot: number) {
    if (slotIsOccupied(slot)) return;
    setDragStart(slot);
    setDragEnd(slot);
  }

  function handleMouseEnter(slot: number) {
    if (dragStart === null) return;
    if (slotIsOccupied(slot)) return;
    setDragEnd(slot);
  }

  function handleMouseUp() {
    if (dragStart === null || dragEnd === null) {
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    const startSlot = Math.min(dragStart, dragEnd);
    const endSlot = Math.max(dragStart, dragEnd) + 1;
    const color = COLORS[blocks.length % COLORS.length];
    const block: TimeBlock = {
      id: uid(),
      date,
      startSlot,
      endSlot,
      title: '',
      color,
    };
    setBlocks([...blocks, block]);
    setEditingBlock(block);
    setDragStart(null);
    setDragEnd(null);
  }

  function saveBlockTitle(id: string, title: string) {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, title } : b)));
  }

  function deleteBlock(id: string) {
    setBlocks(blocks.filter((b) => b.id !== id));
    setEditingBlock(null);
  }

  function setBlockColor(id: string, color: string) {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, color } : b)));
  }

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i);

  return (
    <div className="timeblock-view" onMouseUp={handleMouseUp} onMouseLeave={() => { setDragStart(null); setDragEnd(null); }}>
      <div className="timeblock-toolbar">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="hint">Click and drag on the grid to create a block</span>
      </div>

      <div className="timeblock-grid-wrap">
        <div className="timeblock-grid">
          {slots.map((slot) => {
            const isHourStart = slot % SLOTS_PER_HOUR === 0;
            const inDrag =
              dragStart !== null &&
              dragEnd !== null &&
              slot >= Math.min(dragStart, dragEnd) &&
              slot <= Math.max(dragStart, dragEnd);
            return (
              <div
                key={slot}
                className={`slot ${isHourStart ? 'hour-start' : ''} ${
                  inDrag ? 'dragging' : ''
                }`}
                onMouseDown={() => handleMouseDown(slot)}
                onMouseEnter={() => handleMouseEnter(slot)}
              >
                {isHourStart && <span className="slot-label">{slotLabel(slot)}</span>}
              </div>
            );
          })}

          {dayBlocks.map((b) => (
            <div
              key={b.id}
              className="time-block"
              style={{
                top: `${b.startSlot * 28}px`,
                height: `${(b.endSlot - b.startSlot) * 28 - 2}px`,
                background: b.color,
              }}
              onClick={() => setEditingBlock(b)}
            >
              <span className="time-block-time">
                {slotLabel(b.startSlot)} – {slotLabel(b.endSlot)}
              </span>
              <span className="time-block-title">{b.title || 'Untitled'}</span>
            </div>
          ))}
        </div>
      </div>

      {editingBlock && (
        <div className="modal-backdrop" onClick={() => setEditingBlock(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {slotLabel(editingBlock.startSlot)} – {slotLabel(editingBlock.endSlot)}
            </h3>
            <input
              autoFocus
              placeholder="What are you working on?"
              value={
                blocks.find((b) => b.id === editingBlock.id)?.title ??
                editingBlock.title
              }
              onChange={(e) => saveBlockTitle(editingBlock.id, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingBlock(null)}
            />
            <div className="color-row">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className="color-swatch"
                  style={{ background: c }}
                  onClick={() => setBlockColor(editingBlock.id, c)}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button className="danger" onClick={() => deleteBlock(editingBlock.id)}>
                Delete
              </button>
              <button onClick={() => setEditingBlock(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
