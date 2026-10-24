/**
 * The frontend skin registry.
 *
 * Keys are the skin ids the backend also knows about (src/modules/site/skins.ts).
 * `component` is a lazy import so an unused skin is never downloaded: the
 * browser only fetches the chunk for the skin actually being rendered.
 *
 * `bodyClass` is applied to <body> while that skin is active. Skins that rely
 * on body-level backgrounds (like Endfield's contour art) declare it here
 * instead of mutating the DOM themselves, which keeps skins pure.
 *
 * To add a skin:
 *   1. create frontend/src/skins/<id>/<Name>.tsx  (default-exports SkinComponent)
 *   2. add an entry here
 *   3. add a descriptor in src/modules/site/skins.ts and enable it from the
 *      admin console's Appearance tab.
 */
import { lazy, type ComponentType } from 'react';
import type { SkinContext } from './contract';

export type SkinComponent = ComponentType<{ forum: SkinContext }>;

export interface SkinRegistration {
  component: SkinComponent;
  /** Applied to <body> while this skin renders. */
  bodyClass: string;
}

export const SKIN_COMPONENTS: Record<string, SkinRegistration> = {
  x: {
    component: lazy(() => import('./x/XSkin')),
    bodyClass: 'xsk-body'
  },
  endfield: {
    component: lazy(() => import('./endfield/EndfieldSkin')),
    bodyClass: 'ef-body ef-contours'
  }
};

/** Fallback used when a configured skin id has no frontend implementation yet. */
export const FALLBACK_SKIN_ID = 'endfield';

export function resolveSkin(id: string | undefined): SkinRegistration {
  return SKIN_COMPONENTS[id ?? ''] ?? SKIN_COMPONENTS[FALLBACK_SKIN_ID]!;
}

export function resolveSkinComponent(id: string | undefined): SkinComponent {
  return resolveSkin(id).component;
}

export function hasSkinComponent(id: string): boolean {
  return id in SKIN_COMPONENTS;
}