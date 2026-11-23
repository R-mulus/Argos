/**
 * Lê latitude e longitude coladas pelo usuário: "-18.5789, -46.5181", "-18,5789 -46,5181" ou um link
 * do Google Maps com "@lat,lon", "!3dlat!4dlon", "q=lat,lon" ou "ll=lat,lon". Links curtos
 * (maps.app.goo.gl) não trazem as coordenadas e não podem ser lidos sem consultar o Google.
 */
export type Coordenada = { latitude: number; longitude: number };

const valida = (latitude: number, longitude: number): Coordenada | null =>
  Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 85 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0)
    ? { latitude, longitude }
    : null;

export function lerCoordenada(texto: string): Coordenada | null {
  const t = decodeURIComponent(texto.trim());
  if (!t) return null;
  const numero = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
  const padroes = [
    new RegExp(String.raw`!3d(${numero})!4d(${numero})`),
    new RegExp(String.raw`@(${numero}),(${numero})`),
    new RegExp(String.raw`[?&](?:q|ll|query|center)=(${numero}),\s*(${numero})`),
  ];
  for (const padrao of padroes) {
    const m = t.match(padrao);
    if (m) return valida(Number(m[1]), Number(m[2]));
  }
  if (/^https?:/i.test(t)) return null;
  // Texto solto: vírgula decimal ("-18,5789 -46,5181") ou ponto ("-18.5789, -46.5181").
  const partes = /^[^,]*\.[^,]*,/.test(t) || /^\s*[-+]?\d+\.\d+\s*,/.test(t)
    ? t.split(/[,;]\s*|\s+/)
    : t.split(/[;\s]+/).map(p => p.replace(",", "."));
  const nums = partes.filter(Boolean).map(Number);
  return nums.length === 2 ? valida(nums[0], nums[1]) : null;
}

export const formatarCoordenada = (v: number) => v.toFixed(6);
