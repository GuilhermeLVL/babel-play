/**
 * A CENTRAL DE NOTIFICAÇÕES — o sino do protótipo aprovado (`E.notifs` + `desenharNotifs`).
 *
 * SÓ EVENTO QUE ACONTECEU. Cada notificação nasce de um fato que o app já produz (ver
 * `lib/estado/useNotificacoes`): palavras vencidas, conquista/nível/baú entregues na fila de
 * recompensas, sessão salva, ofensiva em risco. Nada de "resumo da semana" ou "recibo" que o app
 * não gera.
 *
 * Store de módulo com pub/sub (o mesmo formato do `Toast`), persistido no `localStorage` deste
 * navegador. `chave` deduplica: o mesmo fato (a mesma conquista, as vencidas de um dia) vira UMA
 * notificação, atualizada em vez de repetida.
 */

import { t } from './i18n';

export type TomDaNotificacao = '' | 'good' | 'warn' | 'rare';
export type IconeDaNotificacao = 'target' | 'award' | 'trending-up' | 'gift' | 'library' | 'flame';

export interface Notificacao {
  id: string;
  /** Identidade do fato: a mesma chave atualiza a notificação em vez de criar outra. */
  chave: string;
  icone: IconeDaNotificacao;
  tom: TomDaNotificacao;
  titulo: string;
  detalhe: string;
  /** Quando aconteceu (ms). */
  em: number;
  /** Para onde o clique leva (view do app) e com que dado. */
  ir: string;
  dado?: Record<string, string>;
  lida: boolean;
}

const CHAVE = 'babel.notificacoes';
const MAXIMO = 40;

type Ouvinte = (lista: Notificacao[]) => void;
const ouvintes = new Set<Ouvinte>();

function ler(): Notificacao[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
    return Array.isArray(lista) ? (lista as Notificacao[]).filter((n) => n && typeof n.id === 'string') : [];
  } catch {
    return [];
  }
}

let lista: Notificacao[] = ler();

function gravar(nova: Notificacao[]) {
  lista = nova.slice(0, MAXIMO);
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* sem storage (aba privada): a central funciona só nesta sessão */
  }
  ouvintes.forEach((o) => o(lista));
}

export function notificacoes(): Notificacao[] {
  return lista;
}

export function naoLidas(l: Notificacao[] = lista): number {
  return l.filter((n) => !n.lida).length;
}

export function ouvirNotificacoes(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

export interface NovaNotificacao {
  chave: string;
  icone: IconeDaNotificacao;
  tom?: TomDaNotificacao;
  titulo: string;
  detalhe: string;
  ir: string;
  dado?: Record<string, string>;
  em?: number;
}

/**
 * Registra um fato. Se a chave já existe: com o MESMO texto, nada muda (o efeito que chama isto
 * roda a cada render de métrica); com texto novo (ex.: mais palavras vencidas no mesmo dia),
 * atualiza e volta a ficar não lida, no topo.
 */
export function notificar(n: NovaNotificacao): void {
  const existente = lista.find((x) => x.chave === n.chave);
  if (existente && existente.titulo === n.titulo && existente.detalhe === n.detalhe) return;
  const nova: Notificacao = {
    id: existente?.id ?? `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    chave: n.chave,
    icone: n.icone,
    tom: n.tom ?? '',
    titulo: n.titulo,
    detalhe: n.detalhe,
    em: n.em ?? Date.now(),
    ir: n.ir,
    dado: n.dado,
    lida: false,
  };
  gravar([nova, ...lista.filter((x) => x.chave !== n.chave)]);
}

/** Já existe uma notificação para este fato? (para não recriar a que a pessoa já leu) */
export function jaNotificado(chave: string): boolean {
  return lista.some((x) => x.chave === chave);
}

export function marcarLida(id: string): void {
  if (!lista.some((n) => n.id === id && !n.lida)) return;
  gravar(lista.map((n) => (n.id === id ? { ...n, lida: true } : n)));
}

export function marcarTodasLidas(): void {
  if (!naoLidas()) return;
  gravar(lista.map((n) => ({ ...n, lida: true })));
}

/** "agora", "há 5 min", "hoje", "ontem" ou a data — o `q` do protótipo. */
export function quando(em: number, agora = Date.now()): string {
  const dif = agora - em;
  if (dif < 60_000) return t('agora');
  if (dif < 3_600_000) return t('há {n} min', { n: Math.floor(dif / 60_000) });
  const d = new Date(em),
    h = new Date(agora);
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mesmoDia(d, h)) return t('hoje');
  const ontem = new Date(h);
  ontem.setDate(h.getDate() - 1);
  if (mesmoDia(d, ontem)) return t('ontem');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Só para testes: zera a central. */
export function _zerarNotificacoes(): void {
  gravar([]);
}
