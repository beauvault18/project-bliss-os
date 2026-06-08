import { useState } from 'react';

export function NotepadApp() {
  const [text, setText] = useState(
    'Welcome to Bliss OS Notepad.\n\nThis window is rendered by React.\nThe Calculator and File Explorer are rendered by Angular.\n\nTry dragging a window — it wobbles.',
  );
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        fontFamily: 'Tahoma, "Segoe UI", sans-serif',
      }}
    >
      <textarea
        data-testid="notepad-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          resize: 'none',
          padding: '8px 10px',
          font: '0.95rem/1.5 Consolas, monospace',
          color: '#111',
        }}
      />
      <div
        style={{
          borderTop: '1px solid #adacac',
          background: '#ece9d8',
          padding: '3px 10px',
          fontSize: '0.78rem',
          color: '#444',
        }}
      >
        {words} words · {text.length} chars
      </div>
    </div>
  );
}
