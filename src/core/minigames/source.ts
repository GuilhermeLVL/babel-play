import type { VocabCard } from '../../types';
import type { CefrLevel } from '../learning/contract';
import { triarCartoes, baseLangDe, pistasDaTriagem, type Triagem } from '../learning/quality';

/**
 * DE ONDE VÊM OS ITENS DESTA RODADA.
 *
 * ESTA PEÇA NÃO EXISTIA, e a falta dela era a causa comum de cinco defeitos diferentes: a tela
 * pegava o baralho INTEIRO (`fetchDeck()`, sem filtro nenhum) e "a sessão mais recente com áudio"
 * (escolha fixa no código). Daí saíam rodadas com inglês e português misturados, sem jeito de
 * jogar o conteúdo de uma sessão específica, e sem lugar onde encaixar uma trilha curada.
 *
 * Com a fonte declarada, existe UM lugar que decide idioma, qualidade e origem. As telas passam a
 * dizer o que querem, não como filtrar — e é isso que impede o filtro de divergir entre telas,
 * como já aconteceu neste projeto com o par de idiomas (ver o cabeçalho de `lib/langConfig.ts`).
 *
 * O EFEITO COLATERAL MAIS IMPORTANTE é no duelo: `distractorsFor` tira as alternativas erradas da
 * própria rodada. Num baralho misto, a pergunta em inglês vinha com distratores em português —
 * ou seja, o IDIOMA denunciava a resposta certa. Com a rodada num idioma só, o distrator volta a
 * ser distrator.
 */

export type FonteId = 'baralho' | 'sessao' | 'trilha';

export interface FonteDeItens {
  id: FonteId;
  /** Idioma que se pratica (base ISO-639-1: 'en', 'pt'). Vazio = sem filtro (compatibilidade). */
  lang: string;
  /** Só para `sessao`: de qual gravação vêm as palavras e as falas. */
  sessionId?: string;
  /** Só para `trilha`: até que nível do vocabulário curado. */
  nivel?: CefrLevel;
}

export const FONTE_PADRAO: FonteDeItens = { id: 'baralho', lang: '' };

/**
 * O id sintético com que a trilha ESCREVE — e só isso.
 *
 * ATENÇÃO, porque isto já custou caro: `trilha:en` **não sobrevive no banco**. `bulkAdd` sanea
 * `session_id` contra as sessões reais do dono (`dosDono.has(...)`), e um id sintético não está
 * lá — a coluna vira NULL, indistinguível de um cartão manual. A procedência sobrevive em
 * `vocab_occurrences.origin_kind = 'trilha'`, que `origemDe()` grava decompondo este prefixo.
 *
 * Portanto: use esta função para ENVIAR, nunca para FILTRAR. Quem filtra é o campo `daTrilha` do
 * cartão, que vem daquela tabela. O filtro `sourceSessionId === SESSAO_DA_TRILHA(...)` que existia
 * aqui nunca casou uma linha sequer, e por causa dele a trilha não enxergava as palavras que a
 * pessoa já tinha errado.
 */
export const SESSAO_DA_TRILHA = (lang: string) => `trilha:${(lang || 'en').split('-')[0].toLowerCase()}`;

/** Rótulo da fonte para a tela — em UM lugar, para as telas não inventarem cada uma o seu. */
export function rotuloDaFonte(fonte: FonteDeItens, nomeDaSessao?: string): string {
  if (fonte.id === 'sessao') return nomeDaSessao ? `Sessão: ${nomeDaSessao}` : 'Esta sessão';
  if (fonte.id === 'trilha') return fonte.nivel ? `Trilha ${fonte.nivel}` : 'Trilha';
  return 'Minhas palavras';
}

