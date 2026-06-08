import { Component, signal } from '@angular/core';

type Op = '+' | '-' | '×' | '÷';

@Component({
  selector: 'bliss-calculator',
  standalone: true,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #ece9d8;
        font-family: Tahoma, 'Segoe UI', sans-serif;
      }
      .display {
        margin: 8px;
        padding: 10px 12px;
        background: #1c2b1c;
        color: #b6f5b6;
        font-family: 'Consolas', monospace;
        font-size: 1.6rem;
        text-align: right;
        border: 2px inset #888;
        border-radius: 2px;
        min-height: 1.6rem;
        overflow: hidden;
      }
      .grid {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        padding: 0 8px 8px;
      }
      button {
        border: 1px solid #adacac;
        border-radius: 4px;
        background: linear-gradient(#fff, #dfe3ea);
        font-size: 1.05rem;
        cursor: pointer;
      }
      button:active {
        background: linear-gradient(#cfd6e0, #eef1f5);
      }
      button.op {
        background: linear-gradient(#fef6d8, #f3d98b);
      }
      button.eq {
        background: linear-gradient(#d6efff, #6cb6e8);
        grid-column: span 2;
      }
    `,
  ],
  template: `
    <div class="display" data-testid="calc-display">{{ display() }}</div>
    <div class="grid">
      <button (click)="clear()">C</button>
      <button (click)="sign()">±</button>
      <button (click)="percent()">%</button>
      <button class="op" (click)="setOp('÷')">÷</button>

      @for (n of [7, 8, 9]; track n) {
        <button (click)="digit(n)">{{ n }}</button>
      }
      <button class="op" (click)="setOp('×')">×</button>

      @for (n of [4, 5, 6]; track n) {
        <button (click)="digit(n)">{{ n }}</button>
      }
      <button class="op" (click)="setOp('-')">−</button>

      @for (n of [1, 2, 3]; track n) {
        <button (click)="digit(n)">{{ n }}</button>
      }
      <button class="op" (click)="setOp('+')">+</button>

      <button (click)="digit(0)">0</button>
      <button (click)="dot()">.</button>
      <button class="eq" (click)="equals()">=</button>
    </div>
  `,
})
export class CalculatorApp {
  readonly display = signal('0');
  private acc: number | null = null;
  private op: Op | null = null;
  private fresh = true;

  digit(n: number): void {
    const cur = this.fresh ? '' : this.display();
    this.display.set((cur === '0' ? '' : cur) + n);
    this.fresh = false;
  }

  dot(): void {
    if (this.fresh) {
      this.display.set('0.');
      this.fresh = false;
    } else if (!this.display().includes('.')) {
      this.display.set(this.display() + '.');
    }
  }

  setOp(op: Op): void {
    this.commit();
    this.op = op;
    this.fresh = true;
  }

  equals(): void {
    this.commit();
    this.op = null;
    this.fresh = true;
  }

  private commit(): void {
    const val = parseFloat(this.display());
    if (this.acc === null) {
      this.acc = val;
    } else if (this.op) {
      this.acc = this.apply(this.acc, val, this.op);
      this.display.set(this.format(this.acc));
    }
  }

  private apply(a: number, b: number, op: Op): number {
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '×':
        return a * b;
      case '÷':
        return b === 0 ? NaN : a / b;
    }
  }

  private format(n: number): string {
    if (!isFinite(n)) return 'Error';
    return String(Math.round(n * 1e10) / 1e10);
  }

  clear(): void {
    this.display.set('0');
    this.acc = null;
    this.op = null;
    this.fresh = true;
  }

  sign(): void {
    this.display.set(this.format(parseFloat(this.display()) * -1));
  }

  percent(): void {
    this.display.set(this.format(parseFloat(this.display()) / 100));
  }
}
