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
import { nivelNecessario, liberadoTudo } from './desbloqueios';
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
  if (nivel >= item.nivel || possuidos().has(item.id)) return { estado: 'equipavel' };
  if (item.precoSeeds !== undefined && saldoSeeds >= item.precoSeeds) return { estado: 'compravel' };
  if (item.precoSeeds !== undefined) return { estado: 'bloqueado', motivo: `Nível ${item.nivel} ou ${item.precoSeeds} Seeds` };
  return { estado: 'bloqueado', motivo: `Nível ${item.nivel}` };
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
  if (possuido) return 'seeds';
  return 'nivel';
}

/** Consistência com o catálogo de níveis do `desbloqueios` (teste trava). */
export function nivelCoerente(item: ItemDaLoja): boolean {
  if (item.exclusivoDe) return true; // exclusivos não têm nível: só a conquista abre
  if (item.tipo !== 'tema' && item.tipo !== 'fonte' && item.tipo !== 'posicao' && item.tipo !== 'estudio') return true; // vivem só na loja
  return nivelNecessario(item.tipo, item.alvo) === item.nivel;
}
