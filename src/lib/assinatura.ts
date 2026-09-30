/**
 * ASSINATURA NO CLIENTE — o estado da conta que as telas de pagamento desenham, e as chamadas
 * ao servidor que elas fazem.
 *
 * O CLIENTE NÃO DECIDE NADA DE DINHEIRO. Preço vem de `PLAN_MATRIX`; se a assinatura está ativa,
 * atrasada ou cancelada vem de `GET /api/billing/status`; as faturas, de `GET /api/billing/faturas`.
 * Quem promove o plano é só o webhook do servidor, quando o Asaas confirma o pagamento — por isso
 * a tela "Assinatura confirmada" pergunta ao servidor, e nunca confia num parâmetro da URL.
 *
 * O protótipo aprovado simula sete estados de conta (`ESTADOS_CONTA`). O app tem cinco de
 * verdade: self-host, grátis, ativa, pagamento pendente e cancelada. "Pausada" não existe (a
 * cobrança não tem pausa).
 *
 * MATRIZ V2 (ADR 0011): um plano pago só, o Premium. O ciclo (mensal ou anual) vem do servidor; o
 * checkout escolhe entre o mensal, o anual em uma vez e o anual em 12x no cartão (C5). O nome antigo
 * (`essencial`/`pro`) de um servidor anterior é lido como o Premium (`planoPagoDe`).
 */
import {
  type CicloDeCobranca,
  ehPlanoPago as ehPlanoPagoDaMatriz,
  normalizarPlano,
  PARCELAS_DO_ANUAL,
  PLAN_MATRIX,
  valoresDasParcelas,
} from '../core/planos';
import { apiFetch } from '../data/api';
import type { Plan } from './entitlements';
import { t } from './i18n';

export type PlanoPago = 'premium';
export const PLANOS_PAGOS: readonly PlanoPago[] = ['premium'];
/** ESTRITO: só o nome atual. Para ler o que veio de fora (servidor, armazenamento), `planoPagoDe`. */
export const ehPlanoPago = (p: unknown): p is PlanoPago => ehPlanoPagoDaMatriz(p);
/** O plano pago que um valor de fora é — o nome antigo vira o atual; o que não é plano pago, `null`. */
export function planoPagoDe(p: unknown): PlanoPago | null {
  const plano = normalizarPlano(p);
  return ehPlanoPago(plano) ? plano : null;
}

export interface StatusDeBilling {
  configurado: boolean;
  assinatura: {
    plano: string;
    status: string;
    valeAte: number | null;
    provedor: string | null;
    /** Matriz v2: por mês ou o ano. Ausente em servidor anterior (= mensal). */
    ciclo?: CicloDeCobranca;
    /** O fluxo do Asaas que cobra (`assinatura`, `parcelamento`, `pix_automatico`); `null` = admin. */
    meio?: string | null;
    /**
     * Renova sozinha? Só a assinatura ativa (mensal ou anual `YEARLY`); o 12x acaba na 12ª parcela e
     * a cancelada não renova. Ausente em servidor anterior ao C5.
     */
    renovacaoAutomatica?: boolean;
  } | null;
  /**
   * A PRÓXIMA COBRANÇA (`AAAA-MM-DD`, o `nextDueDate` do Asaas) — só para assinatura ativa, e só
   * quando o servidor conseguiu perguntar. NÃO é `valeAte`: esse é o vencimento mais a graça de
   * atraso, até quando o acesso vale.
   */
  proximaCobranca?: string;
  /** O teste de 14 dias do Premium desta conta (C6). Ausente em servidor anterior. */
  teste?: SituacaoDoTeste;
}

/** Por que a conta não pode começar o teste (o servidor decide; a tela só explica). */
export type MotivoSemTeste =
  | 'selfhost'
  | 'convidado'
  | 'idade_nao_informada'
  | 'perfil_protegido'
  | 'ja_assinante'
  | 'sem_email'
  | 'marca_usada';

/** O teste de 14 dias como o servidor o vê — `GET /api/billing/status` → `teste`. */
export type SituacaoDoTeste =
  | { estado: 'disponivel'; dias: number }
  | { estado: 'ativo' | 'usado'; dias: number; iniciadoEm: number; terminaEm: number }
  | { estado: 'indisponivel'; dias: number; motivo: MotivoSemTeste };

