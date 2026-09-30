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
 * cobrança não tem pausa) e "Pro anual" também não (o servidor só cobra por mês).
 */
import { PLAN_MATRIX } from '../core/planos';
import { apiFetch } from '../data/api';
import type { Plan } from './entitlements';

export type PlanoPago = 'essencial' | 'pro';
export const PLANOS_PAGOS: readonly PlanoPago[] = ['essencial', 'pro'];
export const ehPlanoPago = (p: unknown): p is PlanoPago => p === 'essencial' || p === 'pro';

export interface StatusDeBilling {
  configurado: boolean;
  assinatura: { plano: string; status: string; valeAte: number | null; provedor: string | null } | null;
  /**
   * A PRÓXIMA COBRANÇA (`AAAA-MM-DD`, o `nextDueDate` do Asaas) — só para assinatura ativa, e só
   * quando o servidor conseguiu perguntar. NÃO é `valeAte`: esse é o vencimento mais a graça de
   * atraso, até quando o acesso vale.
   */
  proximaCobranca?: string;
}

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

export type EstadoDaConta = 'selfhost' | 'gratis' | 'ativa' | 'falhou' | 'cancelada';

export interface Conta {
  estado: EstadoDaConta;
  /** O plano pago da assinatura (quando há uma). */
  plano: PlanoPago | null;
  /** Até quando o período pago vale (ms). `null` = o servidor não sabe ainda. */
  valeAte: number | null;
  /** Quando o Asaas cobra de novo (`AAAA-MM-DD`). Ausente = não se sabe (e a tela diz "acesso até"). */
  proximaCobranca?: string | null;
}

/**
 * O estado da conta, derivado do que o SERVIDOR disse (entitlements + status da cobrança).
 *
 * `trialing` é só a intenção gravada ao iniciar o checkout (não concede nada no servidor): para a
 * tela, a conta continua no Grátis até o webhook confirmar o pagamento.
 */
export function estadoDaConta(plan: Plan, status: StatusDeBilling | null, agora = Date.now()): Conta {
  if (plan === 'selfhost') return { estado: 'selfhost', plano: null, valeAte: null };
  const s = status?.assinatura;
  if (s && ehPlanoPago(s.plano)) {
    if (s.status === 'active')
      return {
        estado: 'ativa',
        plano: s.plano,
        valeAte: s.valeAte,
        ...(status?.proximaCobranca ? { proximaCobranca: status.proximaCobranca } : {}),
      };
    if (s.status === 'past_due') return { estado: 'falhou', plano: s.plano, valeAte: s.valeAte };
    if (s.status === 'canceled' && s.valeAte !== null && s.valeAte > agora)
      return { estado: 'cancelada', plano: s.plano, valeAte: s.valeAte };
  }
  // Plano pago sem cobrança no provedor (concedido pelo administrador): ativo, sem data.
  if (ehPlanoPago(plan)) return { estado: 'ativa', plano: plan, valeAte: null };
  return { estado: 'gratis', plano: null, valeAte: null };
}

export const temAssinatura = (e: EstadoDaConta): boolean => e === 'ativa' || e === 'falhou' || e === 'cancelada';

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
