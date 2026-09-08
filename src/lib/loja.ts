/**
 * A LOJA — catálogo único de tudo que se desbloqueia no app.
 *
 * Inspiração declarada (pedido do dono, 2026-08-27): lojas de jogos (Fortnite/Roblox) — itens com
 * RARIDADE, vitrine com prévia, e duas moedas de progresso:
 *   · NÍVEL: itens que destravam sozinhos ao subir de nível (deriveProgress);
 *   · SEEDS: a moeda ganha jogando (1/palavra capturada, 4/revisão certa) compra o ATALHO —
 *     quem quer o tema antes do nível paga com o que ganhou estudando.
 *
 * A POSSE é local (localStorage) e a COBRANÇA usa o `gastarSeeds` idempotente do servidor
 * (spendId = 'loja-<id>': comprar duas vezes não cobra duas vezes). Equipar delega aos módulos
 * que já mandam na aparência (persistTheme/setParticulas) — a loja não inventa um segundo dono.
 */
import { liberadoTudo } from './liberacaoDev';
import type { TipoDesbloqueavel } from '@core';
import { conquistasDesbloqueadas } from './conquistasPosse';
import { CONQUISTAS, CATALOGO_DA_LOJA, type ItemDaLoja, type Raridade } from '@core';

/* O catálogo e os tipos mudaram para `src/core/loja.ts` para que o SERVIDOR possa lê-los (ver o
   cabeçalho de lá). Reexportados daqui porque 30+ telas importam `from '../lib/loja'` e trocar o
   caminho em todas seria ruído sem ganho — o dono do dado é o core, o endereço continua o mesmo. */
export { CATALOGO_DA_LOJA };
export type { ItemDaLoja, Raridade, TipoDaLoja } from '@core';



const CHAVE_POSSE = 'babel.loja_possuidos';

export function possuidos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_POSSE) || '[]') as string[]); } catch { return new Set(); }
}

export function marcarPosse(id: string): void {
  try {
    const p = possuidos();
    p.add(id);
    localStorage.setItem(CHAVE_POSSE, JSON.stringify([...p]));
  } catch { /* sem storage */ }
}

/**
 * B4 FECHADA (economia-de-creditos 1.2): o SERVIDOR vira a fonte da posse.
 *
 * A compra sempre foi evento idempotente no servidor (`gastarSeeds`, reason `loja:<id>`) — o
 * furo era o caminho de volta: só o localStorage lembrava o que foi comprado, então trocar de
 * navegador "perdia" a compra e editar o DevTools "ganhava" uma. O perfil agora traz
 * `itensComprados` derivado do log, e este UNION hidrata o espelho local a cada carga.
 *
 * UNION, não substituição: uma compra feita offline (o débito ainda na fila) sumiria do espelho
 * se a lista do servidor o sobrescrevesse — o localStorage segue valendo como cache otimista, e
 * o servidor é quem garante que nada comprado se perde.
 */
/**
 * A POSSE VINDA DO SERVIDOR.
 *
 * COM CONTA, ELA SUBSTITUI o espelho local. Até 01/09 a hidratação era UNIÃO — o servidor só
 * ACRESCENTAVA — e o argumento era preservar a compra feita offline. O efeito colateral era que
 * um id injetado à mão em `localStorage` nunca saía: recarregar não limpava, trocar de aparelho
 * não limpava, e o app tratava como seu um item que ninguém comprou. Com o servidor passando a
 * ser a autoridade sobre o gasto (`servidor-e-autoridade`), manter a união seria fechar a porta
 * da frente e deixar a dos fundos aberta.
 *
 * SEM CONTA continua união, porque ali o espelho local É a única fonte — não existe servidor com
 * quem concordar, e apagar seria apagar a compra da pessoa.
 *
 * A compra offline com conta continua protegida por outro caminho: ela vive até a próxima
 * sincronização bem-sucedida, e a sincronização só acontece com resposta do servidor em mãos.
 */
export function hidratarPosse(doServidor: readonly string[] | undefined, autoritativo = false): void {
  if (!doServidor) return;
  try {
    if (autoritativo) {
      localStorage.setItem(CHAVE_POSSE, JSON.stringify([...new Set(doServidor)]));
      return;
    }
    if (!doServidor.length) return;
    const p = possuidos();
    const antes = p.size;
    for (const id of doServidor) p.add(id);
    if (p.size !== antes) localStorage.setItem(CHAVE_POSSE, JSON.stringify([...p]));
  } catch { /* sem storage: estadoDoItem cai no nível, e a posse volta na próxima carga */ }
}

