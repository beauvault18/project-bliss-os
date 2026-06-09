import { Component, signal } from '@angular/core';

@Component({
  selector: 'bliss-notepad',
  standalone: true,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #fff;
      }
      textarea {
        flex: 1;
        border: 0;
        outline: none;
        resize: none;
        padding: 10px 12px;
        font-family: 'Consolas', 'Lucida Console', monospace;
        font-size: 0.95rem;
        line-height: 1.45;
        color: #1a1a1a;
      }
      .status {
        border-top: 1px solid #d6d2c4;
        background: #ece9d8;
        padding: 2px 8px;
        font: 0.72rem Tahoma, sans-serif;
        color: #555;
        text-align: right;
      }
    `,
  ],
  template: `
    <textarea
      data-testid="notepad-text"
      [value]="text()"
      (input)="onInput($event)"
      spellcheck="false"
      placeholder="Type here…"
    ></textarea>
    <div class="status">{{ text().length }} chars</div>
  `,
})
export class NotepadApp {
  readonly text = signal('');
  onInput(e: Event): void {
    this.text.set((e.target as HTMLTextAreaElement).value);
  }
}
