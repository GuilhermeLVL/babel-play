/**
 * IDENTIDADE — o primeiro dos três eixos de acesso (identidade · plano · papel).
 *
 *   'selfhost'   build sem login (VITE_AUTH_REQUIRED≠1): o servidor trata tudo como LOCAL_OWNER.
 *   'carregando' build com login, antes de `getSession()` responder.
 *   'anonimo'    build com login, SEM sessão: a pessoa está usando sem conta.
 *   'conta'      sessão Supabase válida.
 *
 * Quem alimenta é o `App` (efeito de sessão). Quem consome é `apiFetch` — que no estado `anonimo`
 * NÃO vai à rede e responde pelo servidor em memória (`data/efemero`) — e o gateway de IA, que
 * recusa a nuvem gerenciada sem conta.
 *
 * `aguardarIdentidade()` só ESPERA quando o App "armou" a espera (`armarIdentidade`). Sem isso —
 * testes que importam `data/api` sem renderizar o App — ela devolve o estado atual na hora; senão
 * qualquer chamada ficaria pendurada para sempre esperando um `definirIdentidade` que nunca vem.
 */
import { authRequired } from './supabase';

export type EstadoDeIdentidade = 'carregando' | 'anonimo' | 'conta' | 'selfhost';
export type IdentidadeResolvida = Exclude<EstadoDeIdentidade, 'carregando'>;

const EVENTO = 'babel_identidade_changed';

let estado: EstadoDeIdentidade = authRequired ? 'carregando' : 'selfhost';
let armada = false;
let resolver: ((e: IdentidadeResolvida) => void) | null = null;
let pronta: Promise<IdentidadeResolvida> | null = null;

export function estadoDeIdentidade(): EstadoDeIdentidade {
  return estado;
}

export function estaAnonimo(): boolean {
  return estado === 'anonimo';
}

/** O App chama ao montar: a partir daqui `aguardarIdentidade` espera de verdade pela definição. */
export function armarIdentidade(): void {
  armada = true;
  if (estado === 'carregando' && !pronta) pronta = new Promise((r) => { resolver = r; });
}

export function definirIdentidade(nova: IdentidadeResolvida): void {
  const antes = estado;
  estado = nova;
  if (resolver) { resolver(nova); resolver = null; }
  pronta = Promise.resolve(nova);
  if (antes !== nova && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: { antes, depois: nova } }));
  }
}

/** Resolve com a identidade definida; se ninguém armou a espera, devolve o estado atual na hora. */
export function aguardarIdentidade(): Promise<EstadoDeIdentidade> {
  if (estado !== 'carregando') return Promise.resolve(estado);
  if (!armada) return Promise.resolve(estado);
  if (!pronta) pronta = new Promise((r) => { resolver = r; });
  return pronta;
}

export function aoMudarIdentidade(cb: (depois: IdentidadeResolvida, antes: EstadoDeIdentidade) => void): () => void {
  const h = (ev: Event) => {
    const d = (ev as CustomEvent<{ antes: EstadoDeIdentidade; depois: IdentidadeResolvida }>).detail;
    cb(d.depois, d.antes);
  };
  window.addEventListener(EVENTO, h);
  return () => window.removeEventListener(EVENTO, h);
}

/** Só para testes: volta ao estado de módulo recém-carregado. */
export function _reiniciarIdentidade(): void {
  estado = authRequired ? 'carregando' : 'selfhost';
  armada = false;
  resolver = null;
  pronta = null;
}
