/**
 * RASTRO DO MOUSE — partículas seguindo o cursor (referência: cursor-trails.com e a família de
 * extensões de cursor; aqui é nativo do app e vira item de loja).
 *
 * Um listener global de pointermove (com acelerador: no máximo uma emissão a cada ~45 ms e só
 * com movimento real) + pointerdown (mini-explosão no clique). As partículas saem pelo MESMO
 * barramento das comemorações (`emitBurst`), então o canvas, os tetos e as guardas de
 * animação/desempenho existentes valem sem código novo. Estilo persistido em `babel.rastro`
 * ('off' desliga; é o padrão — rastro é conquista da loja, não ruído de fábrica).
 *
 * GALERIA (2026-08-28): além dos estilos fixos, existem os PERSONALIZADOS, codificados no id:
 *   · `gen:<forma>:<paleta>`  — forma (faisca|estrelas|coracoes|pixel|arcoiris) nas cores da
 *                               paleta da galeria (`lib/galeria/paletas`);
 *   · `emojis:<lista>`         — emojis escolhidos um a um (separados por vírgula);
 *   · `croma:<forma>:<matiz>`  — forma na COR DE UM CROMA comprado (inventario-e-cromas).
 *
 * Por que o croma não reusa `gen:`: `gen:` aponta para uma PALETA da galeria, que tem porta
 * própria por estilo (`acessoAoEstilo`). Um croma é outra compra, com outro preço, e apontar
 * para uma paleta faria a compra de 25 Seeds abrir de lado um produto de 380. O croma carrega
 * o matiz e nada mais — a cor sai dele, não de uma paleta que a pessoa não comprou.
 * Nada disso cria spec nova: `estiloDeRastro()` resolve o id para um `kind` base + um
 * `sobrescrever` (cores/emojis) e o canvas aplica por cima. Centenas de combinações, zero custo.
 */
import { type BurstKind, type BurstSpec,emitBurst } from './effects';
import { sanearListaDeEmojis } from './galeria/emojis';
import { coresDaPaleta, MATIZES,paletaPorId } from './galeria/paletas';

export interface EstiloDeRastro { id: string; nome: string; kind: BurstKind }

export const RASTROS: EstiloDeRastro[] = [
  { id: 'off', nome: 'Desligado', kind: 'xp' },
  { id: 'faisca', nome: 'Faíscas', kind: 'rastroFaisca' },
  { id: 'estrelas', nome: 'Estrelas', kind: 'rastroEstrelas' },
  { id: 'coracoes', nome: 'Corações', kind: 'rastroCoracoes' },
  { id: 'pixel', nome: 'Pixel', kind: 'rastroPixel' },
  { id: 'emoji', nome: 'Emoji (pack equipado)', kind: 'rastroEmoji' },
  /* Exclusivo de conquista ("Colecionador"): não está à venda. */
  { id: 'arcoiris', nome: 'Arco-íris', kind: 'rastroArcoiris' },
];

/** Formas que aceitam paleta no rastro personalizado. */
export const FORMAS_DE_RASTRO: Array<{ id: string; nome: string; kind: BurstKind }> = [
  { id: 'faisca', nome: 'Faíscas', kind: 'rastroFaisca' },
  { id: 'estrelas', nome: 'Estrelas', kind: 'rastroEstrelas' },
  { id: 'coracoes', nome: 'Corações', kind: 'rastroCoracoes' },
  { id: 'pixel', nome: 'Pixel', kind: 'rastroPixel' },
  { id: 'arcoiris', nome: 'Bolinhas', kind: 'rastroArcoiris' },
];

const CHAVE = 'babel.rastro';
const INTERVALO_MS = 45;
const DISTANCIA_MIN = 14;

export interface RastroResolvido { kind: BurstKind; sobrescrever?: Partial<BurstSpec>; nome: string }

