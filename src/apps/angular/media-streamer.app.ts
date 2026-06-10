import { Component } from '@angular/core';

/**
 * 16:9 video-stream layout standing in for a dark cybernetic club feed: a
 * high-saturation magenta→blue gradient with drifting "stage light" sweeps, a
 * LIVE badge and a faux scrub bar. Pure CSS animation, so nothing to tear down.
 */
@Component({
  selector: 'bliss-media-streamer',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .wrap {
        width: 100%;
        height: 100%;
        background: rgba(5, 5, 5, 0.45);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .player {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        max-height: 100%;
        background: linear-gradient(135deg, #ff007f 0%, #7a00ff 45%, #0030ff 100%);
        overflow: hidden;
      }
      /* Drifting stage lights. */
      .player::before,
      .player::after {
        content: '';
        position: absolute;
        width: 60%;
        height: 160%;
        top: -30%;
        background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.35), transparent 60%);
        filter: blur(8px);
        animation: sweep 6s ease-in-out infinite;
      }
      .player::after {
        animation-delay: -3s;
        background: radial-gradient(ellipse at center, rgba(0, 255, 240, 0.3), transparent 60%);
      }
      @keyframes sweep {
        0% {
          transform: translateX(-30%) rotate(8deg);
        }
        50% {
          transform: translateX(90%) rotate(-8deg);
        }
        100% {
          transform: translateX(-30%) rotate(8deg);
        }
      }
      .live {
        position: absolute;
        top: 12px;
        left: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(220, 0, 30, 0.9);
        color: #fff;
        padding: 4px 9px;
        font: bold 11px/1 'Segoe UI', sans-serif;
        letter-spacing: 0.5px;
        border-radius: 3px;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #fff;
        animation: pulse 1.2s ease-in-out infinite;
      }
      @keyframes pulse {
        50% {
          opacity: 0.25;
        }
      }
      .title {
        position: absolute;
        left: 14px;
        bottom: 34px;
        color: #fff;
        font: 600 15px/1.2 'Segoe UI', sans-serif;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
      }
      .scrub {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 14px;
        height: 4px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.25);
      }
      .scrub > i {
        position: absolute;
        inset: 0 60% 0 0;
        background: #ff2d78;
        border-radius: 2px;
        animation: prog 14s linear infinite;
      }
      @keyframes prog {
        from {
          right: 100%;
        }
        to {
          right: 0%;
        }
      }
    `,
  ],
  template: `
    <div class="wrap">
      <div class="player">
        <span class="live"><span class="dot"></span>LIVE DJ PERFORMANCE</span>
        <span class="title">Neon Substrata · Sector 7 Mainstage</span>
        <div class="scrub"><i></i></div>
      </div>
    </div>
  `,
})
export class MediaStreamerApp {}
