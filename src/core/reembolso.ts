/**
 * O CORTE DO CATÁLOGO E O REEMBOLSO (recompensas v2, Task 2.3 — spec 5.1).
 *
 * Saíram os cursores e os packs de emoji, as categorias de emoji e o editor de pack da galeria,
 * o "cursor de qualquer emoji", os aprimoramentos (tamanho de partícula, sorte), a partícula
 * "Chuva de Emojis" e os rastros além de um por forma. Fontes e posição do menu saíram do
 * catálogo para virar opção livre ("Acessibilidade e layout"). Nada disso aparecia onde se estuda.
 *
 * O QUE ACONTECE COM QUEM TINHA:
 *
 *  · GASTO EM SEEDS VOLTA, uma vez. Para cada gasto `loja:<id>` / `croma:<id>:<matiz>` de item
 *    removido e cada `aprimoramento:*`, o servidor credita `reembolso:<reason do gasto>` com o
 *    mesmo valor. A idempotência é a do razão: o índice único (usuário, `credito_id`) de
 *    `seed_credits` faz dois pedidos simultâneos gravarem uma linha só.
 *  · PAGO COM CRÉDITOS NÃO SE PERDE. O item premium removido vira o equivalente do catálogo novo
 *    (`equivalenteDe`) na posse derivada — até a onda 4 trazer os itens novos, o tema Aurora.
 *  · EQUIPADO CAI NO PADRÃO, sem erro: o que lê a escolha salva (`readRastro`, `readParticulas`)
 *    ignora valor que não existe mais (rastro/partícula de emoji); cursor e pack não são mais lidos.
 *    Os rastros `gen:`/`croma:` que saíram da Loja seguem válidos: são combinações da galeria.
 *
 * Regra deste arquivo: TS puro (roda no Node e no navegador), como `economiaAutoridade`.
 */

/** O que saiu, com o tipo e o `alvo` que o módulo de aparência gravava — para reconhecer o que
 *  estava equipado. Tabela fixa: o catálogo não tem mais estes itens para ser consultado. */
