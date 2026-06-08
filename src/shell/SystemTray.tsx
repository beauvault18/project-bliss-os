import { useEffect, useState } from 'react';

export function SystemTray() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className="tray">
      <span className="tray__icons" aria-hidden>
        🔊 🛡️
      </span>
      <span className="tray__clock" data-testid="clock">
        {time}
      </span>
    </div>
  );
}
