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
    bodyClass: 'x-body'
  }
};

export const FALLBACK_SKIN_ID = 'x';

export function resolveSkin(id: string | undefined): SkinRegistration {
  return SKIN_COMPONENTS[id ?? ''] ?? SKIN_COMPONENTS[FALLBACK_SKIN_ID]!;
}

export function resolveSkinComponent(id: string | undefined): SkinComponent {
  return resolveSkin(id).component;
}

export function hasSkinComponent(id: string): boolean {
  return id in SKIN_COMPONENTS;
}