export interface Fatura {
  id: string;
  /** `AAAA-MM-DD` (pagamento, ou vencimento se ainda não pago). */
  data: string | null;
  descricao: string;
  valor: number;
  metodo: 'cartao' | 'pix' | 'boleto' | null;
  status: 'paga' | 'pendente' | 'falhou' | 'estornada';
  /** Comprovante do Asaas (só quando pago). */
  recibo: string | null;
  /** A página da fatura no Asaas — onde se paga a que está em aberto. */
  link: string | null;
}

/**
 * `teste` (C6/C7): o teste de 14 dias do Premium, sem cartão. NÃO é assinatura — não tem aba "Sua
 * assinatura", não se cancela e nunca cobra: no fim a conta volta ao Grátis sozinha.
 */
export type EstadoDaConta = 'selfhost' | 'gratis' | 'teste' | 'ativa' | 'falhou' | 'cancelada';

export interface Conta {
  estado: EstadoDaConta;
  /** O plano pago da assinatura (quando há uma), ou o Premium do teste. */
  plano: PlanoPago | null;
  /** Até quando o período pago vale (ms) — no teste, quando ele termina. `null` = o servidor não sabe. */
  valeAte: number | null;
  /** Quando o Asaas cobra de novo (`AAAA-MM-DD`). Ausente = não se sabe (e a tela diz "acesso até"). */
  proximaCobranca?: string | null;
  /** Por mês ou o ano — só quando o servidor disse. */
  ciclo?: CicloDeCobranca;
  /**
   * O fluxo do Asaas que cobra: `assinatura` (mensal ou `YEARLY`), `parcelamento` (o 12x) — e `null`
   * quando ninguém cobra (concedido pela equipe). AUSENTE = o servidor não disse (anterior ao C5).
   */
  meio?: string | null;
  /** Renova sozinha? Só a assinatura ativa; o 12x acaba na 12ª parcela. Ausente = não se sabe. */
  renovacaoAutomatica?: boolean;
}

/**
 * O estado da conta, derivado do que o SERVIDOR disse (entitlements + status da cobrança).
 *
 * `trialing` é só a intenção gravada ao iniciar o checkout (não concede nada no servidor): para a
 * tela, a conta continua no Grátis até o webhook confirmar o pagamento.
 *
 * O TESTE (C7): quem testa tem o Premium nos entitlements, mas não tem assinatura. Antes disto ele
 * caía no "plano pago sem cobrança" e a tela o tratava como assinante (aba "Sua assinatura", "Voltar
 * ao Grátis" levando a um cancelamento que não existe). O teste vem do status (`teste.estado`) ou,
 * sem ele, dos entitlements (`teste.terminaEm`, o que o aviso de D-3/D0 já lê).
 */
export function estadoDaConta(
  plan: Plan,
  status: StatusDeBilling | null,
  agora = Date.now(),
  testeDosEntitlements?: { terminaEm: number } | null,
): Conta {
  if (plan === 'selfhost') return { estado: 'selfhost', plano: null, valeAte: null };
  const s = status?.assinatura;
  const pagoNaAssinatura = s ? planoPagoDe(s.plano) : null;
  if (s && pagoNaAssinatura) {
    const extra: Pick<Conta, 'ciclo' | 'meio' | 'renovacaoAutomatica'> = {
      ...(s.ciclo ? { ciclo: s.ciclo } : {}),
      ...(s.meio !== undefined ? { meio: s.meio } : {}),
      ...(typeof s.renovacaoAutomatica === 'boolean' ? { renovacaoAutomatica: s.renovacaoAutomatica } : {}),
    };
    if (s.status === 'active')
      return {
        estado: 'ativa',
        plano: pagoNaAssinatura,
        valeAte: s.valeAte,
        ...(status?.proximaCobranca ? { proximaCobranca: status.proximaCobranca } : {}),
        ...extra,
      };
    if (s.status === 'past_due') return { estado: 'falhou', plano: pagoNaAssinatura, valeAte: s.valeAte, ...extra };
    if (s.status === 'canceled' && s.valeAte !== null && s.valeAte > agora)
      return { estado: 'cancelada', plano: pagoNaAssinatura, valeAte: s.valeAte, ...extra };
  }
  const t = status?.teste;
  const terminaEm =
    t?.estado === 'ativo'
      ? t.terminaEm
      : !status?.teste && testeDosEntitlements
        ? testeDosEntitlements.terminaEm
        : null;
  if (terminaEm !== null && terminaEm > agora) return { estado: 'teste', plano: 'premium', valeAte: terminaEm };
  // Plano pago sem cobrança no provedor (concedido pelo administrador): ativo, sem data.
  const pagoNoPlano = planoPagoDe(plan);
  if (pagoNoPlano) return { estado: 'ativa', plano: pagoNoPlano, valeAte: null };
  return { estado: 'gratis', plano: null, valeAte: null };
}

