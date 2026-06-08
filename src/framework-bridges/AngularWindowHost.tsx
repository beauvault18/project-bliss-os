import { useEffect, useRef } from 'react';
import {
  createComponent,
  provideExperimentalZonelessChangeDetection,
  type ApplicationRef,
  type ComponentRef,
  type Type,
} from '@angular/core';
import { createApplication } from '@angular/platform-browser';

/**
 * Mounts a standalone, zoneless Angular component as a window body.
 *
 * Uses createApplication + createComponent (rather than bootstrapApplication)
 * so multiple instances of the same app — each with its own host element — work
 * correctly. Teardown happens in the effect cleanup, which React runs BEFORE it
 * detaches the host node, avoiding "destroy after detach" leaks. An `aborted`
 * flag guards the open→instant-close race while createApplication is in flight.
 */
export function AngularWindowHost({ component }: { component: Type<unknown> }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let aborted = false;
    let appRef: ApplicationRef | null = null;
    let compRef: ComponentRef<unknown> | null = null;

    createApplication({
      providers: [provideExperimentalZonelessChangeDetection()],
    })
      .then((ref) => {
        if (aborted) {
          ref.destroy();
          return;
        }
        appRef = ref;
        compRef = createComponent(component, {
          hostElement: host,
          environmentInjector: ref.injector,
        });
        ref.attachView(compRef.hostView);
      })
      .catch((err) => console.error('Angular window bootstrap failed:', err));

    return () => {
      aborted = true;
      try {
        compRef?.destroy();
      } catch {
        /* already destroyed */
      }
      try {
        appRef?.destroy();
      } catch {
        /* already destroyed */
      }
    };
  }, [component]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
