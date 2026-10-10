/**
 * O QUE O iCHAT ENTENDE DE UMA PERGUNTA — antes de mandá-la ao modelo.
 *
 * O protótipo aprovado responde de forma determinística sobre o estado do app. O app real manda a
 * pergunta ao tutor de verdade (`/api/tutor/chat`); o que fica aqui, fora do modelo, é o que o
 * protótipo promete e que não pode depender de o modelo "obedecer":
 *
 *  - P2, TODA RESPOSTA CITA A ORIGEM: a origem é o material que FOI enviado (caderno, fila de
 *    revisão, transcrição, tela), decidido aqui, e não uma frase que o modelo escreve;
 *  - P3, "NÃO SEI" É RESPOSTA: dado que o iChat não enxerga (pagamento, senha) nem vai ao modelo;
 *  - P4, AÇÃO SÓ COM CONFIRMAÇÃO: a proposta (abrir a revisão, abrir um jogo) é montada aqui a
 *    partir do pedido e dos números reais, e só roda quando a pessoa confirma o cartão.
 */
import type { ViewType } from '../../types';
import { TETO_DE_ENTRADA_DO_TUTOR } from './contencao';
import type { Proposta } from './conversas';

export type Sigilo = '@' | '#' | '!';

/** Uma ficha na caixa de texto: `@palavra` do caderno, `#sessão` da biblioteca ou `!ação`. */
export interface Ficha {
  sig: Sigilo;
  id: string;
  rot: string;
}

export type Acao = 'revisar' | 'jogar' | 'resumir' | 'frase';

export const ACOES_DO_CHAT: { id: Acao; t: string; d: string }[] = [
  { id: 'revisar', t: 'revisar', d: 'abre uma rodada com as palavras pendentes' },
  { id: 'jogar', t: 'jogar', d: 'sugere um jogo que roda com o seu material' },
  { id: 'resumir', t: 'resumir', d: 'resume a sessão em foco' },
  { id: 'frase', t: 'frase', d: 'cria uma frase de exemplo com as palavras' },
];

/** A classe de cor da ficha: acento para palavra, verde para sessão, amarelo para ação. */
export const CLASSE_DO_SIGILO: Record<Sigilo, string> = { '@': 'sa', '#': 'ss', '!': 'sx' };

/** A tela do protótipo a que cada tela do app corresponde (decide as ferramentas do "+"). */
type TelaDoPrototipo = 'sessao' | 'revisao' | 'vocabulario' | 'jogar' | 'biblioteca' | 'capturar' | 'outra';

function telaDoPrototipo(view: ViewType): TelaDoPrototipo {
  switch (view) {
    case 'analysis':
    case 'reading':
      return 'sessao';
    case 'study':
      return 'revisao';
    case 'cartoes':
    case 'metrics':
      return 'vocabulario';
    case 'play':
      return 'jogar';
    case 'library':
      return 'biblioteca';
    case 'capture':
      return 'capturar';
    default:
      return 'outra';
  }
}

export const ehTelaDeSessao = (view: ViewType) => telaDoPrototipo(view) === 'sessao';

export type IdDaFerramenta = 'explicar' | 'traduzir' | 'revisar' | 'jogar' | 'frase' | 'resumir' | 'anki';

export interface Ferramenta {
  id: IdDaFerramenta;
  t: string;
  d: string;
}

const EXPLICAR: Ferramenta = { id: 'explicar', t: 'Explicar uma palavra', d: 'significado, uso e exemplo' };
const TRADUZIR: Ferramenta = { id: 'traduzir', t: 'Traduzir a fala ativa', d: 'com a nuance do contexto' };
const REVISAR: Ferramenta = { id: 'revisar', t: 'Montar uma revisão', d: 'com as palavras pendentes' };
const JOGAR: Ferramenta = { id: 'jogar', t: 'Sugerir um jogo', d: 'que roda com o seu material' };
const FRASE: Ferramenta = { id: 'frase', t: 'Criar frase de exemplo', d: 'com as palavras do caderno' };
const RESUMIR: Ferramenta = { id: 'resumir', t: 'Resumir a sessão', d: 'em três pontos' };
const ANKI: Ferramenta = { id: 'anki', t: 'Levar para o Anki', d: 'exporta as palavras' };