export const temAssinatura = (e: EstadoDaConta): boolean => e === 'ativa' || e === 'falhou' || e === 'cancelada';

/**
 * COMO ESTA CONTA PAGA, para a tela dizer o ciclo e o meio (C7): o mensal, o anual à vista (renova
 * em um ano), o anual em 12x no cartão (não renova) — ou `concedido`, quando ninguém cobra (meio
 * `null`). Servidor anterior ao C5 (sem ciclo nem meio) é o mensal de sempre.
 */
export type FormaDaConta = FormaDeAssinar | 'concedido';
export function formaDaConta(c: Pick<Conta, 'ciclo' | 'meio'>): FormaDaConta {
  if (c.meio === null) return 'concedido';
  if (c.ciclo !== 'anual') return 'mensal';
  return c.meio === 'parcelamento' ? 'anual_12x' : 'anual';
}

/** "mensal", "anual" ou "anual em 12x" — o que vem depois de "Premium ·". */
export function rotuloDaForma(f: FormaDaConta): string {
  if (f === 'anual') return t('anual');
  if (f === 'anual_12x') return t('anual em 12x');
  if (f === 'concedido') return t('sem cobrança');
  return t('mensal');
}

/**
 * QUANTO O ANUAL ECONOMIZA contra 12 mensalidades — em reais e em meses inteiros ("equivale a 3
 * meses grátis": R$ 179 contra 12 × R$ 19,90 = R$ 238,80). Da matriz, nunca à mão: mudar um preço
 * muda a frase.
 */
export function economiaDoAnual(p: PlanoPago): { reais: number; meses: number; dozeMeses: number } {
  const mensal = precoMensal(p);
  const dozeMeses = Math.round(mensal * 12 * 100) / 100;
  const reais = Math.round((dozeMeses - precoAnual(p)) * 100) / 100;
  return { reais, meses: mensal > 0 ? Math.floor(reais / mensal + 1e-9) : 0, dozeMeses };
}

/**
 * PARA QUEM É O CHECKOUT (Fase 4): o responsável que aceitou o convite pode assinar pelo menor. A
 * tela de aceite guarda aqui o menor escolhido; o checkout lê, mostra "assinando para…" e manda
 * `paraUsuario`. O servidor confere o vínculo — isto é só a lembrança da escolha.
 */
const CHAVE_DO_BENEFICIARIO = 'babel.checkout.para';
export interface Beneficiario {
  id: string;
  nome: string | null;
}
export function lerBeneficiario(): Beneficiario | null {
  try {
    const b = JSON.parse(sessionStorage.getItem(CHAVE_DO_BENEFICIARIO) ?? 'null') as Beneficiario | null;
    return b && typeof b.id === 'string' ? b : null;
  } catch {
    return null;
  }
}
export function definirBeneficiario(b: Beneficiario | null): void {
  try {
    if (b) sessionStorage.setItem(CHAVE_DO_BENEFICIARIO, JSON.stringify(b));
    else sessionStorage.removeItem(CHAVE_DO_BENEFICIARIO);
  } catch {
    /* sem armazenamento, o responsável escolhe de novo */
  }
}

/** Preço mensal do plano, da matriz — nunca escrito à mão numa tela. */
export const precoMensal = (p: PlanoPago): number => PLAN_MATRIX[p].precoMensalBrl ?? 0;

/** Preço do ANO, da matriz (à vista na assinatura anual, ou o total do 12x). */
export const precoAnual = (p: PlanoPago): number => PLAN_MATRIX[p].precoAnualBrl ?? 0;

