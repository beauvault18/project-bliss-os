import { Component, inject, OnDestroy, signal } from '@angular/core';
import { WINDOW_VISIBLE } from '../../ng/window-visibility';

const PKG_LINES = [
  'Reading package lists... Done',
  'Building dependency tree... Done',
  'Reading state information... Done',
  'Get:1 http://archive.bliss.os 2026 InRelease [22.1 kB]',
  'Unpacking libc-bin (2.35-0ubuntu3.8) over (2.35-0ubuntu3.7) ...',
  'Setting up cyber-core-kernel (6.12.0) ...',
  'Processing triggers for libc-bin (2.35-0ubuntu3.8) ...',
  'Preparing to unpack .../compiz-engine_0.9.14_amd64.deb ...',
  'Configuring blisscube-wm (2026.06) ...',
  'update-initramfs: Generating /boot/initrd.img-6.12.0-cyber-core',
  'apt-listchanges: Reading changelogs... Done',
  'done.',
];

/**
 * Borderless neon-green terminal: a static neofetch-style banner over a live
 * apt-upgrade log that scrolls forever. Logs live in a signal so the zoneless
 * change detector actually repaints on each push (a plain array would not).
 */
@Component({
  selector: 'bliss-system-terminal',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .terminal {
        box-sizing: border-box;
        height: 100%;
        background: rgba(0, 8, 4, 0.6);
        backdrop-filter: blur(10px);
        color: #00ff66;
        font-family: 'Consolas', 'DejaVu Sans Mono', monospace;
        font-size: 12px;
        line-height: 1.4;
        padding: 14px 16px;
        overflow: hidden;
        text-shadow: 0 0 4px rgba(0, 255, 102, 0.5);
      }
      .neofetch {
        display: flex;
        gap: 18px;
        align-items: center;
      }
      .ascii {
        color: #00ff66;
        font-size: 13px;
        margin: 0;
        white-space: pre;
      }
      .sys-info p {
        margin: 2px 0;
      }
      .sys-info .key {
        color: #6cff9e;
        font-weight: bold;
      }
      hr {
        border: none;
        border-top: 1px solid #0a3;
        margin: 10px 0;
        opacity: 0.5;
      }
      .logs {
        font-size: 11.5px;
        opacity: 0.92;
      }
      .logs p {
        margin: 1px 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cursor {
        animation: blink 1s steps(1) infinite;
      }
      @keyframes blink {
        50% {
          opacity: 0;
        }
      }
    `,
  ],
  template: `
    <div class="terminal">
      <div class="neofetch">
        <pre class="ascii">   ___
  /( )\\
  \\_^_/   Crystalfoxmaster
   /_\\    &#64; BlissCube</pre>
        <div class="sys-info">
          <p><span class="key">OS:</span> Bliss OS 2026 x86_64</p>
          <p><span class="key">Kernel:</span> 6.12.0-cyber-core</p>
          <p><span class="key">WM:</span> BlissCube (Compiz Engine)</p>
          <p><span class="key">Shell:</span> zsh 5.9 · <span class="key">Term:</span> bliss-term</p>
        </div>
      </div>
      <hr />
      <div class="logs">
        @for (line of logs(); track $index) {
          <p>{{ line }}</p>
        }
        <p>root&#64;crystalfox:~# apt upgrade -y<span class="cursor">_</span></p>
      </div>
    </div>
  `,
})
export class SystemTerminalApp implements OnDestroy {
  readonly logs = signal<string[]>(['Initializing system updates...']);
  private timer: ReturnType<typeof setInterval>;
  private i = 0;
  private visible = inject(WINDOW_VISIBLE);

  constructor() {
    this.timer = setInterval(() => {
      if (!this.visible()) return; // no log churn when off-face/minimized/hidden
      this.logs.update((ls) => {
        const next = [...ls, PKG_LINES[this.i % PKG_LINES.length]];
        this.i++;
        return next.length > 22 ? next.slice(next.length - 22) : next;
      });
    }, 320);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
