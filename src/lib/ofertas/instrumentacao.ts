/**
 * INSTRUMENTAÇÃO DE CONVERSÃO DAS OFERTAS — o funil, medido sem saber quem é a pessoa.
 *
 *   oferta_exibida → oferta_clicada → checkout_iniciado → assinatura_concluida
 *                  ↘ oferta_dispensada / oferta_nao_mostrar
 *
 * Cada evento leva só `{ evento, gatilho, componente, plano_atual, plano_sugerido, variante }` e vai
 * para `POST /api/metricas/ofertas`, que o transforma em contador Prometheus e não grava nada
 * (`server/routes/metricasOfertas.ts`). Sem id de usuário, sem id de instalação, sem texto.
 *
 * ATRIBUIÇÃO. O checkout acontece longe da oferta (outra tela, às vezes outra aba de pagamento). O
 * clique numa oferta guarda os rótulos dela no aparelho (`babel.ofertas.atribuicao`, validade de
 * 24 h); o `checkout_iniciado` usa esses rótulos (ou `nenhum`, o checkout orgânico) e deixa um
 * marcador; a `assinatura_concluida` só conta com o marcador — recarregar a tela de confirmação
 * não conta duas vezes.
 *
 * QUANDO NÃO VAI NADA: "Métricas de uso anônimas" desligada em Ajustes (a mesma promessa da
 * telemetria de captura) e conta de menor restrita. Sem conta vai, porque a rota é anônima e passa
 * direto pelo servidor em memória (`PASSAM_DIRETO`). Toda falha é silenciosa.
 */
import type { PlanoDaFlag } from '../../core/flags';
import {
  type ComponenteDeOferta,
  type EventoDeOferta,
  type PlanoSugerido,
  type RegistroDeOferta,
  SEM_OFERTA,
} from '../../core/ofertas';
import { apiFetch } from '../../data/funil';
import { edicaoEstatica } from '../edicaoEstatica';
import { lerPreferencias } from '../preferencias';
import { estadoDaProtecao } from '../protecaoDoMenor';
import { planoDaOferta } from './plano';

export const ROTA_DAS_METRICAS_DE_OFERTA = '/api/metricas/ofertas';
/** Espera para juntar eventos próximos (exibida + clicada) num POST só. */
export const ESPERA_DO_LOTE_MS = 2_000;
/** O servidor aceita até isto por lote. */
export const MAX_EVENTOS_POR_LOTE = 20;

const CHAVE_ATRIBUICAO = 'babel.ofertas.atribuicao';
const CHAVE_CHECKOUT = 'babel.ofertas.checkout_pendente';
const VALIDADE_DA_ATRIBUICAO_MS = 24 * 60 * 60_000;

/** Os rótulos de uma oferta — tudo menos o evento. */
export type RotulosDaOferta = Omit<RegistroDeOferta, 'evento'>;

let fila: RegistroDeOferta[] = [];
let relogio: ReturnType<typeof setTimeout> | null = null;
let ouvindoSaida = false;

function podeEnviar(): boolean {
  // Edição estática: não há servidor para receber — e o beacon iria direto ao Pages.
  if (edicaoEstatica()) return false;
  try {
    if (lerPreferencias().consentimentos.metricas === false) return false;
    return estadoDaProtecao()?.restrita !== true;
  } catch {
    return false;
  }
}

/** Manda o lote. `saindo`: a aba está indo embora — só o beacon chega. */
export function enviarLoteDeOfertas(saindo = false): void {
  if (relogio) clearTimeout(relogio);
  relogio = null;
  const lote = fila.slice(0, MAX_EVENTOS_POR_LOTE);
  fila = fila.slice(MAX_EVENTOS_POR_LOTE);
  if (!lote.length || !podeEnviar()) return;
  const corpo = JSON.stringify({ v: 1, eventos: lote });
  try {
    if (saindo && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ROTA_DAS_METRICAS_DE_OFERTA, new Blob([corpo], { type: 'application/json' }));
    } else {
      void apiFetch(ROTA_DAS_METRICAS_DE_OFERTA, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: corpo,
      }).catch(() => {
        /* métrica que falha morre aqui */
      });
    }
  } catch {
    /* idem */
  }
  if (fila.length) agendar();
}

