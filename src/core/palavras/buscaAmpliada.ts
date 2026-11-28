/**
 * A BUSCA AMPLIADA (openspec `cartoes` 9.2; flag `estudo_palavras_v2`): a busca global passa a achar, além do que já achava
 * (telas, gravações e palavras), as AÇÕES de estudo, os BARALHOS (sessões, baralhos do Anki, a Trilha) e as telas de dentro de
 * Cartões (Hoje, Palavras, Memória). Só regra pura: quem desenha e navega é `components/BuscaGlobal.tsx`.
 *
 * O texto dos itens é a chave do catálogo de i18n (a tela o passa por `t()`); a busca compara sem acento e sem caixa.
 */
import type { ContagensDeConteudo } from '../learning/contagensDeConteudo';

export type AcaoDeEstudo = 'palavra-nova' | 'trazer-anki' | 'exportar' | 'revisar-dificeis' | 'revisar-hoje';
export type TelaDeCartoes = 'hoje' | 'palavras' | 'memoria';

export type AlvoDaBusca =
  | { tipo: 'palavra'; id: string }
  | { tipo: 'acao'; acao: AcaoDeEstudo }
  | { tipo: 'baralho'; fonte: { tipo: 'sessao' | 'anki'; id: string; nome: string } | { tipo: 'trilha' } }
  | { tipo: 'tela'; aba: TelaDeCartoes };

export type GrupoDaBusca = 'Palavras' | 'Ações de estudo' | 'Baralhos' | 'Telas de Cartões';

export interface ItemDeBusca {
  id: string;
  grupo: GrupoDaBusca;
  label: string;
  hint?: string;
  /** Palavras que também casam (sinônimos), em texto corrido. */
  keywords?: string;
  alvo: AlvoDaBusca;
}

const ACOES: ReadonlyArray<[AcaoDeEstudo, string, string]> = [
  ['revisar-hoje', 'Revisar o que vence hoje', 'revisão cartões vencidas estudar'],
  ['revisar-dificeis', 'Revisar as palavras difíceis', 'difíceis sanguessugas erradas'],
  ['palavra-nova', 'Adicionar uma palavra', 'nova criar cartão'],
  ['trazer-anki', 'Trazer um baralho do Anki', 'importar apkg anki'],
  ['exportar', 'Exportar palavras', 'baixar csv apkg levar'],
];

const TELAS: ReadonlyArray<[TelaDeCartoes, string, string]> = [
  ['hoje', 'Cartões · Hoje', 'início revisão'],
  ['palavras', 'Cartões · Palavras', 'lista vocabulário catálogo'],
  ['memoria', 'Cartões · Memória', 'retenção estatísticas calendário previsão'],
];

/** Sem acento, sem caixa e sem espaço sobrando: a forma em que a busca compara. */
export function paraComparar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export interface EntradaDaBusca {
  /** Os cartões no baralho; os suspensos ficam de fora (arquivar foi uma decisão da pessoa). */
  cartoes: ReadonlyArray<{ id: string; word: string; translation?: string; inDeck?: boolean }>;
  /** As contagens do catálogo de conteúdo; `null` enquanto não chegaram. */
  conteudo: ContagensDeConteudo | null;
  /** O texto de cada rótulo já traduzido (`t`); sem ele, o texto-fonte. */
  traduzir?: (texto: string) => string;
}

export function itensDaBuscaAmpliada({ cartoes, conteudo, traduzir = (s) => s }: EntradaDaBusca): ItemDeBusca[] {
  const itens: ItemDeBusca[] = [];
  for (const [aba, label, keywords] of TELAS)
    itens.push({
      id: `tela:${aba}`,
      grupo: 'Telas de Cartões',
      label: traduzir(label),
      keywords,
      alvo: { tipo: 'tela', aba },
    });
  for (const [acao, label, keywords] of ACOES)
    itens.push({
      id: `acao:${acao}`,
      grupo: 'Ações de estudo',
      label: traduzir(label),
      keywords,
      alvo: { tipo: 'acao', acao },
    });
  if (conteudo) {
    for (const s of conteudo.sessoes)
      itens.push({
        id: `baralho:sessao:${s.id}`,
        grupo: 'Baralhos',
        label: s.nome || traduzir('Sessão'),
        hint: `${s.palavras}`,
        keywords: 'sessão gravação',
        alvo: { tipo: 'baralho', fonte: { tipo: 'sessao', id: s.id, nome: s.nome } },
      });
    for (const b of conteudo.anki)
      itens.push({
        id: `baralho:anki:${b.id}`,
        grupo: 'Baralhos',
        label: b.nome || traduzir('Baralho do Anki'),
        hint: `${b.palavras}`,
        keywords: 'anki baralho',
        alvo: { tipo: 'baralho', fonte: { tipo: 'anki', id: b.id, nome: b.nome } },
      });
    if (conteudo.trilha)
      itens.push({
        id: 'baralho:trilha',
        grupo: 'Baralhos',
        label: traduzir('Trilha de vocabulário'),
        hint: `${conteudo.trilha.palavras}`,
        keywords: 'trilha níveis',
        alvo: { tipo: 'baralho', fonte: { tipo: 'trilha' } },
      });
  }
  for (const c of cartoes)
    if (c.inDeck !== false)
      itens.push({
        id: `palavra:${c.id}`,
        grupo: 'Palavras',
        label: c.word,
        hint: c.translation || undefined,
        alvo: { tipo: 'palavra', id: c.id },
      });
  return itens;
}

/**
 * Os itens que casam com a consulta, melhores primeiro: rótulo que COMEÇA com ela, depois rótulo que a contém, depois
 * dica ou sinônimo. Consulta vazia: nada (a busca global mostra as sugestões). Empate: a ordem em que chegaram.
 */
export function buscarItens(itens: readonly ItemDeBusca[], consulta: string, limite = 30): ItemDeBusca[] {
  const q = paraComparar(consulta);
  if (!q) return [];
  const pontuados: Array<[number, number, ItemDeBusca]> = [];
  itens.forEach((item, i) => {
    const rotulo = paraComparar(item.label);
    let ponto = 0;
    if (rotulo === q) ponto = 4;
    else if (rotulo.startsWith(q)) ponto = 3;
    else if (rotulo.includes(q)) ponto = 2;
    else if (paraComparar(`${item.hint ?? ''} ${item.keywords ?? ''}`).includes(q)) ponto = 1;
    if (ponto) pontuados.push([ponto, i, item]);
  });
  return pontuados
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, limite)
    .map((p) => p[2]);
}
