/**
 * O CATÁLOGO DA LOJA — a fonte única do que existe e do que custa.
 *
 * MORA NO CORE, e não em `lib/`, pela razão que a auditoria de 01/09 tornou urgente: **o servidor
 * precisa conhecer o preço**. Enquanto o catálogo vivia só no bundle do cliente, `POST
 * /api/metrics/seeds/gastar` gravava o `amount` que o cliente mandasse — um item de 600 Seeds saía
 * por 1, e o servidor passava a atestar a posse. O padrão certo já existia ao lado: `core/planos.ts`
 * e `core/creditos.ts` são importados por `server/routes/billing.ts`, e é por isso que a compra de
 * Créditos nunca teve esse furo.
 *
 * Regra deste arquivo: TS puro, sem DOM e sem localStorage. Posse, equipar e estado dependem do
 * navegador e continuam em `src/lib/loja.ts`, que reexporta o que está aqui.
 *
 * Inspiração declarada (pedido do dono, 2026-08-27): lojas de jogos (Fortnite/Roblox) — itens com
 * RARIDADE, vitrine com prévia, e duas vias de obtenção:
 *   · NÍVEL: destrava sozinho ao subir (deriveProgress);
 *   · SEEDS: a moeda ganha estudando compra o ATALHO.
 */

import { CATALOGO_V2, NIVEL_SO_SEEDS } from './catalogoV2';

export { NIVEL_SO_SEEDS };
import { CATALOGO_DAS_CONQUISTAS } from './catalogoConquistas';
import { CATALOGO_DA_MAESTRIA } from './catalogoMaestria';
import { CATALOGO_DA_TEMPORADA } from './catalogoTemporada';

export type { ItemDaLoja, Raridade, TipoDaLoja, TipoDesbloqueavel } from './tiposDaLoja';
import type { ItemDaLoja } from './tiposDaLoja';

/* PREÇOS (recompensas v2, 27/09) — calibrados por SIMULAÇÃO (`scripts/economia/simular-ritmo.ts`,
   tabela em `docs/economia-v2.md`). O perfil típico (25 revisões + 3 rodadas + 10 palavras salvas
   + meta do dia) rende ≈ 158 Seeds/dia só de resultado; a meta do dono é um comum a cada 2–3 dias,
   um raro por semana e um épico a cada 2–3 semanas: comum 350-450 · raro 1000-1260 · épico
   2600-3000 · lendário 5200 (≈ 1 mês). A escala antiga (40-600) foi multiplicada por faixa,
   mantendo a ordem dentro de cada raridade. Os EXCLUSIVOS de conquista não têm preço nem nível. */
