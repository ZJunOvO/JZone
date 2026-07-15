const COVER_PALETTES = [
  ['#3157c8', '#79d3e8', '#edf0c4'],
  ['#ef3340', '#ff7a18', '#ffd166'],
  ['#9b2fd0', '#ed4f91', '#ffb56b'],
  ['#167d78', '#48b7a4', '#e8d98b'],
  ['#3056a6', '#8c6bc4', '#e7a1bd'],
  ['#b83b5e', '#e76f51', '#f4d58d'],
] as const;

const hashSeed = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getSongCoverFallback = (seed: string) => {
  const hash = hashSeed(seed || 'jzone');
  const palette = COVER_PALETTES[hash % COVER_PALETTES.length];
  const glowX = 24 + (hash % 54);
  const glowY = 18 + ((hash >>> 7) % 62);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset=".58" stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[2]}"/></linearGradient><radialGradient id="r" cx="${glowX}%" cy="${glowY}%" r="72%"><stop stop-color="#fff" stop-opacity=".42"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></radialGradient></defs><rect width="400" height="400" fill="url(#g)"/><rect width="400" height="400" fill="url(#r)"/><circle cx="318" cy="78" r="96" fill="#fff" opacity=".08"/><circle cx="70" cy="342" r="130" fill="#000" opacity=".1"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
