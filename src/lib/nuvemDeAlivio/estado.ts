/**
 * A NUVEM DE ALÍVIO NO CLIENTE — o ESTADO da oferta (A10 do plano "Grátis sem travar").
 *
 * FOLHA de propósito: os adaptadores de nuvem (`gateway/adapters/groqWhisper.ts`,
 * `serverLlmMt.ts`) a importam para pôr o cabeçalho `x-nuvem-alivio: 1` no pedido, e nada daqui
 * pode puxar o funil, a rede ou a tela de volta. Quem pergunta ao servidor é `./consulta.ts`.
 *
 * O ACEITE VALE PARA A ABA (sessionStorage), não para sempre: a oferta é para quando o aparelho
 * está sofrendo agora, e numa sessão nova a pessoa decide de novo — com um toque, e só se o aparelho
 * precisar. Retirar o consentimento de nuvem em Ajustes → Privacidade desliga tudo na hora (o gateway
 * confere o consentimento a cada chamada), com ou sem aceite aqui.
 *
 * Nada daqui é autoridade: mentir no cabeçalho não dá nada a ninguém, porque o servidor confere a
 * franquia da conta, a flag, o perfil protegido e o pool a cada pedido (`server/lib/nuvemDeAlivio.ts`).
 */
import { CABECALHO_DO_ALIVIO, ehRecusaDoAlivio } from '../../core/nuvemDeAlivio';

const CHAVE_DA_SESSAO = 'babel.alivio.aceito';

let aceito: boolean | null = null;
let dispensado = false;
let recusa: string | null = null;

function lerAceite(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_DA_SESSAO) === '1';
  } catch {
    return false;
  }
}

/** A pessoa tocou "Usar a nuvem grátis" nesta aba? */
export function alivioAceito(): boolean {
  aceito ??= lerAceite();
  return aceito;
}

/** Tocou "Usar a nuvem grátis": os próximos pedidos de transcrição e tradução pedem o alívio. */
export function aceitarAlivio(): void {
  aceito = true;
  dispensado = false;
  recusa = null;
  try {
    sessionStorage.setItem(CHAVE_DA_SESSAO, '1');
  } catch {
    /* sem storage: o aceite vale só enquanto a página estiver aberta */
  }
}

/** Tocou "Agora não": a oferta não volta nesta aba. */
export function dispensarAlivio(): void {
  dispensado = true;
}

export function alivioDispensado(): boolean {
  return dispensado;
}

/** O cabeçalho que pede o alívio — vazio sem o aceite. */
export function cabecalhoDoAlivio(): Record<string, string> {
  return alivioAceito() ? { [CABECALHO_DO_ALIVIO]: '1' } : {};
}

/**
 * O servidor recusou um pedido QUE PEDIA o alívio? Registra o motivo (a tela para de oferecer e o
 * selo pode dizer por quê) e devolve `true` — o adaptador, então, pausa a nuvem pelo teto em vez de
 * perguntar de novo a cada fala. A franquia do mês esgotada é o 402 `quota_exceeded` com
 * `escopo: 'alivio'`; o resto (desligado, responsável, pool) tem código próprio.
 */
export function registrarRecusaDoAlivio(status: number, corpo: unknown): boolean {
  if (!alivioAceito() || !corpo || typeof corpo !== 'object') return false;
  const c = corpo as { code?: unknown; detalhes?: { escopo?: unknown } };
  const doAlivio = ehRecusaDoAlivio(c.code) || (status === 402 && c.detalhes?.escopo === 'alivio');
  if (!doAlivio) return false;
  recusa = typeof c.code === 'string' ? c.code : 'recusado';
  return true;
}

/** O último motivo com que o servidor recusou o alívio nesta aba (`null` = nenhum). */
export function recusaDoAlivio(): string | null {
  return recusa;
}

/** Só para os testes: esquece o estado (e o aceite da aba, salvo `manterSessao`). */
export function _reiniciarAlivio(o: { manterSessao?: boolean } = {}): void {
  aceito = null;
  dispensado = false;
  recusa = null;
  if (!o.manterSessao) {
    try {
      sessionStorage.removeItem(CHAVE_DA_SESSAO);
    } catch {
      /* sem storage */
    }
  }
}
