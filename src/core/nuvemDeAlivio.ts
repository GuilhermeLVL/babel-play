/**
 * A NUVEM DE ALÍVIO — a REGRA, pura e compartilhada (A10 do plano "Grátis sem travar").
 *
 * O Grátis tem 3 h/mês de nuvem PARA APARELHO FRACO (`FRANQUIA_DE_ALIVIO` em `planos.ts`, com a
 * conta de custo). Duas metades, e só uma é autoridade:
 *
 *  - O SERVIDOR decide se a conta PODE (`server/lib/nuvemDeAlivio.ts`): conta logada no plano
 *    Grátis, flag `nuvem_gratuita_alivio` ligada, perfil protegido só com o responsável, franquia do
 *    mês (segundos e dólar), pool do dia e a reserva de 80% dos pagantes. É o limite de verdade.
 *  - O CLIENTE decide se VALE OFERECER (`deveOferecerAlivio`): só quando o aparelho não aguenta o
 *    modelo local. No aparelho forte a pessoa roda local de graça, e oferecer a nuvem ali só
 *    custaria dinheiro. É um portão de UX: mentir aqui não dá nada a ninguém, porque o servidor
 *    confere tudo de novo.
 *
 * Núcleo isomórfico (`src/core`): sem DOM, sem Node, sem relógio — tudo entra por parâmetro.
 */
import { FRANQUIA_DE_ALIVIO } from './planos';

/** A flag que liga o alívio (migração 0040, nasce DESLIGADA). */
export const FLAG_NUVEM_GRATUITA_ALIVIO = 'nuvem_gratuita_alivio';

/**
 * O pedido que QUER o alívio. Sem ele, a conta grátis continua recebendo o 402 de sempre: a pessoa
 * que não aceitou a oferta nunca gasta a franquia por acaso (o gateway tenta a nuvem na fala do
 * microfone para todo mundo, e isso não pode virar consumo silencioso).
 */
export const CABECALHO_DO_ALIVIO = 'x-nuvem-alivio';

/**
 * Os códigos com que o servidor recusa o alívio. Nenhum deles é de VENDA: o cliente pausa a nuvem e
 * segue no aparelho, sem oferta de plano (o momento de oferta só nasce do 402 `quota_exceeded`, e aí
 * é o aviso FUNCIONAL de fim de cota — `src/core/ofertas.ts`).
 */
export const RECUSAS_DO_ALIVIO = {
  /** A flag está desligada (503). */
  desligado: 'alivio_desligado',
  /** Perfil protegido sem a autorização do responsável (403). */
  exigeResponsavel: 'alivio_exige_responsavel',
  /** O pool do dia acabou, ou a reserva dos pagantes foi atingida (503). */
  poolEsgotado: 'pool_de_alivio_esgotado',
} as const;

/** Qualquer recusa que diga "a nuvem grátis não está disponível agora" — inclusive o pool gratuito comum. */
export function ehRecusaDoAlivio(code: unknown): boolean {
  return (
    code === RECUSAS_DO_ALIVIO.desligado ||
    code === RECUSAS_DO_ALIVIO.exigeResponsavel ||
    code === RECUSAS_DO_ALIVIO.poolEsgotado ||
    code === 'pool_gratuito_esgotado'
  );
}

/**
 * A RESERVA DOS PAGANTES: o alívio nunca consome mais que esta fração do orçamento diário de nuvem,
 * e fecha quando o gasto de todo mundo chega ao resto (80%). Os 80% são de quem paga.
 */
export const FRACAO_DO_ALIVIO_NO_ORCAMENTO = 0.2;

/** Abaixo disto de franquia não vale oferecer: a nuvem acabaria antes de a pessoa sentir a diferença. */
export const RESTANTE_MINIMO_PARA_OFERECER_S = 60;

// ───────────────────────────── o aparelho ─────────────────────────────

