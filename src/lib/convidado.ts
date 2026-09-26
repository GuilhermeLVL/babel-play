/**
 * MODO CONVIDADO NO CLIENTE (Fase 7) — desenho em `openspec/audits/2026-09-25-prontidao/fase7-convidado.md`.
 *
 * O app continua 100% LOCAL para quem não tem conta: `apiFetch` responde pelo servidor em memória
 * (`data/efemero`). O convidado só ganha uma identidade no servidor — um usuário ANÔNIMO do Supabase
 * (`signInAnonymously`) — quando as DUAS flags estão ligadas (`modo_convidado` e `nuvem_convidado`)
 * E ele tenta usar a IA de nuvem (transcrição, tradução, tutor). Nunca no primeiro acesso.
 *
 * A sessão anônima NÃO é conta: a identidade continua `anonimo` (os dados seguem no aparelho), e o
 * token só sai nas rotas de nuvem. O servidor recusa qualquer outra escrita com `exige_conta`.
 *
 * CONVERSÃO com o MESMO id: criar conta a partir da sessão anônima usa `updateUser({ email })` ou
 * `linkIdentity` (`lib/auth.ts`), e o Supabase mantém o `sub` — cota e contadores do servidor seguem
 * com a pessoa. Os dados LOCAIS sobem pelo `ModalDeMigracao` de sempre.
 *
 * OFERTAS: este módulo não desenha nada de venda. Ao bater um teto que pede conta ele só avisa a
 * Fase 8 pelo evento `babel:oferta` (`lib/ofertas/eventos.ts`; os momentos em `src/core/ofertas.ts`).
 */
import { flagLigada } from './flagsCache';
import { dispararOferta } from './ofertas/eventos';
import { carregarSupabase } from './supabase';
import { obterTokenDoTurnstile } from './turnstile';

/** A sessão do Supabase é de um usuário anônimo (convidado)? */
export function ehSessaoAnonima(sessao: { user?: unknown } | null | undefined): boolean {
  return (sessao?.user as { is_anonymous?: unknown } | undefined)?.is_anonymous === true;
}

/** As rotas de IA de nuvem que o convidado pode chamar no servidor real (espelho de `server/lib/convidado.ts`). */
const ROTAS_DE_NUVEM: ReadonlyArray<{ metodo: string; caminho: RegExp }> = [
  { metodo: 'GET', caminho: /^\/api\/ai\/stt\/available$/ },
  { metodo: 'POST', caminho: /^\/api\/ai\/stt$/ },
  { metodo: 'POST', caminho: /^\/api\/ai\/mt$/ },
  { metodo: 'POST', caminho: /^\/api\/tutor\/chat$/ },
];

export function ehRotaDeNuvemDoConvidado(input: string, metodo = 'GET'): boolean {
  const caminho = new URL(input, 'http://convidado.local').pathname;
  const m = metodo.toUpperCase();
  return ROTAS_DE_NUVEM.some((r) => r.metodo === m && r.caminho.test(caminho));
}

/** O modo convidado está ligado (flag remota)? Desligado, nada muda no app. */
export function modoConvidadoLigado(): boolean {
  return flagLigada('modo_convidado');
}

/** O convidado pode usar a nuvem agora? As duas flags, avaliadas pelo servidor. */
export function nuvemDoConvidadoLigada(): boolean {
  return flagLigada('modo_convidado') && flagLigada('nuvem_convidado');
}

let emCriacao: Promise<boolean> | null = null;

/**
 * Garante a sessão ANÔNIMA do Supabase, criando-a na primeira vez (com o captcha do Turnstile quando
 * `VITE_TURNSTILE_SITE_KEY` existe). Chamadas simultâneas dividem a mesma criação — duas falas ao
 * mesmo tempo não viram dois usuários anônimos. `false` = não deu (sem Supabase, captcha recusado,
 * anônimo desligado no painel): quem chama segue local.
 */
export function garantirSessaoDeConvidado(): Promise<boolean> {
  emCriacao ??= (async () => {
    try {
      const sb = await carregarSupabase();
      if (!sb) return false;
      const { data } = await sb.auth.getSession();
      if (data.session) return true;
      const captchaToken = await obterTokenDoTurnstile();
      const { data: criada, error } = await sb.auth.signInAnonymously(
        captchaToken ? { options: { captchaToken } } : undefined,
      );
      return !error && !!criada.session;
    } catch {
      return false;
    } finally {
      emCriacao = null;
    }
  })();
  return emCriacao;
}

/**
 * Lê a resposta de uma chamada do convidado e, se ela for um TETO que pede CONTA, dispara
 * `convidado_para_conta` (canal da Fase 8, `lib/ofertas/eventos.ts`):
 *  - 507 `TETO_ANONIMO` (servidor em memória: gravações/palavras no limite);
 *  - 403 `exige_conta` (nuvem do convidado desligada) e 429 `limite_de_convidados`.
 * O 402 `quota_exceeded` (cota de nuvem do convidado) NÃO é tratado aqui: os adaptadores de nuvem
 * (`serverLlmMt`, `groqWhisper`, `IChat`) já o transformam em `fim_de_cota` — disparar de novo
 * contaria a mesma recusa duas vezes.
 * Só com o modo convidado ligado; desligado, o comportamento de antes não muda. Nunca lança.
 */
export async function ofertaPelaResposta(res: Response, rota: string): Promise<void> {
  if (!modoConvidadoLigado()) return;
  if (res.status !== 507 && res.status !== 403 && res.status !== 429) return;
  let corpo: { code?: unknown; codigo?: unknown; recurso?: unknown };
  try {
    corpo = await res.clone().json();
  } catch {
    return;
  }
  const codigo = corpo.code ?? corpo.codigo;
  if (res.status === 507 && codigo === 'TETO_ANONIMO') {
    dispararOferta('convidado_para_conta', { motivo: 'teto_local', recurso: corpo.recurso, rota });
  } else if (
    (res.status === 403 && codigo === 'exige_conta') ||
    (res.status === 429 && codigo === 'limite_de_convidados')
  ) {
    dispararOferta('convidado_para_conta', { motivo: String(codigo), rota });
  }
}

/** Só para testes. */
export function _esquecerCriacaoDeConvidado(): void {
  emCriacao = null;
}
