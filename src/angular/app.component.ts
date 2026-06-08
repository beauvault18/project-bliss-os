import { Component, signal, VERSION } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <section class="panel panel--angular">
      <span class="badge">Angular</span>
      <h2>Hello from Angular 🅰️</h2>
      <p>This panel is rendered by Angular v{{ angularVersion }}.</p>
      <button (click)="increment()">
        Clicked {{ count() }} {{ count() === 1 ? 'time' : 'times' }}
      </button>
    </section>
  `,
})
export class AngularAppComponent {
  readonly angularVersion = VERSION.full;
  readonly count = signal(0);

  increment(): void {
    this.count.update((c) => c + 1);
  }
}
