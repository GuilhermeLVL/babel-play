import { emitBurst, type BurstKind } from './effects';
import { play } from './soundFx';

/**
 * "JUICE" — a camada de retorno sensorial dos jogos.
 *
 * O QUE ESTE ARQUIVO É. Um vocabulário único de comemoração: cada acontecimento de jogo (acertou,
 * emendou uma sequência, fechou uma rodada perfeita, errou) tem UM nome e UMA composição de
 * efeitos — partícula + som + número que sobe. Sem isto, cada jogo inventaria a própria festa e
 * o app pareceria seis apps.
 *
 * O QUE ELE NÃO É. Uma desculpa para exagero. Três regras, e elas são o que separa "gostoso" de
 * "fubanga":
 *
 *   1. ESCALA POR RARIDADE. O efeito comum (um acerto) é discreto porque acontece o tempo todo;
 *      o exagero fica reservado ao que é raro (rodada perfeita, subir de nível). Se tudo brilha,
 *      nada brilha — e a tela vira um caça-níquel.
 *   2. NUNCA ATRAPALHA. Os efeitos são `pointer-events: none`, nascem FORA do texto que se lê e
 *      duram menos de um segundo. Nenhum deles atrasa a próxima jogada.
 *   3. RESPEITA O FREIO. Movimento reduzido, Modo Desempenho e o interruptor de animações já
 *      zeram tudo globalmente (ver `index.css` e `ParticleCanvas`). Aqui só checamos o tremor,
 *      que mexe em `transform` e escaparia daqueles filtros.
 */

/** Acontecimentos que merecem retorno. O nome descreve o FATO, não o efeito. */
export type Comemoracao =
  | 'acerto'        // acertou um item, o mais frequente, e por isso o mais contido
  | 'sequencia'     // emendou acertos (combo), faísca quente
  | 'rodadaBoa'     // terminou bem, confete no ponto
  | 'rodadaPerfeita'// terminou sem erro, chuva de confete na tela toda
  | 'subiuNivel'
  | 'erro';

const RAJADA: Record<Comemoracao, BurstKind> = {
  acerto: 'xp',
  sequencia: 'combo',
  rodadaBoa: 'confete',
  rodadaPerfeita: 'perfeito',
  subiuNivel: 'levelUp',
  erro: 'erro',
};

/** Exportado por ser o VOCABULÁRIO declarado (fato → som), não um detalhe de implementação:
 *  é a tabela que garante que os nove jogos comemorem a mesma coisa do mesmo jeito. */
export const SOM: Record<Comemoracao, Parameters<typeof play>[0]> = {
  acerto: 'success',
  sequencia: 'combo',
  rodadaBoa: 'success',
  rodadaPerfeita: 'levelUp',
  subiuNivel: 'levelUp',
  erro: 'error',
};