export const CATALOGO_DA_LOJA: ItemDaLoja[] = [
  // ── TEMAS (equipam via persistTheme) ──
  {
    id: 'tema-babel',
    tipo: 'tema',
    alvo: 'babel',
    nome: 'Babel Atelier',
    desc: 'O tema da casa: terracota quente. No escuro vira café.',
    raridade: 'comum',
    nivel: 1,
    previa: ['#F4F1E8', '#FFFFFF', '#F04E23', '#26241F'],
  },
  {
    id: 'tema-linear',
    tipo: 'tema',
    alvo: 'linear',
    nome: 'Linear Indigo',
    desc: 'Índigo elegante e geométrico. No escuro vira meia-noite.',
    raridade: 'comum',
    nivel: 2,
    precoSeeds: 440,
    previa: ['#F7F8FB', '#FFFFFF', '#5E6AD2', '#1F2023'],
  },
  {
    id: 'tema-vercel',
    tipo: 'tema',
    alvo: 'vercel',
    nome: 'Vercel Geist',
    desc: 'Monocromático, cantos retos, frio.',
    raridade: 'raro',
    nivel: 4,
    precoSeeds: 1080,
    previa: ['#FAFAFA', '#FFFFFF', '#171717', '#171717'],
  },
  {
    id: 'tema-mochi',
    tipo: 'tema',
    alvo: 'mochi',
    nome: 'Mochi Parchment',
    desc: 'Everforest orgânico, arredondado.',
    raridade: 'raro',
    nivel: 6,
    precoSeeds: 1180,
    previa: ['#F2EFDF', '#FDF6E3', '#8DA101', '#5C6A72'],
  },
  {
    id: 'tema-notion',
    tipo: 'tema',
    alvo: 'notion',
    nome: 'Notion Charcoal',
    desc: 'Carvão sóbrio, tipográfico.',
    raridade: 'raro',
    nivel: 7,
    precoSeeds: 1190, // 1300 → 1190 com as ondas 3 e 4 juntas: o baú entrega mais peça e a renda típica cai para 149,9/dia (docs/economia-v2.md)
    previa: ['#F7F6F3', '#FFFFFF', '#37352F', '#37352F'],
  },
  {
    id: 'tema-premium',
    tipo: 'tema',
    alvo: 'premium',
    nome: 'Instrument Premium',
    desc: 'Sofisticado, sereno, raro.',
    raridade: 'epico',
    nivel: 8,
    precoSeeds: 3000,
    previa: ['#101418', '#161C22', '#C7A76C', '#E8E3D9'],
  },
  {
    id: 'tema-custom',
    tipo: 'tema',
    alvo: 'custom',
    nome: 'Tema Customizado',
    desc: 'Suas cores, suas regras.',
    raridade: 'lendario',
    nivel: 10,
    precoSeeds: 5200,
  },
  {
    id: 'tema-aurora',
    tipo: 'tema',
    alvo: 'aurora',
    nome: 'Tema Aurora',
    desc: 'Noite polar com verde-aurora. Só para quem pratica 30 dias seguidos.',
    raridade: 'lendario',
    nivel: 1,
    exclusivoDe: 'constante',
    previa: ['#070B14', '#0E1626', '#4ADE80', '#A78BFA'],
  },
  // ── RECOMPENSAS V2, ONDA 4: temas completos, estilos de legenda, peles de cartão (catalogoV2.ts) ──
  ...CATALOGO_V2,
  // ── ESTÚDIO ──
  {
    id: 'estudio',
    tipo: 'estudio',
    alvo: 'abrir',
    nome: 'Estúdio de Cores & Layout',
    desc: 'O editor completo: paleta, painéis, tudo na sua mão.',
    raridade: 'lendario',
    nivel: 10,
    precoSeeds: 5200,
  },
  /* ── FONTES E POSIÇÃO DO MENU SAÍRAM DO CATÁLOGO (recompensas v2, 27/09) ──
   *
   * Tipografia é legibilidade e a posição do menu é layout: as duas viraram opções LIVRES no
   * bloco "Acessibilidade e layout" do Personalizar, sem nível e sem preço. Quem tinha pagado
   * Seeds por "Menu à direita" ou "Menu embaixo" recebe o reembolso (`src/core/reembolso.ts`). */

  // ── PARTÍCULAS (equipam via setParticulas) ──
  {
    id: 'part-pixel',
    tipo: 'particulas',
    alvo: 'pixel',
    nome: 'Partículas Pixel',
    desc: 'Quadradinhos 8-bits em cada acerto.',
    raridade: 'comum',
    nivel: 2,
    precoSeeds: 350,
  },
  {
    id: 'part-confete',
    tipo: 'particulas',
    alvo: 'confete',
    nome: 'Partículas Confete',
    desc: 'Papel picado girando.',
    raridade: 'comum',
    nivel: 3,
    precoSeeds: 420,
  },
  {
    id: 'part-coracoes',
    tipo: 'particulas',
    alvo: 'coracoes',
    nome: 'Partículas Corações',
    desc: 'Corações subindo a cada acerto.',
    raridade: 'raro',
    nivel: 5,
    precoSeeds: 1150,
  },
  {
    id: 'part-estrelas',
    tipo: 'particulas',
    alvo: 'estrelas',
    nome: 'Partículas Estrelas',
    desc: 'Estrelinhas brilhantes ⭐✨.',
    raridade: 'epico',
    nivel: 7,
    precoSeeds: 3000,
  },
  {
    id: 'part-cometa',
    tipo: 'particulas',
    alvo: 'cometa',
    nome: 'Partículas Cometa',
    desc: 'Bolas de luz com cauda. Só para quem gravou ou importou 5 sessões.',
    raridade: 'lendario',
    nivel: 1,
    exclusivoDe: 'ouvinte',
  },
  /* APRIMORAMENTOS, PACKS DE EMOJI, CURSORES e a partícula "Chuva de Emojis" SAÍRAM (recompensas
     v2, 27/09): nada disso aparecia onde se estuda. A lista do que saiu e o reembolso das Seeds
     moram em `src/core/reembolso.ts`. */
  // ── RASTRO DO MOUSE (um por forma, só com ponteiro fino e fora do modo leve) ──
  {
    id: 'ras-off',
    tipo: 'rastro',
    alvo: 'off',
    nome: 'Rastro desligado',
    desc: 'Mouse limpo, zero partícula.',
    raridade: 'comum',
    nivel: 1,
  },
  {
    id: 'ras-faisca',
    tipo: 'rastro',
    alvo: 'faisca',
    nome: 'Rastro Faíscas',
    desc: 'Faíscas seguindo o cursor; clique solta uma mini-explosão.',
    raridade: 'raro',
    nivel: 3,
    precoSeeds: 1000,
  },
  {
    id: 'ras-estrelas',
    tipo: 'rastro',
    alvo: 'estrelas',
    nome: 'Rastro Estrelas',
    desc: '⭐ atrás do mouse.',
    raridade: 'raro',
    nivel: 4,
    precoSeeds: 1080,
  },
  {
    id: 'ras-coracoes',
    tipo: 'rastro',
    alvo: 'coracoes',
    nome: 'Rastro Corações',
    desc: 'Corações por onde você passa.',
    raridade: 'epico',
    nivel: 5,
    precoSeeds: 2600,
  },
  {
    id: 'ras-pixel',
    tipo: 'rastro',
    alvo: 'pixel',
    nome: 'Rastro Pixel',
    desc: 'Quadradinhos 8-bits no caminho.',
    raridade: 'epico',
    nivel: 6,
    precoSeeds: 2800,
  },
  {
    id: 'ras-arcoiris',
    tipo: 'rastro',
    alvo: 'arcoiris',
    nome: 'Rastro Arco-íris',
    desc: 'Seis cores escorrendo do cursor. Só para quem viu todos os eventos raros.',
    raridade: 'lendario',
    nivel: 1,
    exclusivoDe: 'colecionador',
  },
  // ── GALERIA (ver lib/galeria/acesso.ts): capacidades de personalização na MESMA régua da Loja ──
  {
    id: 'gal-estilo-pastel',
    tipo: 'galeria',
    alvo: 'estilo:pastel',
    nome: 'Paletas Pastel',
    desc: '30 paletas suaves, uma por matiz.',
    raridade: 'comum',
    nivel: 2,
    precoSeeds: 380,
  },
  {
    id: 'gal-estilo-escuro',
    tipo: 'galeria',
    alvo: 'estilo:escuro',
    nome: 'Paletas Escuras',
    desc: '30 paletas escuras, uma por matiz.',
    raridade: 'comum',
    nivel: 3,
    precoSeeds: 440,
  },
  {
    id: 'gal-estilo-neon',
    tipo: 'galeria',
    alvo: 'estilo:neon',
    nome: 'Paletas Néon',
    desc: '30 paletas de acento néon sobre preto.',
    raridade: 'raro',
    nivel: 5,
    precoSeeds: 1150,
  },
  {
    id: 'gal-estilo-meia-noite',
    tipo: 'galeria',
    alvo: 'estilo:meia-noite',
    nome: 'Paletas Meia-noite',
    desc: '30 paletas profundas, para estudar à noite.',
    raridade: 'epico',
    nivel: 7,
    precoSeeds: 2600,
  },

  /* ── TEMPORADA 1: O QUE ENCHE O PASSE (mudança economia-legivel-e-moedas) ──────────────
   *
   * O passe tinha 59 itens para 100 casas, e a distribuição era invertida: 43 deles nos níveis
   * 1-5, contra 16 nos níveis 6-10. Resultado medido: 33 casas vazias, 29 delas na segunda
   * metade, e 8 dos 10 marcos ★ de dezena mostrando uma estrela dourada sobre o vazio.
   *
   * Estes 25 itens são conteúdo REAL sem arte nova nem sistema novo — packs de emoji montados
   * do catálogo que o editor já usa, rastros `gen:<forma>:<paleta>` que o motor já resolve, e
   * cursores de emoji que a regra de CSS já injeta. Todos entram nos níveis 5-10, que é onde
   * faltava. Depois deles, cada década tem itens suficientes para não haver casa vazia.
   */

  /* FAÍSCA, e não estrela: a forma `estrelas` desenha ⭐ e ✨ por `fillText` (effects.ts), e
     emoji IGNORA cor — este item prometia "nas cores do oceano profundo" e entregava a mesma
     estrela amarela do Rastro Estrelas. As miniaturas reais (01/09) mostraram os dois idênticos
     lado a lado, que foi como o defeito apareceu. Faísca é círculo pintado: a paleta vale. */

  /* ── A VITRINE DE CRÉDITOS (recompensas v2, onda 6 — era "as dez variantes douradas") ──────
   *
   * As douradas nasceram na mudança credito-com-destino para o Passe de 100 casas, que saiu na
   * onda 5. Sobrou UMA porta: a compra avulsa com Créditos, com prévia e preço à vista. A régua de
   * quem pode estar aqui é `vendavelEmCreditos` (`economiaAutoridade.ts`): uma moeda só, épico ou
   * lendário, sem nível, sem maestria, sem conquista, sem temporada e fora do baú.
   *
   * A CURADORIA DA ONDA 6 tirou três: a Faíscas Douradas (`dourada-1`) e o Confete Dourado
   * (`dourada-9`) tinham o MESMO `alvo` da Chuva de Estrelas e do Confete da Loja de Seeds — o
   * dinheiro comprava o que as Seeds (e o baú) já entregam —, e as Estrelas de Ouro (`dourada-4`)
   * desenhavam a estrela por emoji, ignorando a paleta. Quem as pagou fica com o equivalente
   * (`EQUIVALENTES` em `reembolso.ts`). Ficaram os quatro rastros dourados, que só existem aqui.
   *
   * SEM `nivel`: com `nivel: 1` o item tinha porta de nível (`temPortaDeNivel`) e só não saía de
   * graça porque cada leitor conferia `precoCreditos` antes.
   *
   * 100 CRÉDITOS (eram 150): todo pacote (100/300/700) compra itens inteiros, sem sobra — com 150,
   * o pacote de 100 sozinho não comprava nada e todo pacote deixava troco que empurra a próxima
   * compra. Equivalente em reais em `docs/economia-v2.md` ("Loja com Créditos").
   */
  {
    id: 'dourada-2',
    tipo: 'rastro',
    alvo: 'gen:faisca:sunset-gold',
    nome: 'Rastro Dourado',
    desc: 'Ouro escorrendo do cursor.',
    raridade: 'lendario',
    precoCreditos: 100,
  },
  {
    id: 'dourada-6',
    tipo: 'rastro',
    alvo: 'gen:pixel:ouro-escuro',
    nome: 'Pixel Dourado',
    desc: 'Quadradinhos de ouro, estilo arcade.',
    raridade: 'lendario',
    precoCreditos: 100,
  },
  {
    id: 'dourada-8',
    tipo: 'rastro',
    alvo: 'gen:coracoes:ouro-pastel',
    nome: 'Corações de Ouro',
    desc: 'Corações dourados, discretos.',
    raridade: 'lendario',
    precoCreditos: 100,
  },
  {
    id: 'dourada-10',
    tipo: 'rastro',
    alvo: 'gen:arcoiris:sunset-gold',
    nome: 'Aurora Dourada',
    desc: 'Bolinhas de ouro atrás do cursor.',
    raridade: 'lendario',
    precoCreditos: 100,
  },

  /* ── O QUE VEIO DO CATÁLOGO MESTRE (mudança gamificacao-sob-autoridade) ────────────────────
   *
   * `catalogoMestre.ts` (branch `gamificacao-v2-wip`) desenhou uma economia inteira em prosa —
   * lore, autor, citação, `especificacaoSonora`, shaders — e NADA daquilo é executável neste
   * app: nenhum módulo importa aquele arquivo, e a categoria `shader`/`carimbo`/`moldura` não
   * tem um leitor sequer. Trazer o mestre inteiro seria repetir o defeito que a temporada 1 já
   * pagou caro (`galeria/passe.ts` prometia "Variante Dourada N" e o marco coroava o nada).
   *
   * A REGRA QUE FILTROU ESTES 24: item novo só entra se um LEITOR EXISTENTE já souber desenhá-lo.
   * Os rastros não custaram UMA linha de código — são `gen:`/`croma:` que o motor de rastro já
   * resolvia desde 2026-08-28. (Os packs e cursores deste bloco saíram nas recompensas v2.)
   *
   * OS QUATRO MOTORES DE PARTÍCULA DO MESTRE (Plasma, Folhas, Cristal, Fogo) FICARAM DE FORA, e
   * essa é a decisão mais importante deste bloco. A skin de partícula só vira forma no ternário
   * `formaDaSkin` do ParticleCanvas; uma skin que ele não conhece cai em `null` e é desenhada
   * como círculo — exatamente igual à skin "Do tema", que é grátis. Seriam quatro itens de até
   * 400 Seeds entregando o padrão de fábrica. É o mesmo defeito que o comentário do Rastro Maré
   * documenta logo acima, e o preço aqui seria maior.
   */

  /* ── RASTROS: ZERO CÓDIGO NOVO ──
   *
   * Cada um é só um `alvo` que `estiloDeRastro()` já sabia resolver. `gen:<forma>:<paleta>` puxa
   * as cores de uma paleta da galeria; `croma:<forma>:<matiz>` puxa de um matiz cru. O `croma:`
   * é o preferido quando a cor pedida pelo mestre é UM tom (celeste, rosa, violeta, verde): a
   * paleta equivalente arrastaria junto o `accent` de um produto de 380 Seeds que a pessoa não
   * comprou, e `gen:` só é usado onde a IDENTIDADE da paleta é o ponto (Arcade, Halloween).
   *
   * AS DESCRIÇÕES DIZEM A FORMA QUE SAI, não a que o mestre sonhou. O mestre pediu pétalas de
   * sakura, fita cibernética e glifos caindo; o motor tem cinco formas (faísca, estrela, coração,
   * pixel, bolinha) e nenhuma delas é pétala, fita ou glifo. Vender "pétalas" e entregar coração
   * rosa é o defeito que o Rastro Maré já custou; então aqui a cor vem do mestre e o substantivo
   * vem do motor. */
  {
    id: 'ras-bolhas',
    tipo: 'rastro',
    alvo: 'croma:arcoiris:celeste',
    nome: 'Esteira de Bolhas',
    desc: 'Bolinhas celestes flutuando atrás do cursor.',
    raridade: 'raro',
    nivel: 3,
    precoSeeds: 1000,
  },
  {
    id: 'ras-matrix',
    tipo: 'rastro',
    alvo: 'croma:pixel:verde',
    nome: 'Fluxo Matrix 84',
    desc: 'Pixels de fósforo verde caindo do cursor. Só para quem fez combo ×15 no Duelo.',
    raridade: 'epico',
    nivel: 1,
    exclusivoDe: 'duelista',
  },
  ...CATALOGO_DA_MAESTRIA, // onda 3: efeitos de jogo, molduras e títulos (`catalogoMaestria.ts`)
  ...CATALOGO_DAS_CONQUISTAS, // onda 5: molduras e títulos do ouro das conquistas (`catalogoConquistas.ts`)
  ...CATALOGO_DA_TEMPORADA, // onda 5: molduras e títulos da Temporada 1 (`catalogoTemporada.ts`)
];

