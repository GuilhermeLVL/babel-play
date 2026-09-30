/**
 * FEATURE FLAGS — a AVALIAÇÃO, pura e compartilhada (Fase 6b).
 *
 * Uma regra só para os dois lados: o servidor avalia aqui antes de responder `GET /api/flags`, e os
 * testes (e qualquer ferramenta) conseguem perguntar "esta pessoa veria esta flag?" sem banco, sem
 * rede e sem relógio. Nada de DOM, Node ou dependência: é núcleo isomórfico (`src/core`).
 *
 * O QUE UMA FLAG É: um interruptor de PRODUTO (mostrar, esconder, experimentar) com um `payload`
 * opcional de configuração/textos. NUNCA é guarda de segurança nem de cota — a regra roda também
 * para quem não tem conta e o resultado vai para o cliente, que pode mentir. Cota e direito são do
 * servidor (`server/lib/entitlements.ts`, `server/lib/usageQuota.ts`). Ver `docs/flags.md`.
 *
 * SEMÂNTICA DAS REGRAS (todas opcionais; ausente = sem restrição):
 *   - `habilitada: false`   → desligada para todos, sem exceção (é o interruptor mestre);
 *   - `ids`                 → alvo INDIVIDUAL: quem está na lista (id da conta ou da instalação)
 *                             recebe a flag ligada, independentemente das outras regras. Para
 *                             liberar SÓ para a lista, combine com `percentual: 0`;
 *   - `planos`              → o plano do contexto precisa estar na lista (`convidado` = sem conta);
 *   - `idiomas`             → idioma da interface na lista (`pt` casa `pt-BR` e vice-versa);
 *   - `versaoMinima`        → versão do app >= a mínima (semver; metadado `+sha` é ignorado).
 *                             Versão desconhecida NÃO passa: é regra para proteger bundle velho;
 *   - `percentual`          → 0–100 das pessoas, por BALDE ESTÁVEL (`baldeEstavel`). Sem id
 *                             estável só 100 passa — sortear a cada request faria a flag piscar.
 * As restrições se combinam com E.
 */

import { normalizarPlano, type PlanoEfetivo } from './planos';

/**
 * RECOMPENSAS v2 (Tasks 2.3/2.4): o interruptor de tudo que é novo nas recompensas. Nasce
 * DESLIGADA no servidor (migração `flag_recompensas_v2`). Na edição estática não há servidor de
 * flags: quem liga é o build, com `VITE_RECOMPENSAS_V2=1` (a onda 5 acende).
 */
export const FLAG_RECOMPENSAS_V2 = 'recompensas_v2';

export function recompensasV2Ativas(ctx: {
  edicaoEstatica: boolean;
  /** `import.meta.env.VITE_RECOMPENSAS_V2` do build. */
  envDoBuild: string | undefined;
  /** `flagLigada('recompensas_v2')`, do cache de `GET /api/flags`. */
  flagDoServidor: boolean;
}): boolean {
  return ctx.edicaoEstatica ? ctx.envDoBuild === '1' : ctx.flagDoServidor;
}

/**
 * Os planos que uma regra pode nomear: os da matriz, mais `convidado` (quem não tem conta, Fase 7).
 * O `satisfies` prende a lista à matriz: um plano que sair de `PLAN_MATRIX` quebra a compilação aqui,
 * e não uma regra de flag em produção.
 */
export const PLANOS_DA_FLAG = ['convidado', 'free', 'premium', 'selfhost'] as const satisfies readonly PlanoEfetivo[];
export type PlanoDaFlag = (typeof PLANOS_DA_FLAG)[number];

/**
 * O PLANO DE UMA REGRA ESCRITA ANTES DA MATRIZ V2: `essencial`/`pro` são lidos como `premium`
 * (`normalizarPlano`), `convidado` passa, o resto é `null`. A migração 0041 reescreve as regras do
 * banco; isto cobre a regra editada à mão depois dela, ou um script de operação antigo.
 */
export function planoDaFlag(v: unknown): PlanoDaFlag | null {
  return v === 'convidado' ? 'convidado' : normalizarPlano(v);
}

export interface RegrasDaFlag {
  planos?: PlanoDaFlag[];
  /** 0–100. */
  percentual?: number;
  ids?: string[];
  idiomas?: string[];
  versaoMinima?: string;
}

/** A linha do banco, já com o JSON interpretado. */
export interface DefinicaoDeFlag {
  chave: string;
  descricao: string;
  habilitada: boolean;
  regras: RegrasDaFlag;
  payload: unknown;
}

/** Quem está perguntando. Tudo opcional: o anônimo sem instalação conhecida também pergunta. */
export interface ContextoDaFlag {
  plano: PlanoDaFlag;
  /** Id da conta (quando há token válido). */
  userId?: string | null;
  /** UUID da instalação (localStorage do cliente). */
  instalacao?: string | null;
  /** Idioma da interface (`pt`, `en`, `pt-BR`…). */
  idioma?: string | null;
  /** Versão do app que está rodando no cliente. */
  versao?: string | null;
}