/**
 * Aplica a fonte a um baralho: recorta pela origem e devolve a triagem completa.
 *
 * Devolve a TRIAGEM inteira (usáveis + defeituosos + de outro idioma), e não só os usáveis, porque
 * a tela precisa dos três números para ser honesta: "38 prontas, 12 com problema, 260 em outro
 * idioma" explica um contador baixo; "38 prontas" sozinho parece bug.
 */
export function cartoesDaFonte(cards: VocabCard[], fonte: FonteDeItens): Triagem {
  const todos = cards ?? [];

  /**
   * A ESCOLHA É EXCLUSIVA: gravações OU trilha, sem interseção.
   *
   * Antes, `baralho` devolvia o acervo inteiro — incluindo as palavras importadas da trilha. As
   * duas "fontes" não eram alternativas: uma continha a outra, e oferecer a escolha era mentir no
   * primeiro clique. Agora `daTrilha` particiona o baralho, e todo cartão tem exatamente uma casa.
   */
  const doEscopo =
    fonte.id === 'sessao'
      // Sem `sessionId` a resposta é VAZIO, não "o baralho inteiro". O fallback silencioso que
      // existia aqui entregava tudo quando a gravação não tinha sido escolhida ainda.
      ? (fonte.sessionId ? todos.filter(c => c.sourceSessionId === fonte.sessionId) : [])
      : fonte.id === 'trilha'
        ? todos.filter(c => c.daTrilha && doNivel(c, fonte.nivel))
        : todos.filter(c => !c.daTrilha);

  return triarCartoes(doEscopo, { lang: fonte.lang });
}

/**
 * O cartão é do nível escolhido?
 *
 * ISTO NÃO EXISTIA, e o comentário aqui prometia que sim: "a trilha joga só o que veio dela, e só
 * até o nível escolhido". O filtro era só por origem, então escolher A2 mudava apenas qual lote
 * seria baixado — a rodada continuava sorteando tudo que a trilha já tinha, de qualquer nível.
 * Uma trilha graduada que não gradua é pior que trilha nenhuma: promete um degrau e entrega o
 * monte.
 *
 * SEM NÍVEL DECLARADO, O CARTÃO ENTRA. Os primeiros lotes da trilha foram gravados antes de o
 * cliente mandar `cefrLevel`, e recusá-los agora esvaziaria a rodada de quem já usa a trilha —
 * castigo por um erro nosso. Eles aparecem em todo nível até serem corrigidos.
 */
function doNivel(card: VocabCard, nivel?: string): boolean {
  if (!nivel) return true;
  return !card.cefrLevel || card.cefrLevel === nivel;
}

/**
 * Os idiomas que o baralho realmente tem MATERIAL PARA JOGAR, do mais farto para o menos.
 *
 * O docblock sempre prometeu "só idiomas com pelo menos um cartão APROVADO" — e a implementação
 * nunca chamou a régua: contava cartão bruto. Pior, a função inteira era **código morto**: o lobby
 * montava um `LangPicker` com os 32 idiomas do app, então dava para escolher um idioma com zero
 * palavras jogáveis e receber uma tela vazia sem nenhuma explicação.
 *
 * Agora ela cumpre o que promete, e é o que alimenta a sala de escolha:
 *  - `jogaveis` = passou na triagem E tem tradução (os oito jogos de par precisam dela);
 *  - `total` = existe no idioma, jogável ou não.
 *
 * Os dois números juntos são o que permite a sala dizer "inglês 621" em vez de "inglês 1.151" e
 * ainda assim explicar a diferença quando alguém perguntar.
 */
export function idiomasDisponiveis(cards: VocabCard[]): Array<{ lang: string; total: number; jogaveis: number }> {
  const porIdioma = new Map<string, VocabCard[]>();
  for (const c of cards ?? []) {
    const l = baseLangDe(c.srcLang);
    if (!l) continue;
    const lista = porIdioma.get(l);
    if (lista) lista.push(c); else porIdioma.set(l, [c]);
  }

  return [...porIdioma.entries()]
    .map(([lang, doIdioma]) => {
      const t = triarCartoes(doIdioma, { lang });
      return { lang, total: doIdioma.length, jogaveis: pistasDaTriagem(t).comTraducao.length };
    })
    // Ordena pelo que se pode JOGAR, não pelo que se tem guardado — é a pergunta da sala.
    .sort((a, b) => b.jogaveis - a.jogaveis || b.total - a.total);
}

