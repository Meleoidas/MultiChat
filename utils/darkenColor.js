export default function darkenColor(hex, percent = 40) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  const num = parseInt(hex, 16);
  let factor = 1 - (percent / 100);
  let r = Math.round((num >> 16) * factor);
  let g = Math.round(((num >> 8) & 0x00FF) * factor);
  let b = Math.round((num & 0x0000FF) * factor);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};