/** Ferramentas por tela (exposição condicional), na mesma ordem e nos mesmos grupos do protótipo. */
export function ferramentasDaTela(view: ViewType): [string, Ferramenta[]][] {
  const t = telaDoPrototipo(view);
  if (t === 'sessao')
    return [
      ['Entender esta sessão', [EXPLICAR, TRADUZIR]],
      ['Praticar', [REVISAR, JOGAR]],
      ['Organizar', [RESUMIR, ANKI]],
    ];
  if (t === 'vocabulario' || t === 'revisao')
    return [
      ['Entender', [EXPLICAR]],
      ['Praticar', [REVISAR, JOGAR, FRASE]],
    ];
  if (t === 'jogar')
    return [
      ['Praticar', [JOGAR, FRASE]],
      ['Entender', [EXPLICAR]],
    ];
  if (t === 'biblioteca' || t === 'capturar')
    return [
      ['Organizar', [RESUMIR]],
      ['Praticar', [REVISAR, JOGAR]],
    ];
  return [
    ['Praticar', [REVISAR, JOGAR]],
    ['Entender', [EXPLICAR]],
  ];
}

/** A pergunta que cada ferramenta de prática manda, com a ficha `!ação` junto. */
export const PERGUNTA_DA_FERRAMENTA: Record<Acao, string> = {
  revisar: 'O que revisar hoje?',
  jogar: 'Qual jogo começo?',
  frase: 'Crie uma frase com as minhas palavras',
  resumir: 'Resuma esta sessão',
};

