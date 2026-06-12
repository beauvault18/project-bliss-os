import { computed, Directive, inject, Injector, Input, OnInit, ViewContainerRef } from '@angular/core';
import { getApp } from '../ng/app-registry';
import { WindowStore } from '../ng/window-store';
import { WorkspaceStore } from '../ng/workspace-store';
import { PageVisibilityService, WINDOW_VISIBLE } from '../ng/window-visibility';
import { WINDOW_PARAMS } from '../ng/window-params';

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
        // In Free-Look every face is on display, so every app stays live —
        // the floating cube reads as a real machine, not a screenshot.
        const onShow = !!w && (w.workspace === this.ws.active() || this.ws.mode() === 'FREE');
        return !!w && !w.minimized && onShow && !this.pv.hidden();
      },
    );
    const params = this.store.windows().find((x) => x.id === winId)?.params ?? {};
    const injector = Injector.create({
      providers: [
        { provide: WINDOW_VISIBLE, useValue: visible },
        { provide: WINDOW_PARAMS, useValue: params },
      ],
      parent: this.vcr.injector,
    });
    this.vcr.createComponent(def.component, { injector });
  }
}
