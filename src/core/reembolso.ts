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
 *  · PAGO COM CRÉDITOS NÃO SE PERDE. O item premium removido vira um equivalente da vitrine de
 *    Créditos (`resolverPremium`) na posse derivada; sem equivalente livre, os Créditos voltam.
 *  · EQUIPADO CAI NO PADRÃO, sem erro: o que lê a escolha salva (`readRastro`, `readParticulas`)
 *    ignora valor que não existe mais (rastro/partícula de emoji); cursor e pack não são mais lidos.
 *    Os rastros `gen:`/`croma:` que saíram da Loja seguem válidos: são combinações da galeria.
 *
 * Regra deste arquivo: TS puro (roda no Node e no navegador), como `economiaAutoridade`.
 */
import { vendavelEmCreditos } from './economiaAutoridade';
import { VITRINE_DE_CREDITOS } from './loja';

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
  // rastro (14) — ras-bolhas e ras-matrix saíram na revisão de 27/09 (um rastro por forma)
  ['ras-bolhas', { tipo: 'rastro', alvo: 'croma:arcoiris:celeste' }],
  ['ras-matrix', { tipo: 'rastro', alvo: 'croma:pixel:verde' }],
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
 * O EQUIVALENTE de um item premium (pago com Créditos) que saiu — SEMPRE um item da vitrine de
 * Créditos (`VITRINE_DE_CREDITOS`), nunca de conquista, maestria ou temporada.
 *
 * O DEFEITO QUE ISTO FECHA (revisão de 27/09, P0): as douradas 3, 5 e 7 viravam o tema Aurora,
 * que é exclusivo da conquista "Constante" (30 dias seguidos). Créditos são a moeda comprada com
 * dinheiro: com esse mapa, pagar entregava o prêmio que só a constância dá — exatamente o que
 * `vendavelEmCreditos` proíbe na porta da venda. Agora o mapa aponta para a vitrine e
 * `resolverPremium` confere a régua de venda item a item.
 */
const EQUIVALENTES: Readonly<Record<string, string>> = {
  /* Recompensas v2 (corte de cursores e packs): cursor da coroa, pack de tesouros e cursor do
     tridente — pagos a 150, viram um rastro dourado da vitrine (100). */
  'dourada-3': 'dourada-8',
  'dourada-5': 'dourada-6',
  'dourada-7': 'dourada-10',
  /* Onda 6 (curadoria da vitrine de Créditos, `loja.ts`): Faíscas Douradas, Estrelas de Ouro e
     Confete Dourado repetiam o `alvo` da Loja de Seeds ou desenhavam emoji. */
  'dourada-1': 'dourada-2',
  'dourada-4': 'dourada-10',
  'dourada-9': 'dourada-6',
};

/** Os ids premium que saíram do catálogo e têm equivalente. */
export const PREMIUM_REMOVIDOS: readonly string[] = Object.keys(EQUIVALENTES);

export function equivalenteDe(id: string): string {
  return EQUIVALENTES[id] ?? id;
}

/** Uma compra premium como o razão (`credit_spends`) a guarda: a linha, o item e quanto custou. */
export interface CompraPremium {
  /** Id estável da linha do gasto — vira o id da concessão do reembolso (idempotência). */
  id: string;
  itemId: string;
  creditos: number;
}

/** Prefixo da concessão que devolve Créditos (`credit_purchases.provider_payment_id`). */
export const PREFIXO_DO_REEMBOLSO_DE_CREDITOS = 'reembolso-creditos:';

/**
 * A POSSE PREMIUM E OS CRÉDITOS A DEVOLVER, puros e determinísticos (na ordem das compras).
 *
 *  · Compra de item que está à venda (`vendavelEmCreditos`) é posse.
 *  · Compra de item que SAIU vira o equivalente da vitrine; se a pessoa já tem esse equivalente
 *    (comprou os dois, ou duas removidas apontam para o mesmo), vale o próximo item da vitrine que
 *    ela ainda não tem. Sem nenhum livre, os Créditos pagos voltam (`reembolsos`) — nenhum Crédito
 *    se perde e nenhum vira duplicata.
 *  · Qualquer outra coisa (item que não se vende, id desconhecido) NÃO vira posse: é a garantia de
 *    que Créditos nunca rendem item de conquista, maestria ou temporada.
 */
export function resolverPremium(compras: readonly CompraPremium[]): {
  posse: string[];
  reembolsos: { concessaoId: string; creditos: number }[];
} {
  const vitrine = VITRINE_DE_CREDITOS.filter(vendavelEmCreditos).map((i) => i.id);
  const naVitrine = new Set(vitrine);
  const posse = new Set<string>();
  for (const c of compras) if (naVitrine.has(c.itemId)) posse.add(c.itemId);
  const reembolsos: { concessaoId: string; creditos: number }[] = [];
  for (const c of compras) {
    if (!(c.itemId in EQUIVALENTES)) continue;
    const livre = [equivalenteDe(c.itemId), ...vitrine].find((id) => naVitrine.has(id) && !posse.has(id));
    if (livre) posse.add(livre);
    else if (c.creditos > 0) reembolsos.push({ concessaoId: `${PREFIXO_DO_REEMBOLSO_DE_CREDITOS}${c.id}`, creditos: Math.round(c.creditos) });
  }
  return { posse: [...posse], reembolsos };
}

/* ── O PASSE DA TEMPORADA 1 (`passe-t1`) QUE SAIU ──────────────────────────────────────────────
 *
 * O SKU `passe-t1` (R$ 14,90) prometia "1.134 Créditos ao longo da trilha" das 100 casas, entregues
 * como concessões `passe:t1:premium-<casa>` pela rota `POST /api/billing/creditar-passe`. O Passe
 * saiu na onda 5 e a rota ficou sem efeito — quem tivesse comprado ficaria com o que já tinha
 * recebido. NENHUMA VENDA ACONTECEU (a cobrança nunca foi ligada em produção; `docs/economia-v2.md`),
 * mas o caminho existia no código: se uma compra paga aparecer, o que faltava da promessa volta
 * como concessão `reembolso-passe:<id da compra>`. */
export const CREDITOS_PROMETIDOS_PELO_PASSE_T1 = 1134;
export const PREFIXO_DO_REEMBOLSO_DO_PASSE = 'reembolso-passe:';

/**
 * Os Créditos devidos a quem comprou o Passe: por compra PAGA, o prometido menos o que as casas do
 * passe já concederam (o que já entrou abate só da primeira compra). Puro; a idempotência é a do
 * `provider_payment_id` da concessão.
 */
export function reembolsosDoPasse(
  comprasPagas: readonly { id: string }[],
  jaConcedidoPeloPasse: number,
): { concessaoId: string; creditos: number }[] {
  let abater = Math.max(0, Math.round(jaConcedidoPeloPasse));
  const devidos: { concessaoId: string; creditos: number }[] = [];
  for (const c of comprasPagas) {
    const creditos = Math.max(0, CREDITOS_PROMETIDOS_PELO_PASSE_T1 - abater);
    abater = Math.max(0, abater - CREDITOS_PROMETIDOS_PELO_PASSE_T1);
    if (creditos > 0) devidos.push({ concessaoId: `${PREFIXO_DO_REEMBOLSO_DO_PASSE}${c.id}`, creditos });
  }
  return devidos;
}

/** A posse premium com os removidos trocados pelo equivalente, sem repetição (só os ids). */
export function possePremiumComEquivalentes(ids: readonly string[]): string[] {
  return resolverPremium(ids.map((itemId, i) => ({ id: String(i), itemId, creditos: 0 }))).posse;
}
