/**
 * AS CONVERSAS DO iCHAT — o que fica salvo, e as contas puras sobre elas.
 *
 * Desenho e regras do protótipo aprovado (`docs/prototipos/consistencia-telas.html`, iChat
 * contextual): cada conversa tem as mensagens, o RASTRO (telas, palavras, sessões, perguntas e
 * ações, sem repetir o mesmo item seguido) e as palavras e sessões que passaram por ela.
 *
 * ONDE FICA. No `localStorage` deste navegador, como o iChat anterior (`ichat_sessions`) já fazia:
 * não há rota de servidor para conversas. É DA CONTA: o valor leva o dono (`lib/armazemLocalPorConta`); a conversa de
 * outra conta não aparece e sai, e sair, limpar tudo e excluir a conta a apagam. O formato antigo (`ichat_sessions`,
 * sem dono, não é de ninguém) deixou de ser migrado: sai ao ser lido (`migrarDoFormatoAntigo` fica só como conversão pura).
 */
import { criarChaveLocalPorConta } from '../armazemLocalPorConta';

export type TipoDoRastro = 'tela' | 'palavra' | 'sessao' | 'pergunta' | 'acao';

export interface EventoDoRastro {
  tipo: TipoDoRastro;
  rot: string;
  meta: string;
  /** Hora no formato HH:MM, como a linha do tempo mostra. */
  em: string;
}

/** Uma ação que MUDA algo no app: só acontece se a pessoa confirmar (princípio P4). */
export interface Proposta {
  rot: string;
  tipo: 'revisar' | 'palavra' | 'jogar' | 'anki';
  palavra?: string;
  palavras?: string[];
}

export interface MensagemDoChat {
  de: 'eu' | 'ia';
  txt: string;
  /** Fichas (`@palavra`, `#sessão`, `!ação`) que foram junto com a pergunta. */
  tokens?: string[];
  /** De onde veio a resposta (princípio P2). */
  origem?: string;
  proposta?: Proposta | null;
  decidida?: 'ok' | 'nao';
  av?: 'bom' | 'ruim' | null;
  /** A resposta veio do tutor do servidor (`/api/tutor/chat`): o 👍/👎 dela vai a `POST /api/ai/feedback`. */
  doTutor?: boolean;
  /** A assinatura do servidor para esta resposta do tutor: volta com ela no histórico (`historicoParaOTutor`). */
  assinatura?: string;
  /** Resposta que é um aviso de falha (sem plano, sem modelo, servidor fora): não se avalia. */
  erro?: boolean;
}

export interface Conversa {
  id: string;
  titulo: string;
  fixada: boolean;
  /** epoch ms da última mensagem ou da criação. */
  quando: number;
  msgs: MensagemDoChat[];
  rastro: EventoDoRastro[];
  sessoes: string[];
  palavras: string[];
}

const CHAVE = 'ichat_conversas';
const CHAVE_ATUAL = 'ichat_conversa_atual'; // legado: hoje a conversa atual vai junto, na chave principal
const CHAVE_ANTIGA = 'ichat_sessions';

export const TITULO_NOVA = 'Nova conversa';

