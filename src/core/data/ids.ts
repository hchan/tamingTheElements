/** Branded string ids. Values are stable kebab-case slugs; display names live in text-ids.ts. */
declare const brand: unique symbol;
type Brand<T extends string> = string & { readonly [brand]: T };

export type CharacterId = Brand<'CharacterId'>;
export type AbilityId = Brand<'AbilityId'>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function assertSlug(kind: string, s: string): void {
  if (!SLUG.test(s)) throw new Error(`${kind} must be a kebab-case slug, got "${s}"`);
}

export function characterId(slug: string): CharacterId {
  assertSlug('CharacterId', slug);
  return slug as CharacterId;
}

export function abilityId(slug: string): AbilityId {
  assertSlug('AbilityId', slug);
  return slug as AbilityId;
}