/**
 * A POSSE DO QUE SE PAGOU COM DINHEIRO — espelho de leitura, nunca fonte.
 *
 * Nada comprado com dinheiro pode viver em `localStorage` (spec economia-de-creditos): o servidor
 * deriva do log (`credit_spends.reason LIKE 'premium:%'`) e o cliente só guarda a resposta para a
 * tela não ficar cega entre um carregamento e outro. Por isso ela é SEMPRE substituída, sem o
 * ramo de união que a posse de Seeds tem — não existe compra premium offline.
 */
const CHAVE_PREMIUM = 'babel.premium_possuidos';

export function premiumPossuidos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_PREMIUM) || '[]') as string[]); } catch { return new Set(); }
}

export function hidratarPremium(doServidor: readonly string[] | undefined): void {
  if (!doServidor) return;
  try { localStorage.setItem(CHAVE_PREMIUM, JSON.stringify([...new Set(doServidor)])); } catch { /* sem storage */ }
}

export type EstadoDoItem = 'equipavel' | 'compravel' | 'bloqueado';

/** Um item está disponível se: liberou tudo, OU nível alcançado, OU comprado com Seeds. */
export function estadoDoItem(item: ItemDaLoja, nivel: number, saldoSeeds: number): {
  estado: EstadoDoItem; motivo?: string;
} {
  if (liberadoTudo()) return { estado: 'equipavel' };
  // Exclusivo: nem nível nem Seeds abrem — só a conquista. O motivo diz QUAL.
  if (item.exclusivoDe) {
    if (conquistasDesbloqueadas().has(item.exclusivoDe)) return { estado: 'equipavel' };
    const c = CONQUISTAS.find((x) => x.id === item.exclusivoDe);
    return { estado: 'bloqueado', motivo: `Conquista: ${c?.nome ?? item.exclusivoDe}` };
  }
  /* PREMIUM: paga-se com Créditos ou vem no Passe. Nível e Seeds não abrem — como o exclusivo
     de conquista, é uma via só, e a tela tem de dizer QUAL. O saldo de Créditos é do servidor
     (`useCarteira`), então quem decide "compravel" aqui é a POSSE; a tela pede o resto. */
  if (item.precoCreditos !== undefined) {
    if (premiumPossuidos().has(item.id)) return { estado: 'equipavel' };
    return { estado: 'bloqueado', motivo: `${item.precoCreditos} Créditos ou o Passe` };
  }
  if (nivel >= item.nivel || possuidos().has(item.id)) return { estado: 'equipavel' };
  if (item.precoSeeds !== undefined && saldoSeeds >= item.precoSeeds) return { estado: 'compravel' };
  if (item.precoSeeds !== undefined) return { estado: 'bloqueado', motivo: `Nível ${item.nivel} ou ${item.precoSeeds} Seeds` };
  return { estado: 'bloqueado', motivo: `Nível ${item.nivel}` };
}

/**
 * A MESMA RÉGUA, ENDEREÇADA POR (tipo, alvo) — para quem não tem o item do catálogo em mãos.
 *
 * `desbloqueios.desbloqueado(nivel, tipo, id)` era uma SEGUNDA régua, com a sua própria tabela de
 * níveis, e as duas discordavam sobre o mesmo item (auditoria de 2026-09-07, achado A10): esta
 * conhece compra com Seeds, posse premium e exclusivo de conquista; aquela só conhecia nível.
 * Efeito prático medido no catálogo: quem comprasse o tema Linear (60 Seeds) no nível 1 via o item
 * como "seu" na Loja e continuava com o cadeado no seletor de aparência — pagou e não pôde usar.
 *
 * `escolhaAtual` preserva a regra 2 de `desbloqueios`: quem já está usando um item nunca é
 * expulso dele. O cadeado vale para TROCAR, nunca para rebaixar o que já está aplicado.
 */
export function estadoPorAlvo(
  tipo: ItemDaLoja['tipo'],
  alvo: string,
  nivel: number,
  saldoSeeds: number,
  escolhaAtual?: string,
): { estado: EstadoDoItem; motivo?: string } {
  if (escolhaAtual !== undefined && escolhaAtual === alvo) return { estado: 'equipavel' }
  const item = CATALOGO_DA_LOJA.find((i) => i.tipo === tipo && i.alvo === alvo)
  // Fora do catálogo = livre. É o comportamento antigo (`nivelNecessario` devolvia 1) e o certo:
  // item que ninguém vende nem premia não tem por que estar trancado.
  if (!item) return { estado: 'equipavel' }
  return estadoDoItem(item, nivel, saldoSeeds)
}

/** Itens que o nível N (próximo) vai liberar — a vitrine de "continue jogando". */
export function vitrineDoProximoNivel(nivelAtual: number): ItemDaLoja[] {
  const proximos = CATALOGO_DA_LOJA.filter((i) => !i.exclusivoDe && i.nivel > nivelAtual);
  const menorNivel = Math.min(...proximos.map((i) => i.nivel));
  return Number.isFinite(menorNivel) ? proximos.filter((i) => i.nivel === menorNivel) : [];
}