/**
 * AS FORMAS DE PAGAR que o checkout oferece (C5): o mensal recorrente, o anual em uma vez (assinatura
 * `YEARLY`, que renova em um ano) e o anual em 12x no cartão (parcelamento, sem renovação automática).
 * O Pix Automático fica de fora enquanto a conta do serviço não for elegível (ver o servidor).
 */
export type FormaDeAssinar = 'mensal' | 'anual' | 'anual_12x';
export const FORMAS_DE_ASSINAR: readonly FormaDeAssinar[] = ['mensal', 'anual', 'anual_12x'];

/**
 * A FORMA COM QUE O CHECKOUT ABRE — o período escolhido no seletor Mensal/Anual da tela de Planos
 * (C7), por aba, como o plano (`planoDoCheckout`). Recarregar o checkout não volta ao mensal.
 */
const CHAVE_DA_FORMA_DO_CHECKOUT = 'babel.checkout.forma';
export function lembrarFormaDoCheckout(f: FormaDeAssinar): void {
  try {
    sessionStorage.setItem(CHAVE_DA_FORMA_DO_CHECKOUT, f);
  } catch {
    /* sem armazenamento: o checkout abre no período escolhido só enquanto a tela está aberta */
  }
}
export function formaGuardadaDoCheckout(): FormaDeAssinar | null {
  try {
    const f = sessionStorage.getItem(CHAVE_DA_FORMA_DO_CHECKOUT);
    return (FORMAS_DE_ASSINAR as readonly string[]).includes(f ?? '') ? (f as FormaDeAssinar) : null;
  } catch {
    return null;
  }
}

/** O que o servidor recebe de cada forma: o ciclo e o fluxo do Asaas que cobra. */
export function cobrancaDaForma(f: FormaDeAssinar): { ciclo: CicloDeCobranca; meio: 'assinatura' | 'parcelamento' } {
  if (f === 'mensal') return { ciclo: 'mensal', meio: 'assinatura' };
  return { ciclo: 'anual', meio: f === 'anual_12x' ? 'parcelamento' : 'assinatura' };
}

/**
 * As parcelas do 12x COMO O ASAAS AS COBRA — ele trunca e joga a diferença na última (11 × R$ 14,91
 * + R$ 14,99 = R$ 179). A tela mostra as duas: prometer "12x de R$ 14,91" seria um centavo a menos
 * por mês do que a última parcela cobra.
 */
export const parcelasDoAnual = (p: PlanoPago): { padrao: number; ultima: number; quantidade: number } => ({
  ...valoresDasParcelas(precoAnual(p), PARCELAS_DO_ANUAL),
  quantidade: PARCELAS_DO_ANUAL,
});

/** "R$ 19,90" — a formatação do protótipo (`brl`). */
export const brl = (v: number): string => 'R$ ' + v.toFixed(2).replace('.', ',');

