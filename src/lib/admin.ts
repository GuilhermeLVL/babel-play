import type { PlanoDeAssinatura } from '../core/planos';
import { apiFetch, lerErro } from '../data/funil';

/**
 * O CLIENTE FINO DA ADMINISTRAÇÃO — uma função por rota de `server/routes/admin.ts`, e nada mais.
 *
 * QUEM DECIDE É O SERVIDOR. Cada rota exige o papel `admin` (leitura de algumas, também `support`) e,
 * quando a conta tem segundo fator, uma sessão `aal2`. Esconder o item de menu é conforto, não
 * segurança: sem papel, a rota responde 403 e a tela só mostra isso.
 *
 * NUNCA LANÇA. Toda função devolve `Resposta<T>`: o dado, ou a recusa com o texto do servidor. O
 * 403 `aal2_requerido` ganha `segundoFator: true` — é o caso em que a tela pede o código em vez de
 * dizer "erro". Nada aqui grava dado de outra conta em disco, e nada é logado: o que a rota devolve
 * (ids de conta, motivos de cobrança) fica só em memória, na tela.
 */

/**
 * O dado (`ok`), ou a recusa com o texto do servidor. Interface única, e não união discriminada: o
 * `tsconfig` do projeto não liga `strict`, e sem ele `if (r.ok)` não estreita o `else`.
 */
export interface Resposta<T> {
  ok: boolean;
  /** Só com `ok`. */
  dados?: T;
  /** Só sem `ok`: o HTTP (0 = sem conexão), a frase do servidor e se é o pedido do segundo fator. */
  status?: number;
  erro?: string;
  segundoFator?: boolean;
}

/** O que a tela precisa do perfil para decidir se mostra a administração. */
export const ehAdmin = (perfil: { role: string } | null | undefined): boolean => perfil?.role === 'admin';

// ───────────────────────────── contratos (espelham o servidor, sem inventar campo) ─────────────────────────────

/** `GET /api/admin/resumo` — `ResumoDoDono`. */
export interface Resumo {
  usuarios: number;
  usuariosNovos7d: number;
  sessoes: number;
  sessoes7d: number;
  falas: number;
  cartoesDeVocabulario: number;
  geradoEm: number;
}

interface GastoDeIa {
  gastoUsd: number;
  /** `null` = sem teto (self-host). */
  tetoUsd: number | null;
  percentual: number | null;
  chamadas: number;
  alerta80Em: number | null;
  esgotadoEm: number | null;
}

/** `GET /api/admin/ia` — `EstadoDoOrcamento`. */
export interface OrcamentoDeIa extends GastoDeIa {
  mes: string;
  ligada: boolean;
  dia: GastoDeIa & { dia: string };
  portao: { ok: boolean; motivo?: string; mensagem?: string; fracaoDoOrcamento?: number };
}

export type PapelDaConta = 'user' | 'admin' | 'support';
export type StatusDaConta = 'active' | 'suspended';

/** `GET /api/admin/users` — a linha de `users` (o e-mail quase nunca está preenchido). */
export interface Conta {
  id: string;
  createdAt: number;
  updatedAt: number;
  email: string | null;
  role: PapelDaConta;
  status: StatusDaConta;
  displayName: string | null;
  locale: string | null;
}

/** A assinatura ativa da conta (`GET /api/admin/users/:id`); `null`/ausente = nenhuma. */
export interface Assinatura {
  plan: string;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: number | null;
  provider: string | null;
  ciclo: string;
  meio: string | null;
}

export interface DetalheDaConta {
  user: Conta;
  subscription: Assinatura | null | undefined;
}

/** `GET /api/admin/billing/pendentes` — um evento de cobrança que não teve efeito. */
export interface Pendencia {
  id: string;
  createdAt: number;
  provider: string;
  event: string;
  userId: string | null;
  providerRef: string | null;
  motivo: string | null;
}

/** `POST /api/admin/billing/reprocessar/:id`. `repetido` = o evento já estava aplicado. */
export interface ResultadoDoReprocesso {
  ok: boolean;
  estado?: string;
  motivo?: string | null;
  repetido?: boolean;
}

/** `GET /api/admin/erros`. Cada linha vem como o diário a gravou (sem PII); `{ bruto }` é linha ilegível. */
export interface DiarioDeErros {
  diario: string;
  total?: number;
  erros: Array<Record<string, unknown>>;
}

/** `GET /api/admin/flags` — `FlagCrua`. */
export interface Flag {
  chave: string;
  descricao: string;
  habilitada: boolean;
  regras: { planos?: string[]; percentual?: number; ids?: string[]; idiomas?: string[]; versaoMinima?: string };
  payload: unknown;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

// ───────────────────────────── o funil local ─────────────────────────────

async function chamar<T>(caminho: string, init?: RequestInit & { corpo?: unknown }): Promise<Resposta<T>> {
  try {
    const { corpo, ...resto } = init ?? {};
    const res = await apiFetch(
      caminho,
      corpo === undefined
        ? resto
        : { ...resto, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) },
    );
    if (res.ok) return { ok: true, dados: (await res.json()) as T };
    const e = await lerErro(res);
    return {
      ok: false,
      status: e.status,
      erro: e.error,
      segundoFator: e.status === 403 && e.code === 'aal2_requerido',
    };
  } catch {
    return { ok: false, status: 0, erro: 'sem conexão com o servidor', segundoFator: false };
  }
}

const enc = encodeURIComponent;

// ───────────────────────────── leituras ─────────────────────────────

export const lerResumo = () => chamar<Resumo>('/api/admin/resumo');
export const lerOrcamentoDeIa = () => chamar<OrcamentoDeIa>('/api/admin/ia');
export const listarContas = () => chamar<Conta[]>('/api/admin/users');
export const lerConta = (id: string) => chamar<DetalheDaConta>(`/api/admin/users/${enc(id)}`);
export const listarPendencias = () => chamar<Pendencia[]>('/api/admin/billing/pendentes');
export const lerErros = (limite = 100) => chamar<DiarioDeErros>(`/api/admin/erros?limite=${limite}`);
export const listarFlags = () => chamar<Flag[]>('/api/admin/flags');

// ───────────────────────────── escritas (só admin) ─────────────────────────────

export const alterarConta = (id: string, mudanca: { role?: PapelDaConta; status?: StatusDaConta }) =>
  chamar<Conta>(`/api/admin/users/${enc(id)}`, { method: 'PATCH', corpo: mudanca });

export const concederPlano = (id: string, plano: PlanoDeAssinatura) =>
  chamar<Assinatura>(`/api/admin/users/${enc(id)}/plan`, { method: 'PATCH', corpo: { plan: plano } });

export const reprocessar = (idDoEvento: string) =>
  chamar<ResultadoDoReprocesso>(`/api/admin/billing/reprocessar/${enc(idDoEvento)}`, { method: 'POST' });

export const alterarFlag = (chave: string, habilitada: boolean) =>
  chamar<Flag>(`/api/admin/flags/${enc(chave)}`, { method: 'PUT', corpo: { habilitada } });
