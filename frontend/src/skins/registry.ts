import { lazy, type ComponentType } from 'react';
import type { SkinContext } from './contract';

export type SkinComponent = ComponentType<{ forum: SkinContext }>;

export interface SkinRegistration {
  component: SkinComponent;
  /** Applied to <body> while this skin renders. */
  bodyClass: string;
}

/**
 * The production forum skin is intentionally absent while its UI is rebuilt.
 * Register a future skin here and add its server descriptor in
 * src/modules/site/skins.ts. Keep the fallback pointing at a renderable skin.
 */
export const SKIN_COMPONENTS: Record<string, SkinRegistration> = {
  placeholder: {
    component: lazy(() => import('./placeholder/PlaceholderSkin')),
    bodyClass: 'placeholder-body'
  }
};

export const FALLBACK_SKIN_ID = 'placeholder';

export function resolveSkin(id: string | undefined): SkinRegistration {
  return SKIN_COMPONENTS[id ?? ''] ?? SKIN_COMPONENTS[FALLBACK_SKIN_ID]!;
}

export function resolveSkinComponent(id: string | undefined): SkinComponent {
  return resolveSkin(id).component;
}

export function hasSkinComponent(id: string): boolean {
  return id in SKIN_COMPONENTS;
}