/** Resolve QUALQUER id (fixo ou personalizado) para o que o canvas precisa. `null` = inválido. */
export function estiloDeRastro(id: string): RastroResolvido | null {
  const fixo = RASTROS.find((r) => r.id === id);
  if (fixo) return fixo.id === 'off' ? null : { kind: fixo.kind, nome: fixo.nome };
  if (id.startsWith('gen:')) {
    const [, formaId, paletaId] = id.split(':');
    const forma = FORMAS_DE_RASTRO.find((f) => f.id === formaId);
    const paleta = paletaPorId(paletaId ?? '');
    if (!forma || !paleta) return null;
    const cores = coresDaPaleta(paleta).slice(0, 2);
    return { kind: forma.kind, nome: `${forma.nome} · ${paleta.nome}`, sobrescrever: { paleta: [paleta.accent, ...cores] } };
  }
  if (id.startsWith('croma:')) {
    const [, formaId, matiz] = id.split(':')
    const forma = FORMAS_DE_RASTRO.find((f) => f.id === formaId)
    const m = MATIZES.find((x) => x.id === matiz)
    if (!forma || !m) return null
    // Duas cores: o matiz e uma versão mais funda dele — é o que dá volume ao rastro.
    return { kind: forma.kind, nome: `${forma.nome} · ${m.nome}`, sobrescrever: { paleta: [`hsl(${m.h} 85% 62%)`, `hsl(${m.h} 72% 46%)`] } }
  }
  if (id.startsWith('emojis:')) {
    const lista = sanearListaDeEmojis(id.slice('emojis:'.length).split(','));
    if (!lista.length) return null;
    return { kind: 'rastroEmoji', nome: `Emojis ${lista.slice(0, 3).join('')}`, sobrescrever: { emojis: lista } };
  }
  return null;
}

export function rastroValido(id: string): boolean {
  return id === 'off' || estiloDeRastro(id) !== null;
}

export function readRastro(): string {
  try {
    const v = localStorage.getItem(CHAVE) ?? 'off';
    return rastroValido(v) ? v : 'off';
  } catch { return 'off'; }
}

export function setRastro(id: string): string {
  const valido = rastroValido(id) ? id : 'off';
  try { localStorage.setItem(CHAVE, valido); } catch { /* sem storage */ }
  return valido;
}

/** Monta o id de um rastro personalizado por forma + paleta. */
export function idDeRastroGerado(forma: string, paletaId: string): string { return `gen:${forma}:${paletaId}`; }
/** Monta o id de um rastro na cor de um croma comprado. */
export function idDeRastroDeCroma(forma: string, matiz: string): string { return `croma:${forma}:${matiz}`; }
/** Monta o id de um rastro de emojis escolhidos. */
export function idDeRastroDeEmojis(lista: string[]): string { return `emojis:${sanearListaDeEmojis(lista).join(',')}`; }

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
    // O acelerador vem ANTES da leitura do estilo: pointermove dispara dezenas de vezes por
    // segundo e `readRastro()` toca o localStorage — barato um a um, caro em rajada contínua.
    const agora = performance.now();
    if (agora - ultimoT < INTERVALO_MS) return;
    const id = readRastro();
    if (id === 'off' || animacoesDesligadas()) return;
    const dx = e.clientX - ultimoX;
    const dy = e.clientY - ultimoY;
    if (dx * dx + dy * dy < DISTANCIA_MIN * DISTANCIA_MIN) return;
    ultimoT = agora;
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    const estilo = estiloDeRastro(id);
    if (estilo) emitBurst(e.clientX, e.clientY, estilo.kind, estilo.sobrescrever);
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => {
    const id = readRastro();
    if (id === 'off' || animacoesDesligadas()) return;
    const estilo = estiloDeRastro(id);
    // Clique = três emissões rápidas: a mini-explosão que dá peso ao toque.
    if (estilo) for (let i = 0; i < 3; i++) setTimeout(() => emitBurst(e.clientX, e.clientY, estilo.kind, estilo.sobrescrever), i * 40);
  }, { passive: true });
}
