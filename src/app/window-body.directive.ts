import { Directive, inject, Input, OnInit, ViewContainerRef } from '@angular/core';
import { getApp } from '../ng/app-registry';

/**
 * Hosts an app's standalone Angular component inside a window body. Uses a
 * classic decorator @Input (not a signal input) because this project compiles
 * Angular in JIT mode via esbuild, where signal inputs aren't wired up — but
 * decorator inputs are. The component is created once, on init.
 */
@Directive({ selector: '[appWindowBody]', standalone: true })
export class WindowBodyDirective implements OnInit {
  @Input('appWindowBody') appId = '';
  private vcr = inject(ViewContainerRef);

  ngOnInit(): void {
    const def = getApp(this.appId);
    if (def) this.vcr.createComponent(def.component);
  }
}
