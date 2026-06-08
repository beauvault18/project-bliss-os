import React, { useState } from 'react';

export function ReactApp() {
  const [count, setCount] = useState(0);

  return (
    <section className="panel panel--react">
      <span className="badge">React</span>
      <h2>Hello from React ⚛️</h2>
      <p>This panel is rendered by React v{React.version}.</p>
      <button onClick={() => setCount((c) => c + 1)}>
        Clicked {count} {count === 1 ? 'time' : 'times'}
      </button>
    </section>
  );
}
