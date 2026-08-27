/**
 * A REGRA do gate por view, como função pura — é o que o teste exercita.
 *
 * Sem conta, o app abre nas telas que rodam inteiras no navegador (início, capturar, jogar com a
 * sessão atual, ajustes). O que persiste na conta — biblioteca, sessão/análise, vocabulário,
 * perfil — mostra um convite em vez da tela, e NUNCA some do menu: "mostra, explica, não esconde".
 */
import type { ViewType } from '../../types';

export const EXIGE_CONTA: ReadonlySet<ViewType> = new Set<ViewType>(['library', 'analysis', 'study', 'reading', 'metrics', 'profile']);

export function exigeConta(view: string): boolean {
  return EXIGE_CONTA.has(view as ViewType);
}

/** Lembra que a pessoa escolheu seguir sem conta — para não perguntar de novo a cada visita. */
export const CHAVE_ANONIMO_ACEITO = 'babel.anonimo_aceito';

export function anonimoAceito(): boolean {
  try { return localStorage.getItem(CHAVE_ANONIMO_ACEITO) === '1'; } catch { return false; }
}

export function aceitarAnonimo(): void {
  try { localStorage.setItem(CHAVE_ANONIMO_ACEITO, '1'); } catch { /* best-effort */ }
}

export interface EstadoDaPorta {
  authRequired: boolean;
  temSessao: boolean;
  anonimoAceito: boolean;
  /** A pessoa sem conta pediu para entrar (menu, convite, gate). */
  pedindoLogin: boolean;
}

/** O que a porta de entrada mostra. `login` = tela de login; `app` = a aplicação. */
export function porta(e: EstadoDaPorta): 'login' | 'app' {
  if (!e.authRequired) return 'app';
  if (e.temSessao) return 'app';
  if (e.pedindoLogin) return 'login';
  return e.anonimoAceito ? 'app' : 'login';
}

/** O motivo do gate em linguagem de gente, a partir da view pedida ou da rota recusada. */
export function motivoDoGate(origem: string): string {
  const c = CONVITE[origem];
  if (c) return c.titulo + '.';
  if (origem.includes('/api/import/youtube')) return 'Importar do YouTube precisa de conta (e do plano Pro).';
  if (origem.includes('/api/import/')) return 'Importar conteúdo para a biblioteca precisa de conta.';
  if (origem.includes('/api/ai/') || origem.includes('/api/gemini/')) return 'A inteligência artificial de nuvem precisa de conta. A transcrição e a tradução locais continuam livres.';
  if (origem.includes('/api/images/')) return 'Buscar capas precisa de conta.';
  return 'Esta ação guarda dados na sua conta.';
}

/** Texto do convite por tela — diz o que a conta desbloqueia ALI, não genericamente. */
export const CONVITE: Record<string, { titulo: string; explicacao: string }> = {
  library: { titulo: 'Sua biblioteca fica na sua conta', explicacao: 'Sem conta, cada sessão vive só neste navegador. Com conta, suas gravações ficam guardadas, organizadas e disponíveis em qualquer aparelho.' },
  analysis: { titulo: 'A análise da sessão precisa de conta', explicacao: 'Transcrição editável, leitura guiada, métricas por sessão e os jogos sobre o que você gravou, tudo salvo na sua conta.' },
  study: { titulo: 'A revisão precisa de conta', explicacao: 'A repetição espaçada só faz sentido quando o progresso é lembrado de um dia para o outro.' },
  reading: { titulo: 'A leitura guiada precisa de conta', explicacao: 'Anotações e progresso de leitura ficam na sua conta.' },
  metrics: { titulo: 'Seu vocabulário fica na sua conta', explicacao: 'As palavras que você captura viram um baralho com revisão espaçada, e isso precisa ser lembrado entre visitas.' },
  profile: { titulo: 'O perfil é da conta', explicacao: 'Nome, objetivo, nível e histórico de XP existem a partir do momento em que você cria a conta.' },
};
