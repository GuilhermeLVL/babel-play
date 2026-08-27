/**
 * RASTRO DO MOUSE — partículas seguindo o cursor (referência: cursor-trails.com e a família de
 * extensões de cursor; aqui é nativo do app e vira item de loja).
 *
 * Um listener global de pointermove (com acelerador: no máximo uma emissão a cada ~45 ms e só
 * com movimento real) + pointerdown (mini-explosão no clique). As partículas saem pelo MESMO
 * barramento das comemorações (`emitBurst`), então o canvas, os tetos e as guardas de
 * animação/desempenho existentes valem sem código novo. Estilo persistido em `babel.rastro`
 * ('off' desliga; é o padrão — rastro é conquista da loja, não ruído de fábrica).
 */
import { emitBurst, type BurstKind } from './effects';

export interface EstiloDeRastro { id: string; nome: string; kind: BurstKind }

export const RASTROS: EstiloDeRastro[] = [
  { id: 'off', nome: 'Desligado', kind: 'xp' },
  { id: 'faisca', nome: 'Faíscas', kind: 'rastroFaisca' },
  { id: 'estrelas', nome: 'Estrelas', kind: 'rastroEstrelas' },
  { id: 'coracoes', nome: 'Corações', kind: 'rastroCoracoes' },
  { id: 'pixel', nome: 'Pixel', kind: 'rastroPixel' },
  { id: 'emoji', nome: 'Emoji (pack equipado)', kind: 'rastroEmoji' },
];

const CHAVE = 'babel.rastro';
const INTERVALO_MS = 45;
const DISTANCIA_MIN = 14;

export function readRastro(): string {
  try {
    const v = localStorage.getItem(CHAVE) ?? 'off';
    return RASTROS.some((r) => r.id === v) ? v : 'off';
  } catch { return 'off'; }
}

export function setRastro(id: string): string {
  const valido = RASTROS.some((r) => r.id === id) ? id : 'off';
  try { localStorage.setItem(CHAVE, valido); } catch { /* sem storage */ }
  return valido;
}

function animacoesDesligadas(): boolean {
  const b = document.body;
  return b.classList.contains('performance-mode') || b.classList.contains('animations-off');
}

let instalado = false;

/** Instala os listeners UMA vez (App). O estilo é relido a cada evento: trocar na Loja vale na hora. */
export function instalarRastroDoMouse(): void {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  let ultimoT = 0;
  let ultimoX = -999;
  let ultimoY = -999;

  window.addEventListener('pointermove', (e) => {
    const id = readRastro();
    if (id === 'off' || animacoesDesligadas()) return;
    const agora = performance.now();
    if (agora - ultimoT < INTERVALO_MS) return;
    const dx = e.clientX - ultimoX;
    const dy = e.clientY - ultimoY;
    if (dx * dx + dy * dy < DISTANCIA_MIN * DISTANCIA_MIN) return;
    ultimoT = agora;
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    const estilo = RASTROS.find((r) => r.id === id);
    if (estilo) emitBurst(e.clientX, e.clientY, estilo.kind);
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => {
    const id = readRastro();
    if (id === 'off' || animacoesDesligadas()) return;
    const estilo = RASTROS.find((r) => r.id === id);
    // Clique = três emissões rápidas: a mini-explosão que dá peso ao toque.
    if (estilo) for (let i = 0; i < 3; i++) setTimeout(() => emitBurst(e.clientX, e.clientY, estilo.kind), i * 40);
  }, { passive: true });
}
