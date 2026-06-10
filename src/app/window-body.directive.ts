import { computed, Directive, inject, Injector, Input, OnInit, ViewContainerRef } from '@angular/core';
import { getApp } from '../ng/app-registry';
import { WindowStore } from '../ng/window-store';
import { WorkspaceStore } from '../ng/workspace-store';
import { PageVisibilityService, WINDOW_VISIBLE } from '../ng/window-visibility';

/**
 * Hosts an app's standalone Angular component inside a window body. Uses a
 * classic decorator @Input (not a signal input) because this project compiles
 * Angular in JIT mode via esbuild, where signal inputs aren't wired up — but
 * decorator inputs are. The component is created once, on init.
 *
 * It also provides a per-window {@link WINDOW_VISIBLE} signal so the app can
 * pause its animation when its window is off-face, minimized, or backgrounded.
 */
@Directive({ selector: '[appWindowBody]', standalone: true })
export class WindowBodyDirective implements OnInit {
  @Input('appWindowBody') appId = '';
  @Input() winId = '';
  private vcr = inject(ViewContainerRef);
  private store = inject(WindowStore);
  private ws = inject(WorkspaceStore);
  private pv = inject(PageVisibilityService);

  ngOnInit(): void {
    const def = getApp(this.appId);
    if (!def) return;
    const winId = this.winId;
    const visible = computed(
      () => {
        const w = this.store.windows().find((x) => x.id === winId);
        return !!w && !w.minimized && w.workspace === this.ws.active() && !this.pv.hidden();
      },
    );
    const injector = Injector.create({
      providers: [{ provide: WINDOW_VISIBLE, useValue: visible }],
      parent: this.vcr.injector,
    });
    this.vcr.createComponent(def.component, { injector });
  }
}