export interface Pedido {
  acao: Acao | null;
  /** A palavra do caderno em foco (ficha `@` ou citada na pergunta). */
  palavra: string | null;
  /** O dado que o iChat não enxerga: responde "não sei" sem chamar o modelo. */
  lacuna: boolean;
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lê o pedido: a ação (`!ficha`, `!palavra` escrita ou o verbo da pergunta) e a palavra em foco.
 *
 * "cartão de crédito", e não "cartão": neste app um cartão é também o cartão do caderno, e a
 * pergunta "o que é este cartão?" não pode cair na lacuna de pagamento.
 */
export function lerPedido(pergunta: string, fichas: Ficha[], palavrasDoCaderno: string[]): Pedido {
  const q = pergunta.toLowerCase();
  const lacuna = /pagamento|cart[aã]o de cr[eé]dito|fatura|senha/.test(q);
  const fichaAcao = fichas.find((f) => f.sig === '!')?.rot;
  const escrita = q.match(/!(\w+)/)?.[1];
  const acaoCrua =
    fichaAcao ??
    escrita ??
    (/revis/.test(q)
      ? 'revisar'
      : /jog/.test(q)
        ? 'jogar'
        : /resum/.test(q)
          ? 'resumir'
          : /frase|exemplo/.test(q)
            ? 'frase'
            : null);
  const acao = ACOES_DO_CHAT.some((a) => a.id === acaoCrua) ? (acaoCrua as Acao) : null;
  const fichaPalavra = fichas.find((f) => f.sig === '@')?.rot;
  const citada = fichaPalavra
    ? null
    : (palavrasDoCaderno.find(
        (w) => w.length >= 3 && new RegExp(`(^|[^\\p{L}])${escaparRegex(w.toLowerCase())}([^\\p{L}]|$)`, 'u').test(q),
      ) ?? null);
  return { acao, palavra: fichaPalavra ?? citada, lacuna };
}

/** A palavra é o foco quando não há ação que a englobe (revisar e jogar tratam o caderno todo). */
export const focoNaPalavra = (p: Pedido) => !!p.palavra && p.acao !== 'revisar' && p.acao !== 'jogar';

/** O rótulo da etapa "consultando…" que aparece antes do texto. `null` = "pensando". */
export function rotuloDaFerramenta(p: Pedido, temFichaDeSessao: boolean): string | null {
  if (focoNaPalavra(p)) return 'consultando seu caderno';
  if (p.acao === 'revisar') return 'consultando a fila de revisão';
  if (p.acao === 'jogar') return 'verificando que jogos rodam com o seu material';
  if (p.acao === 'resumir' || temFichaDeSessao) return 'lendo a transcrição';
  if (p.acao === 'frase') return 'montando a frase';
  return null;
}

interface MaterialEnviado {
  pedido: Pedido;
  /** Título da sessão cuja transcrição foi junto (ficha `#` ou a sessão aberta), se houver. */
  sessao: string | null;
  palavrasNoCaderno: number;
  auto: boolean;
  nomeDaTela: string;
}

/** A origem da resposta = o material que foi mandado ao modelo, dito em poucas palavras. */
export function origemDaResposta(m: MaterialEnviado): string {
  const { pedido: p } = m;
  if (focoNaPalavra(p)) return `seu caderno · “${p.palavra}”`;
  if (p.acao === 'revisar') return 'fila de revisão';
  if (p.acao === 'jogar')
    return `seu caderno · ${m.palavrasNoCaderno} ${m.palavrasNoCaderno === 1 ? 'palavra' : 'palavras'}`;
  if ((p.acao === 'resumir' || !p.acao) && m.sessao) return `transcrição de “${m.sessao}”`;
  if (p.acao === 'frase') return 'gerado com as palavras do caderno';
  if (m.auto) return `contexto da tela ${m.nomeDaTela}`;
  return 'conhecimento geral do tutor';
}

/** A proposta que acompanha a resposta, montada com os números reais — ou nenhuma. */
export function propostaDoPedido(p: Pedido, pendentes: number): Proposta | null {
  if (focoNaPalavra(p))
    return pendentes > 0 ? { rot: 'Revisar esta palavra agora', tipo: 'palavra', palavra: p.palavra ?? '' } : null;
  if (p.acao === 'revisar')
    return pendentes > 0 ? { rot: `Abrir revisão com ${pendentes} palavras`, tipo: 'revisar' } : null;
  if (p.acao === 'jogar') return { rot: 'Abrir o Memória', tipo: 'jogar' };
  return null;
}

export const RESPOSTA_DA_LACUNA =
  'Não tenho esse dado aqui. O iChat só enxerga o que está no app: suas palavras, sessões e progresso. Pagamento fica em Planos.';

/** Quanto do teto o material da tela pode ocupar — o resto fica para a conversa. */
const TETO_DO_MATERIAL = 6_000;

interface MensagemDoTutor {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * O PEDIDO QUE CABE NO TETO DO SERVIDOR. O servidor recusa com 413 acima de
 * `TETO_DE_ENTRADA_DO_TUTOR`; cortar aqui é o que evita a pergunta de agora voltar como "grande
 * demais" por causa de material longo ou de histórico antigo. Corta o material pelo fim (o começo
 * da tela é o que situa) e o histórico pelo mais ANTIGO (o recente é o que dá sentido à pergunta).
 */
export function pedidoDoTutor(
  material: string,
  historico: MensagemDoTutor[],
  pergunta: string,
): { material: string; mensagens: MensagemDoTutor[] } {
  const m = material.length > TETO_DO_MATERIAL ? `${material.slice(0, TETO_DO_MATERIAL - 4)} […]` : material;
  let resta = TETO_DE_ENTRADA_DO_TUTOR - m.length - pergunta.length;
  const cabem: MensagemDoTutor[] = [];
  for (const msg of historico.slice(-19).reverse()) {
    if (msg.content.length > resta) break;
    cabem.unshift(msg);
    resta -= msg.content.length;
  }
  return { material: m, mensagens: [...cabem, { role: 'user', content: pergunta }] };
}
