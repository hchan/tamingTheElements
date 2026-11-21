import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_ICON_SLOTS, aiIconKeyOfSprite, aiIconUrl } from '../../src/game/hud/ability-icon-art';

const DIR = 'public/assets/img/hud/ability-icons-ai';
interface Entry { url: string; w: number; h: number; sha256: string; approval: { reviewer: string; beats_shipped: boolean } }
const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as { icons: Record<string, Entry> };
const approval = JSON.parse(readFileSync('tools/assets/icon-gen/provenance/ai-approval.json', 'utf8')) as Record<string, { reviewer: string; beats_shipped: boolean }>;

describe('AI ability icons (tools/assets/icon-gen/install-ai-ability-icons.py)', () => {
  it('has one 128 px PNG per slot, an art-director approval and a matching sha256', () => {
    expect(Object.keys(index.icons).sort()).toEqual([...AI_ICON_SLOTS].sort());
    expect(readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()).toEqual(AI_ICON_SLOTS.map((s) => `${s}.png`).sort());
    for (const slot of AI_ICON_SLOTS) {
      expect(approval[slot]?.reviewer, slot).toBe('art-director');
      expect(approval[slot]?.beats_shipped, slot).toBe(true);
      const bytes = readFileSync(`${DIR}/${slot}.png`);
      expect(createHash('sha256').update(bytes).digest('hex'), slot).toBe(index.icons[slot]?.sha256);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], slot).toEqual([128, 128]);
      expect(aiIconUrl(slot)).toBe(`assets/${index.icons[slot]?.url ?? ''}`);
    }
  });
  it('ties each keyed-output approval to the shipped bytes', () => {
    const keyed = JSON.parse(readFileSync('tools/assets/icon-gen/provenance/keyed-approval.json', 'utf8')) as Record<string, { reviewer?: string; sha256?: string }>;
    for (const [slot, v] of Object.entries(keyed)) {
      if (slot === '_note') continue;
      expect(v.reviewer, slot).toBe('art-director');
      expect(v.sha256, slot).toBe(index.icons[slot]?.sha256);
    }
  });
  it('maps the abilities that have an icon and no others', () => {
    expect(aiIconKeyOfSprite('emberBite')).toBe('hud:ability:ember_bite');
    expect(aiIconKeyOfSprite('talonRake')).toBe('hud:ability:gale_talon');
    expect(aiIconKeyOfSprite('stoop')).toBe('hud:ability:stoop');
    expect(aiIconKeyOfSprite('myceliumMend')).toBe('hud:ability:mycelium_mend');
    expect(aiIconKeyOfSprite('boulderRoll')).toBe('hud:ability:boulder_roll');
    expect(aiIconKeyOfSprite('abyssalPull')).toBeUndefined(); // REVISEd twice: reads as a twin of whirlpool, not installed
    expect(aiIconKeyOfSprite('kelpLash')).toBe('hud:ability:kelp_lash');
    expect(aiIconKeyOfSprite('moltenHide')).toBe('hud:ability:molten_hide');
    expect(aiIconKeyOfSprite('bellPulse')).toBe('hud:ability:bell_pulse');
    expect(aiIconKeyOfSprite('scorchBreath')).toBe('hud:ability:scorch_breath');
    expect(aiIconKeyOfSprite('wyrmCoil')).toBe('hud:ability:wyrm_coil');
    expect(aiIconKeyOfSprite('sporeBurst')).toBe('hud:ability:spore_burst');
    expect(aiIconKeyOfSprite('cinderSpray')).toBe('hud:ability:cinder_spray');
    expect(aiIconKeyOfSprite('staticMote')).toBe('hud:ability:static_mote');
    expect(aiIconKeyOfSprite('bristleStomp')).toBe('hud:ability:bristle_stomp');
    expect(aiIconKeyOfSprite('skitter')).toBeUndefined(); // failed five review rounds, not installed
    expect(aiIconKeyOfSprite('healSpring')).toBeUndefined();
    expect(aiIconKeyOfSprite('tideSurge')).toBeUndefined();
    expect(aiIconKeyOfSprite('whirlpool')).toBeUndefined();
    expect(aiIconKeyOfSprite('fireball')).toBeUndefined();
    expect(aiIconKeyOfSprite('')).toBeUndefined();
  });
});
