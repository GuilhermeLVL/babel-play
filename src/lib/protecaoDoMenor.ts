/**
 * PERFIL PROTEGIDO NO CLIENTE (Fase 4 do lançamento — ECA Digital e LGPD art. 14) — o ESTADO.
 *
 * O servidor decide (`server/lib/idade.ts`, `GET /api/me/idade`); aqui fica o último valor que ele
 * disse, para as telas pintarem sem esperar a rede e para o funil (`data/funil.ts`) desviar para o
 * modo local a conta que ainda depende do responsável.
 *
 * Este arquivo é uma FOLHA de propósito (não importa `data/*`): o funil o importa, e ele importar o
 * funil de volta seria um ciclo, que o `madge` barra no CI. Quem busca no servidor é
 * `data/rotas/idade.ts`.
 *
 * AS PERGUNTAS QUE AS TELAS FAZEM:
 *  - `perfilProtegido()`: sem ranking público, sem pressão de ofensiva, sem compra. Verdadeiro para
 *    menor de 18 E para quem ainda não declarou a idade — inclusive quem usa SEM CONTA no modo
 *    público: a configuração mais protetiva é a padrão. No self-host, falso (o dono da máquina).
 *  - `estadoDaProtecao()?.restrita`: menor de 16 sem vínculo aceito → a nuvem fica desligada e o
 *    app roda local; `nascimentoInformado === false` → o App pergunta a data.
 */
import { estadoDeIdentidade } from './identidade';
import { authRequired } from './supabase';

export type FaixaEtaria = 'menor-12' | '12-15' | '16-17' | 'adulto';

export interface EstadoDeProtecao {
  nascimentoInformado: boolean;
  confianca?: string;
  faixa: FaixaEtaria | null;
  protegido: boolean;
  exigeResponsavel: boolean;
  exigeConsentimentoEspecifico: boolean;
  vinculo: {
    estado: 'nenhum' | 'convidado' | 'aceito';
    emailMascarado?: string;
    expiraEm?: number;
    responsavel?: string | null;
  };
  restrita: boolean;
}

const EVENTO = 'babel_protecao_changed';

let estado: EstadoDeProtecao | null = null;
let armada = false;
let resolver: (() => void) | null = null;
let pronta: Promise<void> | null = null;

/** O último estado que o servidor devolveu, ou `null` (ainda não perguntado / sem conta). */
export function estadoDaProtecao(): EstadoDeProtecao | null {
  return estado;
}

export function definirProtecao(novo: EstadoDeProtecao | null): void {
  estado = novo;
  if (resolver) {
    resolver();
    resolver = null;
  }
  pronta = Promise.resolve();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

/** O App chama ao entrar com conta: a partir daqui o funil espera a primeira resposta. */
export function armarProtecao(): void {
  armada = true;
  estado = null;
  pronta = new Promise((r) => {
    resolver = r;
  });
}

/**
 * Espera o estado quando ele foi "armado" e ainda não chegou — com teto: rede lenta não pode
 * pendurar a primeira tela para sempre (depois do teto o servidor, que também decide, responde 403).
 */
export async function aguardarProtecao(tetoMs = 4000): Promise<EstadoDeProtecao | null> {
  if (!armada || estado || !pronta) return estado;
  await Promise.race([pronta, new Promise((r) => setTimeout(r, tetoMs))]);
  return estado;
}

export function aoMudarProtecao(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb);
  return () => window.removeEventListener(EVENTO, cb);
}

/** Sem ranking público, sem pressão de ofensiva, sem compra. */
export function perfilProtegido(): boolean {
  if (!authRequired) return false;
  if (estadoDeIdentidade() !== 'conta') return true; // sem conta = idade desconhecida
  return estado ? estado.protegido : true;
}

/**
 * Com a conta restrita, estas rotas continuam indo ao servidor: a própria conta (idade, convite,
 * exportar, excluir), o responsável, a cobrança (o status; comprar o servidor recusa) e o diário
 * de erros. O resto — sessões, palavras, jogos, IA — roda no modo local.
 */
const LIBERADAS_NA_RESTRICAO = [
  /^\/api\/me(\/|$|\?)/,
  /^\/api\/responsavel(\/|$|\?)/,
  /^\/api\/billing\//,
  /^\/api\/erros-do-cliente/,
];

export function rotaLiberadaNaRestricao(caminho: string): boolean {
  const so = caminho.replace(/^https?:\/\/[^/]+/, '');
  return LIBERADAS_NA_RESTRICAO.some((r) => r.test(so));
}