/**
 * A VITRINE DE CRÉDITOS (onda 6): os itens avulsos que se compram com a moeda paga, na ordem do
 * catálogo. É derivada, não uma segunda lista — o que tem `precoCreditos` é o que está à venda, e
 * `POST /api/billing/gastar` confere pela mesma régua (`autorizarGastoDeCredito`).
 */
export const VITRINE_DE_CREDITOS: readonly ItemDaLoja[] = CATALOGO_DA_LOJA.filter((i) => i.precoCreditos !== undefined);

/**
 * O NÍVEL DA CONTA ABRE ESTE ITEM? Duas formas de dizer "não" convivem (recompensas v2): a onda 3
 * deixa `nivel` ausente (maestria, e o que não chega por nível), a onda 4 marca `NIVEL_SO_SEEDS`
 * (um nível que ninguém alcança). As duas passam por aqui — nenhuma tela compara `nivel` à mão.
 */
export function temPortaDeNivel(
  item: Pick<ItemDaLoja, 'nivel'>,
): item is Pick<ItemDaLoja, 'nivel'> & { nivel: number } {
  return item.nivel !== undefined && item.nivel < NIVEL_SO_SEEDS;
}

/** O nível `nivel` já abre o item? */
export function abrePorNivel(item: Pick<ItemDaLoja, 'nivel'>, nivel: number): boolean {
  return temPortaDeNivel(item) && nivel >= item.nivel!;
}

/**
 * O item só se abre com Seeds? Tem preço e nenhuma porta de nível: a vitrine de nível, a próxima
 * recompensa e o Passe não o prometem, e o cadeado fala só em Seeds.
 */
export function soPorSeeds(item: Pick<ItemDaLoja, 'nivel' | 'precoSeeds'>): boolean {
  return item.precoSeeds !== undefined && !temPortaDeNivel(item);
}