/**
 * ADAPTADOR ENTRE O VOCABULÁRIO DA TELA E O DO CORE.
 *
 * A pessoa escolhe entre duas coisas — "minhas gravações" ou "a trilha" —, e as gravações têm uma
 * sub-escolha (todas ou uma). O core fala `FonteId` com TRÊS valores, e esse tipo não pode mudar:
 * `origemAtual` é gravado em `exercise_results` a partir dele, e renomeá-lo orfanaria o histórico
 * inteiro de partidas.
 *
 * Este par de funções é a tradução, testada nos dois sentidos. A tela fala o idioma de quem usa; o
 * core continua falando o dele.
 */
export type OrigemDaPratica = 'gravacoes' | 'trilha';
export type EscopoDeGravacoes = 'todas' | 'uma';

export interface EscolhaDaPratica {
  origem: OrigemDaPratica;
  /** Só significa algo quando `origem === 'gravacoes'`. */
  escopo: EscopoDeGravacoes;
  lang: string;
  sessionId?: string;
  nivel?: CefrLevel;
}

export function fonteDaEscolha(e: EscolhaDaPratica): FonteDeItens {
  if (e.origem === 'trilha') return { id: 'trilha', lang: e.lang, nivel: e.nivel };
  // "uma gravação" sem gravação escolhida ainda é "todas" — melhor que uma fonte vazia por engano.
  if (e.escopo === 'uma' && e.sessionId) return { id: 'sessao', lang: e.lang, sessionId: e.sessionId };
  return { id: 'baralho', lang: e.lang };
}

/**
 * DUAS FONTES DESCREVEM O MESMO RECORTE?
 *
 * Existe por causa do custo de um objeto novo. `FonteDeItens` é dependência de `useMemo` na tela
 * Jogar, e a comparação do React é por IDENTIDADE: `{ id: 'baralho', lang: 'en' }` recriado com os
 * mesmos valores é, para ele, uma fonte OUTRA — e refazer a triagem do baralho inteiro, o pedido
 * de composição e o gate dos nove jogos.
 *
 * MEDIDO no arranque do /jogar: a restauração da fonte guardada (`lerFonteGuardada`) roda quando a
 * lista de gravações chega e, no caso comum, restaura exatamente a fonte que já estava lá. O
 * `setFonte` fabricava um objeto novo mesmo assim, e o pipeline inteiro rodava de novo por nada.
 *
 * Comparar campo a campo (e não `JSON.stringify`) porque a ordem das chaves não é contrato e
 * `undefined` não sobrevive à serialização — `{ id, lang }` e `{ id, lang, nivel: undefined }`
 * descrevem o mesmo recorte e precisam ser iguais aqui.
 */
export function mesmaFonte(a: FonteDeItens, b: FonteDeItens): boolean {
  return a.id === b.id
    && a.lang === b.lang
    && (a.sessionId ?? '') === (b.sessionId ?? '')
    && (a.nivel ?? '') === (b.nivel ?? '');
}

export function escolhaDaFonte(f: FonteDeItens): EscolhaDaPratica {
  if (f.id === 'trilha') return { origem: 'trilha', escopo: 'todas', lang: f.lang, nivel: f.nivel };
  if (f.id === 'sessao') return { origem: 'gravacoes', escopo: 'uma', lang: f.lang, sessionId: f.sessionId };
  return { origem: 'gravacoes', escopo: 'todas', lang: f.lang };
}