/** "22/10/2026" a partir de ms ou de `AAAA-MM-DD` (sem fuso: a data do Asaas é de calendário). */
export function dataCurta(x: number | string | null | undefined): string {
  if (x === null || x === undefined || x === '') return '—';
  if (typeof x === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(x);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
  }
  const d = new Date(x);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export const ROTULO_DO_METODO: Record<NonNullable<Fatura['metodo']>, string> = {
  cartao: 'Cartão',
  pix: 'Pix',
  boleto: 'Boleto',
};

/** A fatura em aberto (atrasada ou pendente) que tem página para pagar. */
export const faturaEmAberto = (fs: Fatura[] | null): Fatura | null =>
  fs?.find((f) => (f.status === 'falhou' || f.status === 'pendente') && f.link) ?? null;

/* ── Chamadas ao servidor ─────────────────────────────────────────────────── */

export async function carregarStatusDeBilling(): Promise<StatusDeBilling | null> {
  try {
    const r = await apiFetch('/api/billing/status');
    return r.ok ? ((await r.json()) as StatusDeBilling) : null;
  } catch {
    return null;
  }
}

/** `null` = não deu para saber (sem cobrança configurada ou servidor fora) — NUNCA vira "zero faturas". */
export async function carregarFaturas(): Promise<Fatura[] | null> {
  try {
    const r = await apiFetch('/api/billing/faturas');
    if (!r.ok) return null;
    const corpo = (await r.json()) as { faturas?: Fatura[] };
    return Array.isArray(corpo.faturas) ? corpo.faturas : null;
  } catch {
    return null;
  }
}

/** Cria a assinatura no Asaas e devolve o link da página de pagamento (quem concede é o webhook). */
export async function iniciarAssinatura(dados: {
  plano: PlanoPago;
  nome: string;
  cpfCnpj: string;
  email?: string;
  /** O responsável assinando pelo menor vinculado (Fase 4): a assinatura nasce na conta dele. */
  paraUsuario?: string;
  /** C5: sem os dois, o servidor cria o mensal recorrente de sempre. */
  ciclo?: CicloDeCobranca;
  meio?: 'assinatura' | 'parcelamento';
}): Promise<{ link: string | null; erro?: string; codigo?: string }> {
  try {
    const r = await apiFetch('/api/billing/assinar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    const corpo = (await r.json().catch(() => ({}))) as {
      linkDePagamento?: string | null;
      error?: string;
      code?: string;
    };
    /* O `code` do servidor decide o que a tela faz: `idade_nao_informada` pede a data ali mesmo,
       `checkout_desligado` mostra a venda pausada, `menor_nao_compra` explica o responsável. */
    if (!r.ok) return { link: null, erro: corpo.error ?? `falha (HTTP ${r.status})`, codigo: corpo.code };
    return { link: corpo.linkDePagamento ?? null };
  } catch {
    return { link: null, erro: 'não consegui falar com o servidor.' };
  }
}

/**
 * COMEÇA O TESTE DE 14 DIAS — um toque, sem cartão (C6). Não pede nome, CPF nem cartão: nada é
 * cobrado, nem no fim. `paraUsuario` = o responsável ativando para o menor vinculado. Quem concede é
 * o servidor; a tela recarrega os entitlements depois.
 */
export async function iniciarTeste(
  paraUsuario?: string,
): Promise<{ terminaEm: number | null; erro?: string; codigo?: string }> {
  try {
    const r = await apiFetch('/api/billing/teste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paraUsuario ? { paraUsuario } : {}),
    });
    const corpo = (await r.json().catch(() => ({}))) as {
      teste?: { terminaEm?: number };
      error?: string;
      code?: string;
    };
    if (!r.ok) return { terminaEm: null, erro: corpo.error ?? `falha (HTTP ${r.status})`, codigo: corpo.code };
    return { terminaEm: typeof corpo.teste?.terminaEm === 'number' ? corpo.teste.terminaEm : null };
  } catch {
    return { terminaEm: null, erro: 'não consegui falar com o servidor.' };
  }
}

/**
 * O arrependimento que o servidor registrou ao cancelar (CDC art. 49): o valor devolvido, se o
 * Asaas já aceitou o estorno ou se ele virou manual, e o protocolo que a tela mostra na hora.
 */
export interface Arrependimento {
  valor: number;
  estornado: boolean;
  protocolo: string;
  registradoEm: number;
  prazoManualDias?: number;
}

/**
 * Cancela a assinatura. Depois dos 7 dias, para a RENOVAÇÃO e o pago vale até `valeAte`; dentro
 * dos 7 dias do primeiro pagamento, o servidor faz o arrependimento (estorno integral, acesso
 * termina agora) e devolve `arrependimento`.
 */
export async function cancelarRenovacao(): Promise<{
  ok: boolean;
  valeAte?: number | null;
  arrependimento?: Arrependimento | null;
  erro?: string;
}> {
  try {
    const r = await apiFetch('/api/billing/cancelar', { method: 'POST' });
    const corpo = (await r.json().catch(() => ({}))) as {
      valeAte?: number | null;
      arrependimento?: Arrependimento | null;
      error?: string;
    };
    return r.ok
      ? { ok: true, valeAte: corpo.valeAte ?? null, arrependimento: corpo.arrependimento ?? null }
      : { ok: false, erro: corpo.error ?? `HTTP ${r.status}` };
  } catch {
    return { ok: false, erro: 'não consegui falar com o servidor.' };
  }
}

// O plano que o checkout abre mora em `lib/planoDoCheckout` (fora do JS de arranque); daqui, só o repasse.
export { CHAVE_DO_PLANO_DO_CHECKOUT, lembrarPlanoDoCheckout } from './planoDoCheckout';