export function horaAgora(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function novaConversa(agora = Date.now()): Conversa {
  return {
    id: `c${agora}${Math.random().toString(36).slice(2, 6)}`,
    titulo: TITULO_NOVA,
    fixada: false,
    quando: agora,
    msgs: [],
    rastro: [],
    sessoes: [],
    palavras: [],
  };
}

/**
 * Registro de movimentação SEM duplicar o mesmo item seguido — igual ao `rastrear` do protótipo.
 * Devolve a MESMA conversa quando nada muda, para o React não regravar à toa.
 */
export function rastrear(c: Conversa, tipo: TipoDoRastro, rot: string, meta = '', agora = new Date()): Conversa {
  const ult = c.rastro[c.rastro.length - 1];
  if (ult && ult.tipo === tipo && ult.rot === rot) return c;
  return {
    ...c,
    rastro: [...c.rastro, { tipo, rot, meta, em: horaAgora(agora) }],
    palavras: tipo === 'palavra' && !c.palavras.includes(rot) ? [...c.palavras, rot] : c.palavras,
  };
}

/** Título que a conversa ganha com a primeira pergunta (38 caracteres, como no protótipo). */
export function tituloDaPergunta(texto: string): string {
  return texto.length > 38 ? `${texto.slice(0, 38)}…` : texto;
}

/** "agora", "hoje, 14:05", "ontem" ou a data — o `quando` da lista de conversas. */
export function quandoLegivel(ms: number, agora = Date.now()): string {
  if (agora - ms < 2 * 60_000) return 'agora';
  const d = new Date(ms);
  const hoje = new Date(agora);
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mesmoDia(d, hoje)) return `hoje, ${horaAgora(d)}`;
  const ontem = new Date(agora - 86_400_000);
  if (mesmoDia(d, ontem)) return 'ontem';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** A busca da gaveta de conversas: título e texto das mensagens; fixadas primeiro. */
export function filtrarConversas(lista: Conversa[], busca: string): Conversa[] {
  const q = busca.trim().toLowerCase();
  return lista
    .filter((x) => !q || `${x.titulo} ${x.msgs.map((m) => m.txt).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.fixada) - Number(a.fixada));
}

/** O trecho que casou com a busca ("achado em: …"), ou '' quando não há busca ou nada casou. */
export function achadoEm(c: Conversa, busca: string): string {
  const q = busca.trim().toLowerCase();
  if (!q) return '';
  const m = c.msgs.find((x) => x.txt.toLowerCase().includes(q));
  return m ? m.txt.slice(0, 48) : '';
}

/** Tira o `**negrito**` e os links do markdown para o texto caber numa linha de prévia. */
export function semMarcacao(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1');
}

interface MensagemAntiga {
  role?: string;
  content?: string;
}
interface SessaoAntiga {
  id?: string;
  title?: string;
  messages?: MensagemAntiga[];
  createdAt?: string;
}

/* As boas-vindas fixas do iChat antigo não são conversa de ninguém: ficam de fora da migração. */
const BOAS_VINDAS_ANTIGAS = [/^Olá! Sou seu Babel iChat/, /^Iniciei um novo contexto de conversação/];

/** O formato de `ichat_sessions` (iChat anterior) convertido para conversas. */
export function migrarDoFormatoAntigo(bruto: unknown): Conversa[] {
  if (!Array.isArray(bruto)) return [];
  const saida: Conversa[] = [];
  for (const s of bruto as SessaoAntiga[]) {
    const msgs: MensagemDoChat[] = (s.messages ?? [])
      .filter((m) => typeof m.content === 'string' && m.content.trim())
      .filter((m) => !(m.role === 'assistant' && BOAS_VINDAS_ANTIGAS.some((r) => r.test(m.content ?? ''))))
      .map((m) => ({ de: m.role === 'user' ? ('eu' as const) : ('ia' as const), txt: m.content ?? '' }));
    if (!msgs.length) continue;
    const criada = s.createdAt ? Date.parse(s.createdAt) : NaN;
    saida.push({
      id: s.id ? `m-${s.id}` : novaConversa().id,
      titulo: (s.title ?? '').trim() || TITULO_NOVA,
      fixada: false,
      quando: Number.isFinite(criada) ? criada : Date.now(),
      msgs,
      rastro: [],
      sessoes: [],
      palavras: [],
    });
  }
  return saida;
}

function valida(x: unknown): x is Conversa {
  const c = x as Conversa;
  return !!c && typeof c.id === 'string' && Array.isArray(c.msgs) && Array.isArray(c.rastro);
}

interface Salvo {
  conversas: unknown;
  atual: string;
}

/** A chave das conversas desta conta (o aparelho padrão). A antiga e a "atual" saem junto ao apagar. */
const doAparelho = criarChaveLocalPorConta<Salvo>(CHAVE, {
  nome: 'ichat-conversas',
  extras: [CHAVE_ATUAL, CHAVE_ANTIGA],
});
const doArmazem = (armazem?: Storage) =>
  armazem
    ? criarChaveLocalPorConta<Salvo>(CHAVE, { storage: () => armazem, extras: [CHAVE_ATUAL, CHAVE_ANTIGA] })
    : doAparelho;

/** Lê as conversas salvas (as DESTA conta). Nunca devolve lista vazia: sem nada salvo, nasce uma conversa nova. */
export function carregarConversas(armazem?: Storage): { conversas: Conversa[]; atual: string } {
  const salvo = doArmazem(armazem).ler();
  /* O formato antigo não tem dono: não é de ninguém, e sai em vez de ser migrado. */
  try {
    (armazem ?? localStorage).removeItem(CHAVE_ANTIGA);
  } catch {
    /* sem armazenamento: não há o que apagar */
  }
  let conversas: Conversa[] = Array.isArray(salvo?.conversas) ? (salvo.conversas as unknown[]).filter(valida) : [];
  if (!conversas.length) conversas = [novaConversa()];
  let atual = salvo?.atual ?? '';
  if (!conversas.some((c) => c.id === atual)) atual = conversas[0].id;
  return { conversas, atual };
}

export function salvarConversas(conversas: Conversa[], atual: string, armazem?: Storage): void {
  /* Sem dono conhecido, cota cheia ou armazenamento bloqueado: a conversa continua na tela, só não sobrevive ao recarregar. */
  doArmazem(armazem).gravar({ conversas, atual });
}
