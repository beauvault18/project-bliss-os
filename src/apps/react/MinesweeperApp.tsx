import { useMemo, useState } from 'react';

const SIZE = 8;
const MINES = 10;

interface Cell {
  mine: boolean;
  adj: number;
  revealed: boolean;
  flagged: boolean;
}

function buildBoard(seed: number): Cell[] {
  const cells: Cell[] = Array.from({ length: SIZE * SIZE }, () => ({
    mine: false,
    adj: 0,
    revealed: false,
    flagged: false,
  }));
  // Deterministic pseudo-random placement (no Math.random for reproducibility).
  let s = seed || 1;
  const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let placed = 0;
  while (placed < MINES) {
    const i = Math.floor(next() * cells.length);
    if (!cells[i].mine) {
      cells[i].mine = true;
      placed++;
    }
  }
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine) continue;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    let adj = 0;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && cells[nr * SIZE + nc].mine)
          adj++;
      }
    cells[i].adj = adj;
  }
  return cells;
}

const COLORS = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000'];

export function MinesweeperApp() {
  const [seed, setSeed] = useState(7);
  const [board, setBoard] = useState<Cell[]>(() => buildBoard(7));
  const [dead, setDead] = useState(false);

  const remaining = useMemo(
    () => board.filter((c) => c.mine && !c.flagged).length,
    [board],
  );

  function reveal(i: number) {
    if (dead || board[i].revealed || board[i].flagged) return;
    const next = board.map((c) => ({ ...c }));
    const flood = (idx: number) => {
      const cell = next[idx];
      if (cell.revealed || cell.flagged) return;
      cell.revealed = true;
      if (cell.adj === 0 && !cell.mine) {
        const r = Math.floor(idx / SIZE);
        const c = idx % SIZE;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE)
              flood(nr * SIZE + nc);
          }
      }
    };
    if (next[i].mine) {
      next.forEach((c) => (c.revealed = c.revealed || c.mine));
      setDead(true);
    } else {
      flood(i);
    }
    setBoard(next);
  }

  function flag(e: React.MouseEvent, i: number) {
    e.preventDefault();
    if (dead || board[i].revealed) return;
    const next = board.map((c) => ({ ...c }));
    next[i].flagged = !next[i].flagged;
    setBoard(next);
  }

  function reset() {
    const s = seed + 1;
    setSeed(s);
    setBoard(buildBoard(s));
    setDead(false);
  }

  return (
    <div
      style={{
        height: '100%',
        background: '#bdbdbd',
        padding: 8,
        boxSizing: 'border-box',
        fontFamily: 'Tahoma, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
          color: '#111',
        }}
      >
        <span>💣 {remaining}</span>
        <button onClick={reset} style={{ cursor: 'pointer' }}>
          {dead ? '💀 Retry' : '🙂 New'}
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gap: 2,
        }}
      >
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => reveal(i)}
            onContextMenu={(e) => flag(e, i)}
            style={{
              aspectRatio: '1',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: cell.revealed ? '1px solid #999' : '2px outset #eee',
              background: cell.revealed ? '#d6d6d6' : '#c0c0c0',
              color: cell.mine ? '#000' : COLORS[cell.adj] || '#333',
            }}
          >
            {cell.flagged
              ? '🚩'
              : cell.revealed
                ? cell.mine
                  ? '💥'
                  : cell.adj || ''
                : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
