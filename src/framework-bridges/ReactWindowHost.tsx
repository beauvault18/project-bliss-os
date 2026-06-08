import type { ComponentType } from 'react';

/** Renders a React app component as a window body. */
export function ReactWindowHost({
  component: Component,
  windowId,
}: {
  component: ComponentType<{ windowId: string }>;
  windowId: string;
}) {
  return <Component windowId={windowId} />;
}