/** Por que a oferta apareceu: o aparelho é fraco de saída, ou o regulador viu que ele não acompanha. */
export type MotivoDaOfertaDeAlivio = 'aparelho' | 'travamento';

/** O que o cliente sabe do aparelho NESTA captura. */
export interface SinaisDoAparelhoParaAlivio {
  /** Perfil leve (`lib/dispositivo/perfil.ts`: Quest, celular fraco, desktop de 2 núcleos ou 2 GB). */
  leve: boolean;
  /** O regulador chegou ao chão da escada local ou viu a tela travar (`reguladorDeDesempenho.ts`). */
  travamento: boolean;
  /**
   * Há GPU de verdade? `false` = sem adaptador WebGPU, ou a sonda viu só o adaptador de SOFTWARE;
   * `null` = ainda não se sabe (a sonda roda no ocioso).
   */
  gpuReal: boolean | null;
}

/**
 * Há GPU de verdade para a rota? Sem adaptador WebGPU, ou com a sonda dizendo que o adaptador é o de
 * SOFTWARE, não; com a sonda dizendo que é real, sim; sem sonda guardada, não se sabe (`null`).
 */
export function gpuRealDaRota(temAdaptador: boolean, adaptadorReal: boolean | undefined): boolean | null {
  if (!temAdaptador || adaptadorReal === false) return false;
  return adaptadorReal === true ? true : null;
}

/**
 * O aparelho PRECISA do alívio? Qualquer um dos três sinais basta. GPU desconhecida não conta: na
 * dúvida, não se oferece — a próxima captura já tem a sonda e o regulador vigia a atual.
 */
export function aparelhoPedeAlivio(s: SinaisDoAparelhoParaAlivio): boolean {
  return s.leve || s.travamento || s.gpuReal === false;
}

// ───────────────────────────── o perfil protegido ─────────────────────────────

/** O pedaço do estado de proteção (`server/lib/idade.ts`, `GET /api/me/idade`) que a regra usa. */
export interface ProtecaoParaAlivio {
  protegido: boolean;
  restrita: boolean;
  vinculo: { estado: 'nenhum' | 'convidado' | 'aceito' };
}

/**
 * O PERFIL PROTEGIDO (menor de 18, ou idade não declarada) SÓ COM A AUTORIZAÇÃO DO RESPONSÁVEL: o
 * vínculo aceito e a conta não restrita (abaixo de 12, o consentimento específico — LGPD art. 14
 * §1º). É a MESMA régua da nuvem que o app já usa para o "Rápido" do microfone
 * (`rapidoDoMicPermitido`). Quem não tem fluxo de responsável (16–17 anos, idade não declarada)
 * fica sem o alívio. Estado desconhecido é protegido sem autorização: a configuração mais protetiva
 * é a padrão (ECA Digital).
 */
export function alivioAutorizadoPelaIdade(p: ProtecaoParaAlivio | null | undefined): boolean {
  if (!p) return false;
  if (!p.protegido) return true;
  return p.vinculo.estado === 'aceito' && !p.restrita;
}

// ───────────────────────────── a franquia ─────────────────────────────

/**
 * QUANTO RESTA, em segundos de TRANSCRIÇÃO: o menor entre o que sobra de segundos e o que o dólar
 * que sobra paga de STT. A tradução na nuvem sai do mesmo teto em dólar, então ela também encurta o
 * tempo — e a pessoa vê o número verdadeiro, não o otimista. `custoPorSegundoUsd` é o custo FATURADO
 * de um segundo real de fala (preço por hora × fator faturado ÷ 3.600).
 */