export const ITENS_REMOVIDOS_DO_CATALOGO: ReadonlyMap<string, { tipo: string; alvo: string }> = new Map([
  // cursor (27)
  ['cur-borboleta', { tipo: 'cursor', alvo: 'borboleta' }],
  ['cur-cafe', { tipo: 'cursor', alvo: 'cafe' }],
  ['cur-coroa', { tipo: 'cursor', alvo: 'coroa' }],
  ['cur-coruja', { tipo: 'cursor', alvo: 'coruja' }],
  ['cur-cristal', { tipo: 'cursor', alvo: 'cristal' }],
  ['cur-dragao', { tipo: 'cursor', alvo: 'dragao' }],
  ['cur-espada', { tipo: 'cursor', alvo: 'espada' }],
  ['cur-fogo', { tipo: 'cursor', alvo: 'fogo' }],
  ['cur-foguete', { tipo: 'cursor', alvo: 'foguete' }],
  ['cur-golfinho', { tipo: 'cursor', alvo: 'golfinho' }],
  ['cur-invader', { tipo: 'cursor', alvo: 'invader' }],
  ['cur-katana', { tipo: 'cursor', alvo: 'katana' }],
  ['cur-lanterna', { tipo: 'cursor', alvo: 'lanterna' }],
  ['cur-mira', { tipo: 'cursor', alvo: 'mira' }],
  ['cur-padrao', { tipo: 'cursor', alvo: 'padrao' }],
  ['cur-pata', { tipo: 'cursor', alvo: 'pata' }],
  ['cur-pato', { tipo: 'cursor', alvo: 'pato' }],
  ['cur-pizza', { tipo: 'cursor', alvo: 'pizza' }],
  ['cur-raio', { tipo: 'cursor', alvo: 'raio' }],
  ['cur-robot', { tipo: 'cursor', alvo: 'robot' }],
  ['cur-tinteiro', { tipo: 'cursor', alvo: 'tinteiro' }],
  ['cur-trevo', { tipo: 'cursor', alvo: 'trevo' }],
  ['cur-tridente', { tipo: 'cursor', alvo: 'tridente' }],
  ['cur-unicornio', { tipo: 'cursor', alvo: 'unicornio' }],
  ['cur-varinha', { tipo: 'cursor', alvo: 'varinha' }],
  ['dourada-3', { tipo: 'cursor', alvo: 'coroa' }],
  ['dourada-7', { tipo: 'cursor', alvo: 'tridente' }],
  // pack (33)
  ['dourada-5', { tipo: 'pack', alvo: 'tesouros' }],
  ['pack-alquimia', { tipo: 'pack', alvo: 'alquimia' }],
  ['pack-animais', { tipo: 'pack', alvo: 'animais' }],
  ['pack-anime', { tipo: 'pack', alvo: 'anime' }],
  ['pack-arrepio', { tipo: 'pack', alvo: 'arrepio' }],
  ['pack-astrologia', { tipo: 'pack', alvo: 'astrologia' }],
  ['pack-brasil', { tipo: 'pack', alvo: 'brasil' }],
  ['pack-cafe', { tipo: 'pack', alvo: 'cafe' }],
  ['pack-circo', { tipo: 'pack', alvo: 'circo' }],
  ['pack-classico', { tipo: 'pack', alvo: 'classico' }],
  ['pack-clima', { tipo: 'pack', alvo: 'clima' }],
  ['pack-comidas', { tipo: 'pack', alvo: 'comidas' }],
  ['pack-cyberpunk', { tipo: 'pack', alvo: 'cyberpunk' }],
  ['pack-doces', { tipo: 'pack', alvo: 'doces' }],
  ['pack-espaco', { tipo: 'pack', alvo: 'espaco' }],
  ['pack-esportes', { tipo: 'pack', alvo: 'esportes' }],
  ['pack-festa', { tipo: 'pack', alvo: 'festa' }],
  ['pack-fogo', { tipo: 'pack', alvo: 'fogo' }],
  ['pack-gala', { tipo: 'pack', alvo: 'gala' }],
  ['pack-gatos', { tipo: 'pack', alvo: 'gatos' }],
  ['pack-gelo', { tipo: 'pack', alvo: 'gelo' }],
  ['pack-jardim', { tipo: 'pack', alvo: 'jardim' }],
  ['pack-lendas', { tipo: 'pack', alvo: 'lendas' }],
  ['pack-medieval', { tipo: 'pack', alvo: 'medieval' }],
  ['pack-mineracao', { tipo: 'pack', alvo: 'mineracao' }],
  ['pack-musica', { tipo: 'pack', alvo: 'musica' }],
  ['pack-natureza', { tipo: 'pack', alvo: 'natureza' }],
  ['pack-noite', { tipo: 'pack', alvo: 'noite' }],
  ['pack-oceano', { tipo: 'pack', alvo: 'oceano' }],
  ['pack-pixel', { tipo: 'pack', alvo: 'pixel' }],
  ['pack-tesouros', { tipo: 'pack', alvo: 'tesouros' }],
  ['pack-viagem', { tipo: 'pack', alvo: 'viagem' }],
  ['pack-zen', { tipo: 'pack', alvo: 'zen' }],
  // aprimoramento (2)
  ['apr-particulas', { tipo: 'aprimoramento', alvo: 'particulas' }],
  ['apr-sorte', { tipo: 'aprimoramento', alvo: 'sorte' }],
  // particulas (1)
  ['part-emoji', { tipo: 'particulas', alvo: 'emoji' }],
  // galeria (10)
  ['gal-cat-bebidas', { tipo: 'galeria', alvo: 'cat:bebidas' }],
  ['gal-cat-espaco', { tipo: 'galeria', alvo: 'cat:espaco' }],
  ['gal-cat-esportes', { tipo: 'galeria', alvo: 'cat:esportes' }],
  ['gal-cat-festa', { tipo: 'galeria', alvo: 'cat:festa' }],
  ['gal-cat-musica', { tipo: 'galeria', alvo: 'cat:musica' }],
  ['gal-cat-objetos', { tipo: 'galeria', alvo: 'cat:objetos' }],
  ['gal-cat-patos', { tipo: 'galeria', alvo: 'cat:patos' }],
  ['gal-cat-transporte', { tipo: 'galeria', alvo: 'cat:transporte' }],
  ['gal-cursor-emoji', { tipo: 'galeria', alvo: 'cursor-emoji' }],
  ['gal-editor-pack', { tipo: 'galeria', alvo: 'editor-pack' }],
  // rastro (12)
  ['ras-ametista', { tipo: 'rastro', alvo: 'gen:estrelas:amethyst-night' }],
  ['ras-arcade', { tipo: 'rastro', alvo: 'gen:pixel:arcade' }],
  ['ras-chamas', { tipo: 'rastro', alvo: 'gen:faisca:halloween' }],
  ['ras-emoji', { tipo: 'rastro', alvo: 'emoji' }],
  ['ras-esmeralda', { tipo: 'rastro', alvo: 'gen:faisca:deep-emerald' }],
  ['ras-lofi', { tipo: 'rastro', alvo: 'gen:coracoes:lo-fi' }],
  ['ras-menta', { tipo: 'rastro', alvo: 'gen:arcoiris:menta-fresca' }],
  ['ras-neon-ribbon', { tipo: 'rastro', alvo: 'gen:arcoiris:arcade' }],
  ['ras-oceano', { tipo: 'rastro', alvo: 'gen:faisca:oceano-profundo' }],
  ['ras-ouro', { tipo: 'rastro', alvo: 'gen:faisca:sunset-gold' }],
  ['ras-sakura', { tipo: 'rastro', alvo: 'croma:coracoes:rosa' }],
  ['ras-stardust', { tipo: 'rastro', alvo: 'croma:estrelas:violeta' }],
  // fonte (8)
  ['fonte-cyber', { tipo: 'fonte', alvo: 'cyber' }],
  ['fonte-display', { tipo: 'fonte', alvo: 'display' }],
  ['fonte-handwriting', { tipo: 'fonte', alvo: 'handwriting' }],
  ['fonte-mono', { tipo: 'fonte', alvo: 'mono' }],
  ['fonte-padrao', { tipo: 'fonte', alvo: 'padrao' }],
  ['fonte-pixel', { tipo: 'fonte', alvo: 'pixel' }],
  ['fonte-rounded', { tipo: 'fonte', alvo: 'rounded' }],
  ['fonte-serif', { tipo: 'fonte', alvo: 'serif' }],
  // posicao (4)
  ['pos-baixo', { tipo: 'posicao', alvo: 'bottom' }],
  ['pos-direita', { tipo: 'posicao', alvo: 'right' }],
  ['pos-esquerda', { tipo: 'posicao', alvo: 'left' }],
  ['pos-topo', { tipo: 'posicao', alvo: 'top' }],
]);

