import type Phaser from 'phaser';

/**
 * Optional painted plates for the feet rings (idea status-effect-ring-art): freeze (status 5) and daze (10). A plate is loaded
 * lazily the first time its status is on screen; until it is ready, or if it fails to load, the procedural ring (status-ring.ts)
 * is drawn. Presentation only. Art: public/assets/img/fx/status/, tools/assets/status-ring/.
 */
export const RING_ART: Readonly<Record<number, { readonly key: string; readonly url: string }>> = {
  5: { key: 'status-ring-freeze', url: 'assets/img/fx/status/freeze.png' },
  10: { key: 'status-ring-daze', url: 'assets/img/fx/status/daze.png' },
};

export type ArtState = 'idle' | 'loading' | 'ready' | 'error';

/** Which path draws a ring: the plate only when the status has one and it is loaded. */
export function ringPath(status: number, state: ArtState | undefined): 'texture' | 'procedural' {
  return RING_ART[status] !== undefined && state === 'ready' ? 'texture' : 'procedural';
}

export interface RingArt {
  /** Starts a lazy load if the status has a plate and none was tried; returns the path to draw now. */
  path(status: number): 'texture' | 'procedural';
  dispose(): void;
}

export function createRingArt(scene: Phaser.Scene, base: string): RingArt {
  const states = new Map<number, ArtState>();
  const root = base.endsWith('/') ? base : `${base}/`;
  const keyStatus = new Map<string, number>();
  const onError = (file: { key?: string }): void => {
    const st = file.key === undefined ? undefined : keyStatus.get(file.key);
    if (st !== undefined) states.set(st, 'error');
  };
  scene.load.on('loaderror', onError);
  const request = (status: number, art: { key: string; url: string }): void => {
    keyStatus.set(art.key, status);
    if (scene.textures.exists(art.key)) {
      states.set(status, 'ready');
      return;
    }
    states.set(status, 'loading');
    scene.load.once(`filecomplete-image-${art.key}`, () => {
      if (states.get(status) === 'loading') states.set(status, scene.textures.exists(art.key) ? 'ready' : 'error');
    });
    scene.load.image(art.key, `${root}${art.url}`);
    if (!scene.load.isLoading()) scene.load.start();
  };
  return {
    path(status) {
      const art = RING_ART[status];
      if (!art) return 'procedural';
      if (states.get(status) === undefined) request(status, art);
      return ringPath(status, states.get(status));
    },
    dispose() {
      scene.load.off('loaderror', onError);
      states.clear();
    },
  };
}
