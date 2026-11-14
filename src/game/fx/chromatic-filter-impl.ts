import Phaser from 'phaser';

/**
 * Loaded lazily by shock-view (`import()`), so unit tests that touch shock-view never evaluate Phaser. Renderer-only chromatic split: a tiny custom Phaser 4 filter (render node + controller) that samples red outward and blue
 * inward from the screen centre, so the fringe grows towards the edges and the middle stays clean. Phaser ships no such filter.
 */

const FRAG = [
  '#pragma phaserTemplate(shaderName)',
  'precision mediump float;',
  'uniform sampler2D uMainSampler;',
  'uniform float amount;',
  'varying vec2 outTexCoord;',
  '#pragma phaserTemplate(fragmentHeader)',
  'void main()',
  '{',
  '    vec2 d = (outTexCoord - 0.5) * amount * 2.0;',
  '    vec4 mid = boundedSampler(uMainSampler, outTexCoord);',
  '    float r = boundedSampler(uMainSampler, outTexCoord + d).r;',
  '    float b = boundedSampler(uMainSampler, outTexCoord - d).b;',
  '    gl_FragColor = vec4(r, mid.g, b, mid.a);',
  '}',
].join('\n');

export const CHROMATIC_NODE = 'FilterChromaticSplit';

export class ChromaticSplit extends Phaser.Filters.Controller {
  /** Offset as a fraction of the texture width (0 = no split). */
  amount = 0;
  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, CHROMATIC_NODE);
  }
}

class FilterChromaticSplit extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(CHROMATIC_NODE, manager, undefined, FRAG);
  }
  override setupUniforms(controller: ChromaticSplit): void {
    (this as unknown as { programManager: { setUniform(name: string, v: number): void } }).programManager.setUniform('amount', controller.amount);
  }
}

/** Adds a ChromaticSplit to the camera's external filters, or undefined without WebGL. Registers the render node once per renderer. */
export function addChromaticSplit(scene: Phaser.Scene): ChromaticSplit | undefined {
  const nodes = (scene.sys.game.renderer as { renderNodes?: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager }).renderNodes;
  if (!nodes) return undefined;
  const reg = nodes as unknown as { _nodes: Record<string, unknown> };
  if (!reg._nodes[CHROMATIC_NODE]) nodes.addNode(CHROMATIC_NODE, new FilterChromaticSplit(nodes));
  const f = new ChromaticSplit(scene.cameras.main);
  scene.cameras.main.filters.external.add(f);
  return f;
}
