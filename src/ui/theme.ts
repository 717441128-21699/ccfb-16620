export const DESIGN_W = 1366;
export const DESIGN_H = 860;

export const theme = {
  bg0: '#120e0b',
  bg1: '#1d1712',
  panel: '#241c16',
  panel2: '#2e231b',
  panel3: '#3a2b20',
  border: '#51402f',
  borderSoft: '#3a2e24',
  text: '#f7ead6',
  muted: '#c2ad92',
  faint: '#8d7961',
  copper: '#d9822b',
  copperBright: '#f29e44',
  gold: '#f2c94c',
  green: '#7bc96f',
  red: '#eb6a5c',
  blue: '#75b7ff',
  purple: '#c58af9',
  cream: '#fff3d6',
};

export const FONT = {
  sans: '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",system-ui,-apple-system,Segoe UI,sans-serif',
  num: '"Bahnschrift","DIN Alternate","Segoe UI",system-ui,sans-serif',
};

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