/** O usuário desligou movimento? (o tremor mexe em transform e escapa dos filtros globais) */
function movimentoReduzido(): boolean {
  if (typeof window === 'undefined') return true;
  const body = document.body;
  if (body.classList.contains('performance-mode') || body.classList.contains('animations-off')) return true;
  if (body.classList.contains('animations-on')) return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Centro de um elemento em coordenadas de viewport (onde a rajada deve nascer). */
function centro(el: Element | null): { x: number; y: number } {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * O gesto completo de uma comemoração: partícula + som + (opcional) o número que sobe.
 * É a única função que os jogos precisam chamar.
 */
export function comemorar(
  tipo: Comemoracao,
  alvo?: Element | null,
  opts: { texto?: string; tremer?: boolean } = {},
): void {
  const { x, y } = centro(alvo ?? null);
  emitBurst(x, y, RAJADA[tipo]);
  play(SOM[tipo]);
  if (opts.texto) pontosFlutuantes(opts.texto, x, y, tipo === 'erro' ? 'ruim' : 'bom');
  if (opts.tremer) tremor(alvo ?? null, tipo === 'rodadaPerfeita' ? 6 : 3);
}

/* ─────────────────────────── PONTOS FLUTUANTES ───────────────────────────
   O "+10" que sobe e some. É o retorno mais barato e mais eficaz que existe: transforma um
   número abstrato num objeto que SAIU do lugar onde a pessoa acabou de agir.

   Feito com um barramento (como as rajadas) para que a camada visual seja única e viva no topo
   da árvore, assim ele nunca é cortado pelo `overflow` do container do jogo, que foi exatamente
   o problema que o canvas de partículas teve. */

export interface PontoFlutuante {
  id: number;
  texto: string;
  x: number;
  y: number;
  tom: 'bom' | 'ruim' | 'neutro';
}

type Ouvinte = (p: PontoFlutuante) => void;
const ouvintes = new Set<Ouvinte>();
let proximoId = 1;

export function onPontoFlutuante(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function pontosFlutuantes(texto: string, x: number, y: number, tom: PontoFlutuante['tom'] = 'bom'): void {
  const p: PontoFlutuante = { id: proximoId++, texto, x, y, tom };
  for (const fn of ouvintes) fn(p);
}

/** Versão que nasce de um elemento (o caso comum). */
export function pontosDoElemento(texto: string, el: Element | null, tom: PontoFlutuante['tom'] = 'bom'): void {
  const { x, y } = centro(el);
  pontosFlutuantes(texto, x, y, tom);
}

/* ─────────────────────────── TREMOR ───────────────────────────
   Um empurrãozinho de 3–6px. É o efeito mais fácil de exagerar: acima disso a tela parece
   quebrada e dá enjoo. Curto (200ms), sem repetição, e só no elemento do acontecimento,
   nunca na tela inteira. */

export function tremor(el: Element | null, intensidade = 3): void {
  if (!el || movimentoReduzido()) return;
  const alvo = el as HTMLElement;
  if (alvo.dataset.tremendo === '1') return; // já está tremendo: não empilha
  alvo.dataset.tremendo = '1';
  const original = alvo.style.transform;
  const inicio = performance.now();
  const DURACAO = 200;
  const passo = (agora: number) => {
    const t = (agora - inicio) / DURACAO;
    if (t >= 1) {
      alvo.style.transform = original;
      delete alvo.dataset.tremendo;
      return;
    }
    // Amplitude decrescente: começa forte e assenta, como um objeto real.
    const amp = intensidade * (1 - t);
    const dx = Math.sin(t * Math.PI * 8) * amp;
    alvo.style.transform = `${original} translateX(${dx}px)`;
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/**
 * MULTIPLICADOR por sequência de acertos — MUDOU DE CASA, e continua sendo importado daqui.
 *
 * A regra é de PONTUAÇÃO, não de efeito visual, e agora a pontuação da rodada inteira vive no
 * core (`core/minigames/grade.ts`), que é puro e testável em node. Este arquivo importa `effects`
 * e `soundFx` — DOM e Web Audio —, então o core não pode importar dele: seria a dependência ao
 * contrário, e o `pontuarRodada` deixaria de rodar nos testes.
 *
 * O re-export mantém quem já importava daqui funcionando sem edição (é o caso de `tests/juice`).
 */
/* ─────────────────────────── EFEITOS DE TELA (momentos raros) ───────────────────────────
   Tremor/zoom/glitch/flash agem no PALCO INTEIRO (#root) e por isso sao reservados a marcos,
   fever e recorde — o comum continua local. Todos respeitam `movimentoReduzido()`. A vibracao
   so existe em tela de toque (pointer: coarse) e nunca passa de meio segundo. */

function elementoDePalco(): HTMLElement | null {
  return document.getElementById('root');
}

function classeTransitoria(nome: string, duracaoMs: number): void {
  if (movimentoReduzido()) return;
  const alvo = elementoDePalco();
  if (!alvo || alvo.classList.contains(nome)) return;
  alvo.classList.add(nome);
  setTimeout(() => alvo.classList.remove(nome), duracaoMs);
}

/** Tremor da TELA inteira (o `tremor` acima e por elemento). */
export function tremorDeTela(intensidade = 4): void {
  tremor(elementoDePalco(), intensidade);
}

/** Zoom sutil (1 → 1.02 → 1) do palco. */
export function pulsoDeZoom(): void {
  classeTransitoria('babel-zoom-pulso', 320);
}

/** Interferencia: fatias deslocadas + desvio de matiz por ~400 ms. */
export function glitchDeTela(): void {
  classeTransitoria('babel-glitch', 420);
}

/** Clarão de 140 ms — o "flash de câmera" do recorde. */
export function flashDeTela(): void {
  classeTransitoria('babel-flash', 160);
}

/** Vibra so em aparelho de toque, e so se as animacoes estao ligadas. */
export function vibrar(padrao: number[]): void {
  if (movimentoReduzido()) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (!window.matchMedia?.('(pointer: coarse)').matches) return;
  try { navigator.vibrate(padrao); } catch { /* bloqueado */ }
}

/** Rajadas em N pontos ALEATORIOS da viewport — a festa deixa de ser sempre no centro. */
export function explodirAleatorio(vezes: number, kind: BurstKind): void {
  if (typeof window === 'undefined') return;
  for (let i = 0; i < vezes; i++) {
    const x = window.innerWidth * (0.12 + Math.random() * 0.76);
    const y = window.innerHeight * (0.15 + Math.random() * 0.6);
    setTimeout(() => emitBurst(x, y, kind), i * 130);
  }
}

/**
 * Encena um `EfeitoComposto` de `lib/eventosDeJogo`: rajadas espalhadas + som + tela + vibracao.
 * Tambem registra o evento como "visto" (colecionavel da antessala).
 */
export function executarEfeito(ev: import('./eventosDeJogo').EfeitoComposto): void {
  for (const r of ev.rajadas) explodirAleatorio(r.vezes ?? 1, r.kind);
  if (ev.som) play(ev.som);
  if (ev.tela === 'tremor') tremorDeTela(5);
  else if (ev.tela === 'zoom') pulsoDeZoom();
  else if (ev.tela === 'glitch') glitchDeTela();
  else if (ev.tela === 'flash') flashDeTela();
  if (ev.vibracao) vibrar(ev.vibracao);
  // import tardio para nao criar ciclo estatico juice ↔ eventosDeJogo
  void import('./eventosDeJogo').then((m) => m.marcarEventoVisto(ev.id));
}

export { multiplicador } from '../core/minigames/grade';
