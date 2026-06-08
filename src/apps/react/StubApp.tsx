import type { ReactNode } from 'react';

/** Shared placeholder shell for apps that ship in a later phase. */
export function StubApp({
  glyph,
  title,
  tagline,
  bullets,
  accent = '#2459d4',
}: {
  glyph: string;
  title: string;
  tagline: string;
  bullets: string[];
  accent?: string;
}): ReactNode {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 20,
        textAlign: 'center',
        fontFamily: 'Tahoma, "Segoe UI", sans-serif',
        background:
          'radial-gradient(circle at 50% 30%, #ffffff 0%, #eef2fb 60%, #dfe6f5 100%)',
        color: '#1b2b4a',
      }}
    >
      <div style={{ fontSize: '3rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.25))' }}>
        {glyph}
      </div>
      <h2 style={{ margin: 0, color: accent }}>{title}</h2>
      <p style={{ margin: 0, opacity: 0.75, maxWidth: 280 }}>{tagline}</p>
      <ul
        style={{
          textAlign: 'left',
          margin: '6px 0 0',
          padding: 0,
          listStyle: 'none',
          fontSize: '0.85rem',
          opacity: 0.85,
        }}
      >
        {bullets.map((b) => (
          <li key={b} style={{ margin: '3px 0' }}>
            ✦ {b}
          </li>
        ))}
      </ul>
      <span
        style={{
          marginTop: 8,
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          padding: '3px 10px',
          borderRadius: 999,
          background: accent,
          color: '#fff',
        }}
      >
        Coming in a later phase
      </span>
    </div>
  );
}

export const SettingsApp = () => (
  <StubApp
    glyph="⚙️"
    title="Settings"
    tagline="Personalize how your desktop behaves."
    accent="#3a7bd5"
    bullets={[
      'Window controls side: left / right (handed)',
      'Default wobble strength & snap distance',
      'Theme, wallpaper, and transparency defaults',
    ]}
  />
);

export const BlissLabApp = () => (
  <StubApp
    glyph="🧪"
    title="Bliss Lab"
    tagline="A live playground to redesign the desktop itself."
    accent="#7a3ad5"
    bullets={[
      'Swap minimize / close animations live',
      'Tune titlebar layout & icon style',
      'Preview Start menu and background variants',
    ]}
  />
);

export const AiCoderApp = () => (
  <StubApp
    glyph="🤖"
    title="AI Coder"
    tagline="Apps that negotiate and build with each other."
    accent="#1f9d72"
    bullets={[
      'Natural-language window automation',
      'Cross-app data hand-off',
      'Generate new mini-apps on the fly',
    ]}
  />
);
