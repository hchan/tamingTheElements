import { EntityFlag, type RenderView } from '@core/index';
import { GRIM_SUFFIX } from '../fx/hero-grade';
import { idleLookOf } from '../platform/idle-look';
import { boxSpanX, frameBox, type SpanX } from './hero-scale';
import { SLOTS, type SheetDrawn } from './pose-layer-types';
import type { PoseSlots } from './pose-slots';
import type { PoseDepthState } from './pose-depth-state';
import type { CharacterView } from './character-view';

const DEAD_OR_BENCHED = EntityFlag.benched | EntityFlag.dead;
const probeSpan: SpanX = { min: 0, max: 0 };

/** Test probe: per drawn character, the texture, frame, mirror, rotation and visual box shown. */
export function drawnCharacters(
  view: RenderView,
  characters: { peek(id: number): Pick<CharacterView, 'image'> | undefined },
  slots: Pick<PoseSlots, 'back' | 'mRot' | 'mOy' | 'mAlpha'>,
  depth: Pick<PoseDepthState, 'z' | 'dolly'>,
): SheetDrawn[] {
  const out: SheetDrawn[] = [];
  view.forEachCharacter((c) => {
    const img = characters.peek(c.id)?.image;
    if (img && (c.flags & DEAD_OR_BENCHED) === 0) {
      const box = frameBox(img.frame);
      // the visual-box height actually drawn: the whole display for a frame without a box, the box's share for a boxed one
      const span = boxSpanX(img, img.rotation, probeSpan);
      const bodyHeight = box ? (img.displayHeight * box.h) / img.frame.height : img.displayHeight;
      const s = c.id & (SLOTS - 1);
      out.push({ id: c.id, texture: img.texture.key.replace(GRIM_SUFFIX, ''), frame: img.frame.name, flipX: img.flipX, rotation: img.rotation, graded: img.texture.key.endsWith(GRIM_SUFFIX), bodyHeight,
        boxL: Math.round(span.min * 10) / 10, boxR: Math.round(span.max * 10) / 10,
        back: Math.round((slots.back[s] ?? 0) * 100) / 100,
        motif: idleLookOf(c.sprite, c.element).motif,
        motifRot: Math.round((slots.mRot[s] ?? 0) * 1000) / 1000,
        motifOy: Math.round((slots.mOy[s] ?? 0) * 1000) / 1000,
        motifAlpha: Math.round((slots.mAlpha[s] ?? 1) * 1000) / 1000,
        depth: Math.round((depth.z[s] ?? 0) * 100) / 100,
        dolly: Math.round((depth.dolly[s] ?? 1) * 1000) / 1000,
      });
    }
  });
  return out;
}