/** Os ids antigos que saíram (a interface do plano). */
export const ITENS_REMOVIDOS: ReadonlySet<string> = new Set(ITENS_REMOVIDOS_DO_CATALOGO.keys());

/** Prefixo dos créditos de reembolso. O `reason` do crédito é `reembolso:<reason do gasto>`. */
export const PREFIXO_DO_REEMBOLSO = 'reembolso:';

/** O item que um gasto comprou, se ele for de um item removido (ou de aprimoramento). */
function gastoReembolsavel(reason: string): boolean {
  if (reason.startsWith('aprimoramento:')) return true;
  if (reason.startsWith('loja:')) return ITENS_REMOVIDOS.has(reason.slice('loja:'.length));
  if (reason.startsWith('croma:')) return ITENS_REMOVIDOS.has(reason.split(':')[1] ?? '');
  return false;
}

/**
 * OS REEMBOLSOS DEVIDOS, puros: um por `reason` de gasto reembolsável que ainda não tem o crédito
 * `reembolso:<reason>`. Gastos repetidos com o mesmo `reason` (não deveria haver: o `spendId` da
 * Loja é por item) somam num crédito só — o id é o que garante o "uma vez".
 */
export function reembolsosDevidos(
  gastos: ReadonlyArray<{ reason: string; amount: number }>,
  jaCreditados: ReadonlySet<string>,
): { creditoId: `reembolso:${string}`; seeds: number }[] {
  const porReason = new Map<string, number>();
  for (const g of gastos) {
    if (!gastoReembolsavel(g.reason)) continue;
    porReason.set(g.reason, (porReason.get(g.reason) ?? 0) + Math.max(0, Math.round(g.amount)));
  }
  const devidos: { creditoId: `reembolso:${string}`; seeds: number }[] = [];
  for (const [reason, seeds] of porReason) {
    const creditoId = `${PREFIXO_DO_REEMBOLSO}${reason}` as const;
    if (seeds > 0 && !jaCreditados.has(creditoId)) devidos.push({ creditoId, seeds });
  }
  return devidos;
}

/**
 * O EQUIVALENTE de um item premium (pago com Créditos) que saiu. Mapa fixo; os itens da onda 4
 * substituem o tema Aurora quando existirem. Item que não saiu devolve ele mesmo.
 */
const EQUIVALENTES: Readonly<Record<string, string>> = {
  'dourada-3': 'tema-aurora',
  'dourada-5': 'tema-aurora',
  'dourada-7': 'tema-aurora',
  /* Onda 6 (curadoria da vitrine de Créditos, `loja.ts`): as três douradas que saíram viram um
     rastro dourado da vitrine (pagas a 150, a vitrine agora custa 100). Partícula de estrelas e confete dourados
     repetiam o `alvo` da Loja de Seeds; as estrelas do rastro eram emoji. */
  'dourada-1': 'dourada-2',
  'dourada-4': 'dourada-10',
  'dourada-9': 'dourada-6',
};

export function equivalenteDe(id: string): string {
  return EQUIVALENTES[id] ?? id;
}

/** A posse premium com os removidos trocados pelo equivalente, sem repetição. */
export function possePremiumComEquivalentes(ids: readonly string[]): string[] {
  return [...new Set(ids.map(equivalenteDe))];
}
