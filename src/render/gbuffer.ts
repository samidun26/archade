// Every material in the cartoon scenes writes a second output: its view-space normal.
// The ink pass uses it to draw crease lines. Transparent things write alpha 0 so they
// leave the normal buffer untouched under normal blending.

import type { Material, WebGLProgramParametersWithUniforms } from 'three';

export const GNORMAL_DECL = 'layout(location = 1) out highp vec4 gNormal;\n';

/** For shaders with a view-space `normal` in scope (lit materials). */
export const GNORMAL_WRITE_LIT = 'gNormal = vec4(normalize(normal) * 0.5 + 0.5, 1.0);\n';
/** "No normal" marker: zero vector. Used by the sky and flat unlit fills. */
export const GNORMAL_WRITE_NONE = 'gNormal = vec4(0.5, 0.5, 0.5, 1.0);\n';
/** Leave whatever is underneath. */
export const GNORMAL_WRITE_KEEP = 'gNormal = vec4(0.0);\n';

type Mode = 'none' | 'keep';

/** Patch a built-in unlit material (MeshBasic/Sprite) to write the second output. */
export function patchUnlit<T extends Material>(m: T, mode: Mode): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, r) => {
    prev?.call(m, shader, r);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GNORMAL_DECL)
      .replace(/}\s*$/, (mode === 'keep' ? GNORMAL_WRITE_KEEP : GNORMAL_WRITE_NONE) + '}\n');
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|gn-' + mode;
  return m;
}