function agendar(): void {
  if (relogio) return;
  relogio = setTimeout(() => enviarLoteDeOfertas(false), ESPERA_DO_LOTE_MS);
  if (!ouvindoSaida && typeof window !== 'undefined') {
    ouvindoSaida = true;
    window.addEventListener('pagehide', () => enviarLoteDeOfertas(true));
  }
}

export function registrarEventoDeOferta(evento: EventoDeOferta, rotulos: RotulosDaOferta): void {
  fila.push({ evento, ...rotulos });
  agendar();
}

// ───────────────────────────── atribuição ─────────────────────────────

export function rotulosDaOferta(p: {
  gatilho: string;
  componente: ComponenteDeOferta;
  planoAtual: PlanoDaFlag;
  planoSugerido: PlanoSugerido;
  variante: string;
}): RotulosDaOferta {
  return {
    gatilho: p.gatilho,
    componente: p.componente,
    plano_atual: p.planoAtual,
    plano_sugerido: p.planoSugerido,
    variante: p.variante,
  };
}

/** O clique numa oferta: o checkout que vier depois é atribuído a ela. */
export function lembrarAtribuicao(r: RotulosDaOferta, agora = Date.now()): void {
  try {
    localStorage.setItem(CHAVE_ATRIBUICAO, JSON.stringify({ ...r, em: agora }));
  } catch {
    /* sem storage: o checkout conta como orgânico */
  }
}

function lerJson<T>(chave: string): T | null {
  try {
    const b = localStorage.getItem(chave);
    return b ? (JSON.parse(b) as T) : null;
  } catch {
    return null;
  }
}

function apagar(chave: string): void {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* idem */
  }
}

/** Os rótulos do checkout: os da última oferta clicada (até 24 h) ou `nenhum` (orgânico). */
export function atribuicaoDoCheckout(planoEscolhido: PlanoSugerido, agora = Date.now()): RotulosDaOferta {
  const a = lerJson<RotulosDaOferta & { em?: number }>(CHAVE_ATRIBUICAO);
  if (a && typeof a.em === 'number' && agora - a.em < VALIDADE_DA_ATRIBUICAO_MS && typeof a.gatilho === 'string') {
    const { em: _em, ...rotulos } = a;
    return rotulos;
  }
  return {
    gatilho: SEM_OFERTA,
    componente: SEM_OFERTA,
    plano_atual: planoDaOferta(),
    plano_sugerido: planoEscolhido,
    variante: SEM_OFERTA,
  };
}

/** O checkout abriu a página de pagamento. */
export function registrarCheckoutIniciado(planoEscolhido: 'premium', agora = Date.now()): void {
  const r = atribuicaoDoCheckout(planoEscolhido, agora);
  registrarEventoDeOferta('checkout_iniciado', r);
  try {
    localStorage.setItem(CHAVE_CHECKOUT, JSON.stringify(r));
  } catch {
    /* sem storage: a assinatura não é atribuída, e isso é preferível a contar em dobro */
  }
}

/** O servidor confirmou a assinatura. Conta UMA vez por checkout iniciado neste aparelho. */
export function registrarAssinaturaConcluida(): void {
  const r = lerJson<RotulosDaOferta>(CHAVE_CHECKOUT);
  if (!r || typeof r.gatilho !== 'string') return;
  apagar(CHAVE_CHECKOUT);
  apagar(CHAVE_ATRIBUICAO);
  registrarEventoDeOferta('assinatura_concluida', r);
  enviarLoteDeOfertas(false);
}

/** Só para testes. */
export function _esquecerInstrumentacao(): void {
  fila = [];
  if (relogio) clearTimeout(relogio);
  relogio = null;
  apagar(CHAVE_ATRIBUICAO);
  apagar(CHAVE_CHECKOUT);
}