/**
 * PÕE O TRECHO ESCOLHIDO NA FRENTE da fila, sem tirar o resto.
 *
 * Quem pede "praticar ISTO" no menu de contexto ou no painel de vocabulário espera COMEÇAR por
 * aquilo. Montar a rodada só com aquele item seria pior: os jogos têm mínimo de itens
 * (`MINIGAMES[x].minItems`) e a rodada simplesmente não abriria — o atalho viraria um clique que
 * não faz nada, que é justamente o defeito que a remoção dos exercícios legados veio tirar.
 *
 * MORA NO CORE, e não dentro da tela, porque é a regra que sustenta cinco portas de entrada
 * (Análise, Captura, Métricas, Leitura e o menu de contexto). Dentro do componente ela não tinha
 * como ser testada, e é exatamente o tipo de lógica em que um engano passa despercebido: a
 * rodada abre do mesmo jeito, só começando pelo item errado.
 *
 * Não achando o trecho, devolve a lista INTACTA — a rodada acontece, só sem privilégio. Melhor do
 * que recusar a partida porque a frase escolhida não sobreviveu à régua de qualidade.
 */
export function priorizar<T>(lista: T[], alvo: string | undefined, texto: (x: T) => string): T[] {
  const chave = (alvo ?? '').trim().toLowerCase();
  if (!chave) return lista;
  const i = (lista ?? []).findIndex(x => (texto(x) ?? '').trim().toLowerCase().includes(chave));
  return i <= 0 ? lista : [lista[i], ...lista.slice(0, i), ...lista.slice(i + 1)];
}

/* ═══════════════════════════════════════════════════════════════════════════
   QUAIS FONTES A TELA PODE OFERECER

   O lobby de jogos é montado em dois lugares: a tela Jogar e a aba "Jogos" de uma sessão
   (`embutido`). `Play.tsx` já escondia o cabeçalho e a barra de progresso no modo embutido —
   mas NÃO a faixa "De onde vêm as palavras", que continuava oferecendo "Minhas palavras",
   "Trilha" e um seletor de outra gravação.

   Ou seja: dentro de uma tela que anuncia uma gravação específica, havia três controles para
   sair silenciosamente dela. O usuário trocava o escopo sem perceber que trocou, e o cabeçalho
   continuava dizendo o nome da sessão.

   A decisão vira função pura por dois motivos: fica testável sem renderizar um componente de
   105 KB, e passa a existir UM lugar onde a regra mora.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ContextoDeFonte {
  /** `true` quando o lobby está dentro da aba "Jogos" de uma sessão. */
  embutido: boolean
  /** Há uma gravação em contexto? */
  temSessao: boolean
  /** O idioma escolhido tem lista curada? */
  temTrilha: boolean
  /** Quantas gravações existem para escolher. */
  sessoesDisponiveis?: number
}

/**
 * As fontes que a tela pode oferecer, na ordem em que aparecem.
 *
 * Embutido → SOMENTE `sessao`. Trocar de escopo passa a ser uma mudança de lugar (ir à tela
 * Jogar), não um controle escondido num contexto que promete outra coisa.
 */
export function fontesDisponiveis(ctx: ContextoDeFonte): FonteId[] {
  if (ctx.embutido) return ['sessao']
  const fontes: FonteId[] = ['baralho']
  // Botão que não faz nada é pior que ausente — as duas só entram quando existem de fato.
  if (ctx.temSessao) fontes.push('sessao')
  if (ctx.temTrilha) fontes.push('trilha')
  return fontes
}

/**
 * Se o seletor de "outra gravação" pode aparecer.
 *
 * Embutido nunca: trocar a gravação é trocar o escopo da tela inteira, e é exatamente a saída
 * silenciosa que esta regra fecha.
 */
export function podeTrocarDeGravacao(ctx: { embutido: boolean; sessoesDisponiveis: number }): boolean {
  if (ctx.embutido) return false
  return ctx.sessoesDisponiveis > 1
}