/** O que sai para o cliente: só o resultado e o payload — nunca as regras nem as listas. */
export interface FlagAvaliada {
  ligada: boolean;
  payload?: unknown;
}

export type FlagsAvaliadas = Record<string, FlagAvaliada>;

/** Formato das chaves: minúsculas, dígitos e `_`, começando por letra. Curto de propósito. */
export const FORMATO_DA_CHAVE = /^[a-z][a-z0-9_]{1,62}$/;

// ───────────────────────────── balde estável ─────────────────────────────

/**
 * FNV-1a de 32 bits — determinístico, sem dependência, igual no navegador e no Node. Não é
 * criptográfico e não precisa ser: ninguém ganha nada escolhendo o próprio balde (flag não é
 * segurança), e o que importa é espalhar bem e dar o mesmo número sempre.
 */
export function fnv1a32(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * O balde 0–99 de um id para UMA flag. A chave entra no hash para que os baldes de flags diferentes
 * sejam independentes: sem ela, quem está nos primeiros 10% de um experimento estaria nos primeiros
 * 10% de TODOS, e os experimentos se contaminariam.
 */
export function baldeEstavel(id: string, chave: string): number {
  return fnv1a32(`${chave}:${id}`) % 100;
}

/** O id que decide o balde: a conta quando existe (estável entre aparelhos), senão a instalação. */
export function idEstavel(ctx: ContextoDaFlag): string | null {
  return ctx.userId || ctx.instalacao || null;
}

// ───────────────────────────── idioma e versão ─────────────────────────────

const baseDoIdioma = (s: string) => s.trim().toLowerCase().split(/[-_]/)[0];

/** `pt` casa `pt-BR`; `pt-BR` casa `pt`; `pt-BR` NÃO casa `pt-PT`. */
export function idiomaCasa(permitido: string, idioma: string): boolean {
  const a = permitido.trim().toLowerCase().replace('_', '-');
  const b = idioma.trim().toLowerCase().replace('_', '-');
  if (!a || !b) return false;
  if (a === b) return true;
  const aTemRegiao = a.includes('-');
  const bTemRegiao = b.includes('-');
  if (aTemRegiao && bTemRegiao) return false;
  return baseDoIdioma(a) === baseDoIdioma(b);
}

/** `0.1.0+35bc2d6` → `[0,1,0]`. Fora do formato → `null`. Pré-lançamento (`-beta`) é ignorado. */
export function partesDaVersao(v: string): [number, number, number] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/** `-1` / `0` / `1`. Versão ilegível é tratada como a menor possível. */
export function compararVersoes(a: string, b: string): number {
  const pa = partesDaVersao(a) ?? [-1, -1, -1];
  const pb = partesDaVersao(b) ?? [-1, -1, -1];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

// ───────────────────────────── avaliação ─────────────────────────────

/** A flag está ligada para este contexto? Pura. */
export function avaliarFlag(
  def: Pick<DefinicaoDeFlag, 'chave' | 'habilitada' | 'regras'>,
  ctx: ContextoDaFlag,
): boolean {
  if (!def.habilitada) return false;
  const r = def.regras ?? {};

  // Alvo individual: vence as outras regras (e só elas — o interruptor mestre já foi conferido).
  if (r.ids?.length) {
    const ids = new Set(r.ids);
    if ((ctx.userId && ids.has(ctx.userId)) || (ctx.instalacao && ids.has(ctx.instalacao))) return true;
  }

  if (r.planos && !r.planos.includes(ctx.plano)) return false;

  if (r.idiomas) {
    const idioma = ctx.idioma ?? '';
    if (!r.idiomas.some((p) => idiomaCasa(p, idioma))) return false;
  }

  if (r.versaoMinima) {
    if (!ctx.versao || !partesDaVersao(ctx.versao)) return false;
    if (compararVersoes(ctx.versao, r.versaoMinima) < 0) return false;
  }

  if (r.percentual !== undefined) {
    const p = Math.max(0, Math.min(100, r.percentual));
    if (p >= 100) return true;
    if (p <= 0) return false;
    const id = idEstavel(ctx);
    if (!id) return false;
    return baldeEstavel(id, def.chave) < p;
  }

  return true;
}

/**
 * Avalia a lista inteira. O payload só sai com a flag LIGADA: desligada, o cliente usa o padrão
 * embutido no código — e texto de uma oferta que ninguém deveria ver não precisa atravessar a rede.
 */
export function avaliarFlags(defs: readonly DefinicaoDeFlag[], ctx: ContextoDaFlag): FlagsAvaliadas {
  const out: FlagsAvaliadas = {};
  for (const d of defs) {
    const ligada = avaliarFlag(d, ctx);
    out[d.chave] =
      ligada && d.payload !== undefined && d.payload !== null ? { ligada, payload: d.payload } : { ligada };
  }
  return out;
}
