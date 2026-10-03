/**
 * O AVISO DE "A NUVEM DE HOJE ESTÁ PERTO DO FIM" — o uso justo do DIA (`uso.hoje`, `GET /api/me/uso`).
 *
 * O teto do dia (2 h de nuvem no Premium, `PLAN_MATRIX.premium.quotas`) era recusado pelo servidor
 * (429 `uso_justo_do_dia`) sem nenhum recado antes: quem estava a 1 minuto do teto descobria no meio
 * da legenda. Este módulo decide, em função pura mais uma checagem barata, se vale um recado
 * DISCRETO na tela de captura PARADA (nunca durante captura ou rodada: regra de `docs/ofertas.md`).
 *
 * Não é oferta e não passa pelo motor: é informação funcional, sem venda. Três guardas:
 *   · UMA vez por dia do aparelho (a data local, como `lib/usoJustoDoDia`);
 *   · não repete o que o 429 já avisou hoje (`jaAvisouUsoJustoHoje`);
 *   · a pergunta à rede é espaçada (10 min), para a tela de captura não virar tráfego.
 */
import { carregarUso, fracao, type UsoDoMes } from './uso';
import { jaAvisouUsoJustoHoje } from './usoJustoDoDia';

export const LIMIAR_DO_DIA = 0.8;
export const ESPACO_ENTRE_CHECAGENS_MS = 10 * 60_000;

const CHAVE_DO_AVISO = 'babel.usoDoDia.avisadoEm';
const CHAVE_DA_CHECAGEM = 'babel.usoDoDia.checadoEm';

let emVoo: Promise<AvisoDoDia | null> | null = null;

export interface AvisoDoDia {
  /** Qual contador do dia pesa mais: a nuvem de áudio ou os tokens de IA. */
  contador: 'nuvem' | 'ia';
  esgotado: boolean;
  /** Só para a nuvem: o que já foi usado e o teto, em segundos. */
  usadoSegundos: number;
  tetoSegundos: number;
}

/** Puro: o contador do dia mais cheio decide; sem `hoje` (Grátis, self-host) ou sem teto, nada. */
export function avisoDoDia(uso: UsoDoMes | null): AvisoDoDia | null {
  const dia = uso?.hoje;
  if (!dia) return null;
  const nuvem = fracao(dia.segundosDeAudio);
  const ia = fracao(dia.tokensDeLlm);
  const [contador, f] = (nuvem ?? -1) >= (ia ?? -1) ? (['nuvem', nuvem] as const) : (['ia', ia] as const);
  if (f === null || f < LIMIAR_DO_DIA) return null;
  return {
    contador,
    esgotado: f >= 1,
    usadoSegundos: dia.segundosDeAudio.usado,
    tetoSegundos: dia.segundosDeAudio.teto ?? 0,
  };
}

/** A data local do aparelho, `AAAA-MM-DD`. */
function diaLocal(agora: number): string {
  const d = new Date(agora);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem storage: o aviso vale só enquanto a página estiver aberta */
  }
}

/** Já avisou hoje? */
export function jaAvisouOUsoDoDia(agora = Date.now()): boolean {
  return ler(CHAVE_DO_AVISO) === diaLocal(agora);
}

/** Marca o aviso de hoje como dado: quem o mostrou chama ao desenhá-lo. */
export function marcarAvisoDoDia(agora = Date.now()): void {
  gravar(CHAVE_DO_AVISO, diaLocal(agora));
}

/**
 * Pergunta ao servidor e devolve o aviso, ou `null` (nada a dizer, já avisado hoje, checado há pouco,
 * sem rede). Nunca lança: a tela de captura não depende disto.
 */
export function verificarUsoDoDia(agora = Date.now()): Promise<AvisoDoDia | null> {
  /* Duas montagens seguidas (o StrictMode do desenvolvimento, uma troca rápida de tela) dividem a MESMA
     pergunta: a segunda não pode cair no espaço entre checagens e perder a resposta da primeira. */
  if (emVoo) return emVoo;
  if (jaAvisouOUsoDoDia(agora) || jaAvisouUsoJustoHoje(agora)) return Promise.resolve(null);
  const ultima = Number(ler(CHAVE_DA_CHECAGEM));
  if (Number.isFinite(ultima) && ultima > 0 && agora - ultima < ESPACO_ENTRE_CHECAGENS_MS) return Promise.resolve(null);
  gravar(CHAVE_DA_CHECAGEM, String(agora));
  emVoo = carregarUso()
    .then(avisoDoDia)
    .finally(() => {
      emVoo = null;
    });
  return emVoo;
}