/**
 * RARIDADE — agora em TOKENS, não em hex cru.
 *
 * `#4C9AFF` e `#A66CFF` estavam escritos à mão aqui, e é o tipo de coisa que os primitivos de
 * `ui/` proíbem por teste ("um literal vira texto invisível em algum tema"). Como esta constante
 * mora em `lib/`, o teste não a alcançava — e as duas cores brigavam com os 7 temas × claro/escuro.
 */
export const COR_DA_RARIDADE: Record<Raridade, { borda: string; fundo: string; rotulo: string }> = {
  comum: { borda: 'border-border-subtle', fundo: 'bg-surface', rotulo: 'Comum' },
  raro: { borda: 'border-rare', fundo: 'bg-rare-soft', rotulo: 'Raro' },
  epico: { borda: 'border-epic', fundo: 'bg-epic-soft', rotulo: 'Épico' },
  lendario: { borda: 'border-warn', fundo: 'bg-warn/10', rotulo: 'Lendário' },
};

/**
 * A RÉGUA DAS QUATRO ORIGENS (mudança economia-legivel-e-moedas).
 *
 * O DEFEITO QUE ISTO CONSERTA. O app tem quatro maneiras de dar um item — nível, Seeds,
 * conquista e (agora) créditos — e NENHUMA delas tinha sinal visual. A cor do cartão respondia
 * "quão especial é?" (raridade) e ninguém respondia "como eu consigo?". Pior: depois de obtido,
 * a origem sumia de vez (`estadoDaColecao` jogava as três primeiras no mesmo balde), então a
 * coleção não contava mais a história de como foi montada. Era a maior fonte da sensação que o
 * dono relatou: "nada parece estar ligado".
 *
 * A partir daqui, ORIGEM é a pergunta que a COR responde, em qualquer tela; a raridade vira selo.
 */
export type OrigemDoItem = 'nivel' | 'seeds' | 'conquista' | 'creditos';

export const ORIGEM: Record<OrigemDoItem, { rotulo: string; comoSeGanha: string; borda: string; fundo: string; texto: string }> = {
  // Os três primeiros reusam tokens que JÁ significam isso no app (accent = progressão na barra
  // de XP, good = o verde das Seeds, warn = o dourado do troféu). O quarto é o token novo.
  nivel: { rotulo: 'Nível', comoSeGanha: 'chega estudando', borda: 'border-accent', fundo: 'bg-accent-soft', texto: 'text-accent-ink' },
  seeds: { rotulo: 'Seeds', comoSeGanha: 'compra com a moeda de estudo', borda: 'border-good', fundo: 'bg-good-soft', texto: 'text-good-ink' },
  conquista: { rotulo: 'Conquista', comoSeGanha: 'só fazendo — não se compra', borda: 'border-warn', fundo: 'bg-warn-soft', texto: 'text-warn-ink' },
  creditos: { rotulo: 'Créditos', comoSeGanha: 'Passe Premium e prateleira paga', borda: 'border-premium', fundo: 'bg-premium-soft', texto: 'text-premium-ink' },
};

/**
 * De onde vem um item — a resposta que a tela precisa dar.
 *
 * `possuido` distingue o que foi COMPRADO do que chegou pelo nível: os dois são "seus", e é
 * justamente essa diferença que a coleção perdia. Sem o contexto (quem só quer saber a natureza
 * do item), a resposta é a origem POSSÍVEL, não a efetiva.
 */
export function origemDoItem(item: ItemDaLoja, possuido = false): OrigemDoItem {
  if (item.exclusivoDe) return 'conquista';
  /* `ORIGEM.creditos` existia com o rótulo "Passe Premium e prateleira paga" e esta função nunca
     o devolvia — a quarta origem da régua era um rótulo sem dono. Agora tem. */
  if (item.precoCreditos !== undefined) return 'creditos';
  if (possuido) return 'seeds';
  return 'nivel';
}