export function segundosRestantesDoAlivio(o: {
  sttUsados: number;
  gastoUsd: number;
  custoPorSegundoUsd: number;
  franquia?: { sttSegundosMes: number; tetoUsdMes: number };
}): number {
  const f = o.franquia ?? FRANQUIA_DE_ALIVIO;
  const porSegundos = Math.max(0, f.sttSegundosMes - Math.max(0, o.sttUsados));
  const porDinheiro =
    o.custoPorSegundoUsd > 0
      ? Math.max(0, (f.tetoUsdMes - Math.max(0, o.gastoUsd)) / o.custoPorSegundoUsd)
      : porSegundos;
  return Math.floor(Math.min(porSegundos, porDinheiro));
}

/**
 * O POOL DO DIA do alívio, em US$ — o teto somando TODOS os grátis. Nunca passa de 20% do orçamento
 * diário de nuvem (a reserva de 80% dos pagantes). Sem teto diário configurado, a referência é o
 * mensal ÷ 30. `poolConfiguradoUsd` (`ALIVIO_POOL_USD_DIA`) só pode BAIXAR o pool: um erro de
 * digitação não abre a nuvem além da reserva.
 */
export function poolDoAlivioUsd(o: {
  tetoDiaUsd: number;
  tetoMesUsd: number;
  poolConfiguradoUsd: number | null;
}): number {
  const referencia = Number.isFinite(o.tetoDiaUsd)
    ? o.tetoDiaUsd
    : Number.isFinite(o.tetoMesUsd)
      ? o.tetoMesUsd / 30
      : Infinity;
  const teto = FRACAO_DO_ALIVIO_NO_ORCAMENTO * referencia;
  return o.poolConfiguradoUsd === null ? teto : Math.min(Math.max(0, o.poolConfiguradoUsd), teto);
}

/**
 * A RESERVA DE 80% DOS PAGANTES foi atingida? Com o gasto de TODO MUNDO no dia (ou no mês) a 80% do
 * teto, o alívio fecha: o que sobra do orçamento é de quem paga. Teto infinito (sem variável) não
 * fecha nada por aqui — o pool do dia continua valendo.
 */
export function reservaDosPagantesAtingida(o: {
  gastoDiaUsd: number;
  tetoDiaUsd: number;
  gastoMesUsd: number;
  tetoMesUsd: number;
}): boolean {
  const limiar = 1 - FRACAO_DO_ALIVIO_NO_ORCAMENTO;
  const noDia = Number.isFinite(o.tetoDiaUsd) && o.gastoDiaUsd >= o.tetoDiaUsd * limiar - 1e-9;
  const noMes = Number.isFinite(o.tetoMesUsd) && o.gastoMesUsd >= o.tetoMesUsd * limiar - 1e-9;
  return noDia || noMes;
}

// ───────────────────────────── a oferta no cliente ─────────────────────────────

/** O que o servidor disse do alívio desta conta (`GET /api/me/uso` → `alivio`). */
export interface AlivioDoServidor {
  disponivel: boolean;
  restanteSegundos: number;
}

export interface ContextoDaOfertaDeAlivio {
  /** `null` = o servidor não respondeu, a conta não é Grátis, ou a flag está desligada. */
  servidor: AlivioDoServidor | null;
  aparelho: SinaisDoAparelhoParaAlivio;
  /** A pessoa já aceitou nesta sessão. */
  aceito: boolean;
  /** Tocou "Agora não" nesta sessão. */
  dispensado: boolean;
  /** Perfil de IA "Privado" (`local-private`): nuvem nunca. */
  perfilPrivado: boolean;
  /** Edição estática (Pages): não há servidor. */
  edicaoEstatica: boolean;
}

/** A oferta "Usar a nuvem grátis (restam X)" aparece? Pura. */
export function deveOferecerAlivio(c: ContextoDaOfertaDeAlivio): boolean {
  if (c.edicaoEstatica || c.perfilPrivado || c.aceito || c.dispensado) return false;
  if (!c.servidor?.disponivel || c.servidor.restanteSegundos < RESTANTE_MINIMO_PARA_OFERECER_S) return false;
  return aparelhoPedeAlivio(c.aparelho);
}
