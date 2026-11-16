import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GraphicsQuality = 'low' | 'medium' | 'high';

/** Player-chosen graphics options (Options menu). Kept apart from the profile so New Game doesn't reset them. */
export interface GraphicsSettings {
  quality: GraphicsQuality;
  shadows: boolean;
  bloom: boolean;
}

export const DEFAULT_SETTINGS: GraphicsSettings = { quality: 'high', shadows: true, bloom: true };

/** What each quality level costs: render resolution cap, ambient occlusion, sun shadow-map size. */
export const QUALITY_PRESETS: Record<GraphicsQuality, { maxDpr: number; ao: boolean; shadowMapSize: number }> = {
  low: { maxDpr: 1, ao: false, shadowMapSize: 1024 },
  medium: { maxDpr: 1.25, ao: true, shadowMapSize: 2048 },
  high: { maxDpr: 1.75, ao: true, shadowMapSize: 4096 },
};

interface SettingsState extends GraphicsSettings {
  save: (settings: GraphicsSettings) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      save: (settings) => set(settings),
    }),
    { name: 'trioe-3d-settings' }
  )
);
