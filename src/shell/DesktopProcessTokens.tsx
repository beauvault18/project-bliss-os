import { useWindowStore } from '../core/windowStore';
import { getApp } from '../core/appRegistry';
import { animatedRestore } from '../effects/windowAnimationStore';
import { TOKEN_W, TOKEN_H } from '../core/tokenLayout';
import type { WindowState } from '../core/types';

function Token({ win }: { win: WindowState }) {
  const app = getApp(win.appId);
  return (
    <button
      className="proc-token"
      data-testid="desktop-token"
      data-appid={win.appId}
      style={{
        left: win.tokenPos!.x,
        top: win.tokenPos!.y,
        width: TOKEN_W,
        height: TOKEN_H,
      }}
      title="Double-click to restore"
      onDoubleClick={() => animatedRestore(win.id, win.appId)}
    >
      <span className="proc-token__icon" aria-hidden>
        {app?.icon}
      </span>
      <span className="proc-token__meta">
        <span className="proc-token__name">{win.title}</span>
        <span className="proc-token__live">
          <span className="proc-token__dot" aria-hidden />
          live
        </span>
      </span>
    </button>
  );
}

/**
 * Process tokens for windows minimized as "somersault tokens". Derived directly
 * from window state (minimized && tokenPos) so they can never desync — quitting
 * or closing the app removes the window and the token disappears with it.
 */
export function DesktopProcessTokens() {
  const windows = useWindowStore((s) => s.windows);
  const tokens = windows.filter((w) => w.minimized && w.tokenPos);
  if (!tokens.length) return null;
  return (
    <div className="proc-tokens" data-testid="desktop-tokens">
      {tokens.map((w) => (
        <Token key={w.id} win={w} />
      ))}
    </div>
  );
}