/**
 * A ROTA DE OBTENÇÃO — "como eu consigo isto?", em frase inteira e com um destino.
 *
 * `estadoDoItem` responde SE dá para usar, e o `motivo` dele é um resumo de cadeado ("Nível 5 ou
 * 140 Seeds"). Isso serve para a etiqueta na grade e não serve para a tela do item, que precisa
 * dizer o que a pessoa tem de FAZER e para onde ir fazer.
 *
 * POR QUE MORA AQUI, e não na tela. A versão que veio da branch de gamificação escrevia estes
 * quatro caminhos à mão dentro do Inventário, e as duas réguas discordavam em dois pontos
 * mensuráveis:
 *   · a conquista aparecia pelo ID (`foco_impecavel`), enquanto `estadoDoItem:113` já resolve o
 *     nome em `CONQUISTAS` — a tela mostrava a chave do banco para o usuário;
 *   · o item com nível E preço dizia só "Custa N Seeds", enquanto o cadeado do mesmo item dizia
 *     "Nível 5 ou 140 Seeds" — a rota escondia o caminho de graça.
 * Aqui a ORDEM DOS RAMOS é literalmente a de `estadoDoItem` (exclusivo → créditos → nível/Seeds),
 * e `tests/contratos/rota-de-obtencao.test.ts` trava as duas juntas: se alguém acrescentar um
 * quinto canal ao cadeado sem acrescentar a rota, o teste cai.
 *
 * A COR SAI DE `ORIGEM`, nunca de literal: é a régua que declara que "ORIGEM é a pergunta que a
 * COR responde, em qualquer tela".
 */
export type DestinoDeObtencao = 'conquistas' | 'loja' | 'passe';

export interface RotaDeObtencao {
  origem: OrigemDoItem;
  /** O canal, em três palavras — o título do cartão. */
  titulo: string;
  /** O que a pessoa tem de fazer, em frase inteira. */
  texto: string;
  destino: DestinoDeObtencao;
  rotuloDoBotao: string;
}

export function rotaDeObtencao(item: ItemDaLoja, saldoSeeds = 0): RotaDeObtencao {
  if (item.exclusivoDe) {
    const c = CONQUISTAS.find((x) => x.id === item.exclusivoDe);
    return {
      origem: 'conquista',
      titulo: 'Só por conquista',
      texto: `Recompensa da conquista "${c?.nome ?? item.exclusivoDe}". Não entra na Loja nem no Passe: só fazendo.`,
      destino: 'conquistas',
      rotuloDoBotao: 'Ver em Conquistas',
    };
  }
  if (item.precoCreditos !== undefined) {
    /* O item do Passe premium tem as DUAS portas — a casa da trilha e a prateleira avulsa — e
       dizer só uma delas é esconder metade do preço. */
    const naTrilha = item.exclusivoDoPasse !== undefined
      ? ` Vem de graça na casa ${item.exclusivoDoPasse} do Passe, para quem tem o Passe Premium.`
      : '';
    return {
      origem: 'creditos',
      titulo: 'Prateleira paga',
      texto: `Custa ${item.precoCreditos} Créditos na Loja.${naTrilha}`,
      destino: item.exclusivoDoPasse !== undefined ? 'passe' : 'loja',
      rotuloDoBotao: item.exclusivoDoPasse !== undefined ? 'Ver no Passe' : 'Ver na Loja',
    };
  }
  if (item.precoSeeds !== undefined) {
    const falta = item.precoSeeds - saldoSeeds;
    const bolso = falta <= 0
      ? `Você já tem as ${item.precoSeeds} Seeds.`
      : `Faltam ${falta} Seeds para o atalho.`;
    return {
      origem: 'seeds',
      titulo: 'Nível ou atalho',
      texto: `Chega de graça no nível ${item.nivel}, ou agora por ${item.precoSeeds} Seeds. ${bolso}`,
      destino: 'loja',
      rotuloDoBotao: 'Ver na Loja',
    };
  }
  return {
    origem: 'nivel',
    titulo: 'Recompensa de estudo',
    texto: `Chega sozinho ao alcançar o nível ${item.nivel} — não se compra, e o Passe mostra em que casa ele cai.`,
    destino: 'passe',
    rotuloDoBotao: 'Ver no Passe',
  };
}

/**
 * Nível necessário para usar um item (1 = livre desde o início).
 *
 * MORA AQUI desde 08/09, e não em `desbloqueios.ts`: o dado que ela lê é o CATÁLOGO, que é deste
 * arquivo. Enquanto ela morava lá, `desbloqueios` importava o catálogo daqui e este arquivo
 * importava a função de lá — um ciclo de importação que só funcionava pela ordem em que o bundler
 * resolvia avaliar os dois.
 */
export function nivelNecessario(tipo: TipoDesbloqueavel, id: string): number {
  return CATALOGO_DA_LOJA.find((i) => i.tipo === tipo && i.alvo === id)?.nivel ?? 1;
}

/** Consistência entre o nível declarado no item e o que `nivelNecessario` responde (teste trava). */
export function nivelCoerente(item: ItemDaLoja): boolean {
  if (item.exclusivoDe) return true; // exclusivos não têm nível: só a conquista abre
  if (item.tipo !== 'tema' && item.tipo !== 'fonte' && item.tipo !== 'posicao' && item.tipo !== 'estudio') return true; // vivem só na loja
  return nivelNecessario(item.tipo, item.alvo) === item.nivel;
}
