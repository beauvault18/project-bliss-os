import { useState } from 'react';
import { APPS } from '../core/appRegistry';
import { useWindowStore } from '../core/windowStore';

export function StartMenu({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const openOrFocus = useWindowStore((s) => s.openOrFocus);
  const filtered = APPS.filter((a) =>
    a.title.toLowerCase().includes(q.toLowerCase()),
  );

  const launch = (id: string) => {
    openOrFocus(id);
    onClose();
  };

  return (
    <>
      <div className="startmenu-scrim" onClick={onClose} />
      <div
        className="startmenu"
        data-testid="startmenu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="startmenu__header">
          <div className="startmenu__avatar" aria-hidden>
            😎
          </div>
          <span className="startmenu__user">Bliss User</span>
        </div>

        <div className="startmenu__body">
          <input
            className="startmenu__search"
            placeholder="Search programs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            data-testid="start-search"
          />
          <ul className="startmenu__apps">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => launch(a.id)}
                  data-testid="start-app"
                  data-appid={a.id}
                >
                  <span className="startmenu__icon" aria-hidden>
                    {a.icon}
                  </span>
                  <span className="startmenu__appname">{a.title}</span>
                  <span className={`startmenu__badge badge--${a.body.framework}`}>
                    {a.body.framework}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="startmenu__empty">No programs found</li>
            )}
          </ul>
        </div>

        <div className="startmenu__footer">
          <button className="startmenu__logoff" onClick={onClose}>
            ⏻ Turn Off Computer
          </button>
        </div>
      </div>
    </>
  );
}
