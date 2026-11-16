'use client';

import {
  CanvasTexture,
  ClampToEdgeWrapping,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * Shared clay-diorama materials with procedurally painted textures
 * (grass blades, dirt strata, sandy paths, wood grain, water ripples).
 * Created once, lazily, on the client.
 */

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(size: number, draw: (ctx: CanvasRenderingContext2D, s: number, r: () => number) => void, seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size, mulberry32(seed));
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function grass(): Texture {
  return paint(512, (ctx, s, r) => {
    ctx.fillStyle = '#86ad4f';
    ctx.fillRect(0, 0, s, s);
    // soft mottling
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(120,160,70,0.35)' : 'rgba(150,185,90,0.3)';
      ctx.beginPath();
      ctx.arc(r() * s, r() * s, 20 + r() * 50, 0, Math.PI * 2);
      ctx.fill();
    }
    // blades
    for (let i = 0; i < 2600; i++) {
      const x = r() * s;
      const y = r() * s;
      const h = 5 + r() * 9;
      ctx.strokeStyle = r() > 0.55 ? 'rgba(92,128,48,0.75)' : 'rgba(170,200,105,0.6)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 4, y - h);
      ctx.stroke();
    }
  }, 3);
}

function bank(): Texture {
  const tex = paint(256, (ctx, s, r) => {
    // dirt strata
    ctx.fillStyle = '#c48b55';
    ctx.fillRect(0, 0, s, s);
    for (let y = s * 0.2; y < s; y += 14 + r() * 10) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(150,100,58,0.55)' : 'rgba(214,160,104,0.5)';
      ctx.fillRect(0, y, s, 4 + r() * 5);
    }
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = 'rgba(120,80,45,0.35)';
      ctx.fillRect(r() * s, s * 0.22 + r() * s * 0.78, 3 + r() * 6, 2);
    }
    // grass lip with scalloped drips
    ctx.fillStyle = '#7ea347';
    ctx.fillRect(0, 0, s, s * 0.14);
    for (let x = 0; x < s; x += 16) {
      ctx.beginPath();
      ctx.arc(x + 8, s * 0.14, 8 + r() * 4, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(160,195,95,0.6)';
    ctx.fillRect(0, 0, s, s * 0.04);
  }, 5);
  tex.wrapT = ClampToEdgeWrapping;
  return tex;
}

function sand(): Texture {
  return paint(256, (ctx, s, r) => {
    ctx.fillStyle = '#e7c793';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(200,160,105,0.45)' : 'rgba(250,228,185,0.6)';
      ctx.fillRect(r() * s, r() * s, 2 + r() * 3, 2 + r() * 3);
    }
  }, 7);
}

function wood(): Texture {
  return paint(256, (ctx, s, r) => {
    ctx.fillStyle = '#c98d57';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 3 + r() * 5) {
      ctx.strokeStyle = r() > 0.5 ? 'rgba(160,104,58,0.45)' : 'rgba(225,170,115,0.35)';
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 2);
      ctx.stroke();
    }
  }, 9);
}

function water(): Texture {
  return paint(512, (ctx, s, r) => {
    ctx.fillStyle = '#4fb8bd';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(70,170,180,0.5)';
      ctx.beginPath();
      ctx.arc(r() * s, r() * s, 30 + r() * 60, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * s;
      const y = r() * s;
      const w = 16 + r() * 30;
      ctx.strokeStyle = 'rgba(200,245,240,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w / 2, y - 6, x + w, y);
      ctx.stroke();
    }
  }, 13);
}

function plaster(): Texture {
  return paint(256, (ctx, s, r) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(150,130,110,${0.05 + r() * 0.08})`;
      ctx.fillRect(r() * s, r() * s, 2 + r() * 4, 2 + r() * 4);
    }
  }, 17);
}

export interface WorldMaterials {
  grass: MeshStandardMaterial;
  bank: MeshStandardMaterial;
  bankTexture: Texture;
  sand: MeshStandardMaterial;
  wood: MeshStandardMaterial;
  woodDark: MeshStandardMaterial;
  water: MeshStandardMaterial;
  waterTexture: Texture;
  plaster: Texture;
  stone: MeshStandardMaterial;
  leaf: MeshStandardMaterial;
  bark: MeshStandardMaterial;
  lanternGlow: MeshStandardMaterial;
  petal: MeshStandardMaterial;
  flowerCenter: MeshStandardMaterial;
}

let materials: WorldMaterials | null = null;

export function getWorldMaterials(): WorldMaterials {
  if (materials) return materials;
  const grassTex = grass();
  grassTex.repeat.set(0.22, 0.22);
  const bankTex = bank();
  const sandTex = sand();
  sandTex.repeat.set(0.3, 0.3);
  const woodTex = wood();
  const waterTex = water();
  waterTex.repeat.set(0.08, 0.08);
  materials = {
    grass: new MeshStandardMaterial({ map: grassTex, roughness: 0.95 }),
    bank: new MeshStandardMaterial({ map: bankTex, roughness: 0.95 }),
    bankTexture: bankTex,
    sand: new MeshStandardMaterial({ map: sandTex, roughness: 1 }),
    wood: new MeshStandardMaterial({ map: woodTex, roughness: 0.8 }),
    woodDark: new MeshStandardMaterial({ map: woodTex, color: '#a46a3f', roughness: 0.85 }),
    water: new MeshStandardMaterial({ map: waterTex, roughness: 0.25, metalness: 0.05 }),
    waterTexture: waterTex,
    plaster: plaster(),
    stone: new MeshStandardMaterial({ color: '#efe6d6', roughness: 0.9 }),
    leaf: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
    bark: new MeshStandardMaterial({ map: woodTex, color: '#9a6238', roughness: 0.9 }),
    lanternGlow: new MeshStandardMaterial({
      color: '#fff1c4',
      emissive: '#ffbf4d',
      emissiveIntensity: 3.2,
      roughness: 0.4,
    }),
    petal: new MeshStandardMaterial({ color: '#fffaf0', roughness: 0.7 }),
    flowerCenter: new MeshStandardMaterial({ color: '#f5c242', roughness: 0.6 }),
  };
  return materials;
}
