import type { SkinContext } from '../contract';
import XSkin from '../x/XSkin';
import './claude.css';

/**
 * Claude UI presentation for the complete forum experience.
 *
 * The X skin already implements every view in the v3 skin contract. Reusing
 * that render tree here keeps interactions and accessibility identical while
 * this skin supplies its own typography, colour system, spacing and surfaces.
 */
export default function ClaudeSkin({ forum }: { forum: SkinContext }) {
  return <XSkin forum={forum} />;
}
