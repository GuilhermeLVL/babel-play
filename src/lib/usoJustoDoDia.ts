/**
 * O USO JUSTO DO DIA NO CLIENTE — o AVISO, uma vez por dia (C4 da change `planos-v2`, ADR 0011).
 *
 * Quando o servidor responde 429 `uso_justo_do_dia`, os adaptadores de nuvem pausam (é um 429 como
 * outro qualquer para o `PausaDaNuvem`: pausa pelo `Retry-After`, com o teto de 15 min que reavalia)
 * e avisam aqui. Quem desenha a tela (a captura) escuta e mostra o recado FUNCIONAL — "a nuvem
 * descansa até amanhã; a legenda segue no aparelho". Não é oferta e não passa pelo motor de ofertas:
 * quem chega ao uso justo já é assinante, e não há o que vender.
 *
 * UMA VEZ POR DIA do aparelho (a data local do navegador, e por aba — `sessionStorage`): a pausa
 * reavalia a cada 15 min, e cada reavaliação recebe a mesma recusa; repetir o recado a cada volta
 * seria barulho. O dia do servidor é o fuso gravado da conta; o do aviso é o do aparelho — os dois
 * coincidem para quase todo mundo, e errar aqui só muda quando o recado reaparece.
 *
 * FOLHA de propósito, como `lib/nuvemDeAlivio/estado.ts`: os adaptadores a importam, e nada daqui
 * pode puxar a tela, a rede ou o i18n de volta.
 */
import { ehRecusaDoUsoJusto } from '../core/usoJusto';

/** O evento da janela: a captura escuta e mostra o aviso. */
export const EVENTO_USO_JUSTO_DO_DIA = 'babel:uso-justo-do-dia';

const CHAVE_DA_SESSAO = 'babel.usoJusto.avisadoEm';

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();
let avisadoEm: string | null = null;

/** A data local do aparelho, `AAAA-MM-DD`. */
function hoje(agora: number): string {
  const d = new Date(agora);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lerAvisado(): string | null {
  avisadoEm ??= (() => {
    try {
      return sessionStorage.getItem(CHAVE_DA_SESSAO);
    } catch {
      return null;
    }
  })();
  return avisadoEm;
}

/** O recado do 429 já foi dado HOJE (neste aparelho e nesta aba)? Quem avisa por outro caminho não o repete. */
export function jaAvisouUsoJustoHoje(agora: number = Date.now()): boolean {
  return lerAvisado() === hoje(agora);
}

/** Registra quem quer saber (a captura aberta). Devolve a função que solta. */
export function aoUsoJustoDoDia(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Avisa — se ainda não avisou HOJE. Devolve `true` quando avisou. Nunca lança. */
export function avisarUsoJustoDoDia(agora: number = Date.now()): boolean {
  const dia = hoje(agora);
  if (lerAvisado() === dia) return false;
  avisadoEm = dia;
  try {
    sessionStorage.setItem(CHAVE_DA_SESSAO, dia);
  } catch {
    /* sem storage: o aviso vale só enquanto a página estiver aberta */
  }
  for (const o of [...ouvintes]) {
    try {
      o();
    } catch {
      /* um ouvinte quebrado não impede os outros nem a legenda */
    }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_USO_JUSTO_DO_DIA));
  return true;
}

/**
 * Para os adaptadores: a resposta é a recusa do uso justo? Então avisa (uma vez por dia) e devolve
 * `true`. A PAUSA não é daqui: o `PausaDaNuvem` do adaptador já pausa todo 429 pelo `Retry-After`.
 */
export function registrarRecusaDoUsoJusto(status: number, corpo: unknown): boolean {
  if (!ehRecusaDoUsoJusto(status, corpo)) return false;
  avisarUsoJustoDoDia();
  return true;
}

/** Só para os testes: esquece o aviso do dia e os ouvintes. */
export function _esquecerUsoJusto(): void {
  avisadoEm = null;
  ouvintes.clear();
  try {
    sessionStorage.removeItem(CHAVE_DA_SESSAO);
  } catch {
    /* sem storage */
  }
}
