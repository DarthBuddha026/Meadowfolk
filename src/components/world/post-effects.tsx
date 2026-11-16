'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { builtinAOContext, convertToTexture, float, length, mrt, normalView, pass, screenUV, smoothstep } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { QUALITY_PRESETS, useSettings } from '@/game/state/settings-store';

/**
 * WebGPU post-processing (TSL node pipeline, also runs on the WebGL2 fallback):
 *  - GTAO ambient occlusion + denoise → the soft "clay diorama" contact shading
 *    (Medium/High quality only).
 *    Its noise pattern is static (no temporal jitter), so it doesn't shimmer.
 *  - Bloom on bright emissives (lanterns, LEDs, the Junction crystal), if enabled in Options.
 *  - A gentle vignette.
 * Tone mapping + sRGB output are applied once at the end by the pipeline.
 */
export function PostEffects() {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as WebGPURenderer;

  // Options: AO is part of the graphics quality level, bloom has its own toggle.
  // Changing either rebuilds the pipeline (once, when the player saves settings).
  const aoEnabled = useSettings((s) => QUALITY_PRESETS[s.quality].ao);
  const bloomEnabled = useSettings((s) => s.bloom);

  const pipeline = useMemo(() => {
    const pipeline = new RenderPipeline(renderer);
    const scenePass = pass(scene, camera);

    if (aoEnabled) {
      // Pre-pass: view-space normals + depth for the AO. Single-sampled: GTAO can't read
      // a multisampled depth texture; the main pass below keeps the renderer's MSAA.
      const prePass = pass(scene, camera, { samples: 0 });
      prePass.setMRT(mrt({ output: normalView }));
      const prePassNormal = prePass.getTextureNode();
      const prePassDepth = prePass.getTextureNode('depth');

      const aoPass = ao(prePassDepth, prePassNormal, camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 0.6;
      aoPass.thickness.value = 0.8;
      aoPass.scale.value = 1.15;
      const aoDenoised = convertToTexture(denoise(aoPass.getTextureNode(), prePassDepth, prePassNormal, camera));

      // Main pass with AO feeding the lighting model's indirect occlusion.
      scenePass.contextNode = builtinAOContext(aoDenoised.sample(screenUV).r);
    }
    const color = scenePass.getTextureNode('output');

    const lit = bloomEnabled ? color.add(bloom(color, 0.4, 0.35, 0.85)) : color;
    const vignette = smoothstep(float(0.85), float(0.3), length(screenUV.sub(0.5)).mul(1.15)).mul(0.4).add(0.6);

    pipeline.outputNode = lit.mul(vignette);
    return pipeline;
  }, [renderer, scene, camera, aoEnabled, bloomEnabled]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);

  // Priority 1 takes over rendering from R3F's default render call.
  useFrame(() => {
    pipeline.render();
  }, 1);

  return null;
}
