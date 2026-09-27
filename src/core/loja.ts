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

import { CATALOGO_DA_MAESTRIA } from './catalogoMaestria';
import type { MinigameId } from './minigames/types';

export type Raridade = 'comum' | 'raro' | 'epico' | 'lendario';

/* Vinha de `lib/desbloqueios`. Mora aqui porque o catálogo é quem o usa para tipar `tipo`, e o
   core não pode depender de `lib/` (a seta aponta só para dentro). `desbloqueios.ts` passa a
   importar daqui — continua sendo o dono da REGRA de nível; o core é o dono do VOCABULÁRIO. */
export type TipoDesbloqueavel = 'tema' | 'fonte' | 'posicao' | 'estudio';

/** Tipos além dos desbloqueáveis clássicos: partículas, rastro do mouse e as capacidades da
 *  galeria. `pack`, `cursor` e `aprimoramento` saíram nas recompensas v2 (27/09); `fonte` e
 *  `posicao` continuam como tipo (a régua de `desbloqueios` os consulta), sem item no catálogo:
 *  fora do catálogo = livre. */
export type TipoDaLoja = TipoDesbloqueavel | 'particulas' | 'rastro' | 'galeria'
  | 'efeito-acerto' | 'efeito-combo' | 'finalizacao' | 'moldura' | 'titulo'; // onda 3 (maestria)

export interface ItemDaLoja {
  id: string;
  tipo: TipoDaLoja;
  /** id concreto usado pelo módulo que equipa (ThemeType, FonteType, ParticulasType...). */
  alvo: string;
  nome: string;
  desc: string;
  raridade: Raridade;
  /**
   * Nível que destrava de graça (1 = livre desde o início). AUSENTE = o nível não abre (recompensas
   * v2): itens novos só de Seeds e os de maestria. A simulação da onda 2 mostrou que o nível da
   * conta abre tudo antes das Seeds (`docs/economia-v2.md`).
   */
  nivel?: number;
  /** Preço do ATALHO em Seeds; ausente = só por nível. */
  precoSeeds?: number;
  /** Cores de prévia (swatches) quando fizer sentido. */
  previa?: string[];
  /**
   * EXCLUSIVO DE CONQUISTA (economia v2): id da conquista que libera. Sem nível, sem preço —
   * a Loja mostra o cadeado "Conquista: X" e o item só fica equipável com a conquista feita.
   */
  exclusivoDe?: string;
  /**
   * PREÇO EM CRÉDITOS — a moeda comprada com dinheiro (mudança credito-com-destino).
   *
   * Um item tem preço numa moeda OU na outra, nunca nas duas: misturar as duas faria o mesmo
   * objeto ter dois valores e apagaria a linha que separa "ganhei estudando" de "paguei". Item
   * com `precoCreditos` não tem `precoSeeds`, e a régua das quatro origens o classifica como
   * `creditos`.
   */
  precoCreditos?: number;
  /**
   * EXCLUSIVO DO PASSE PREMIUM: a casa da trilha paga que o entrega. Nem nível, nem Seeds, nem
   * Créditos avulsos — só a trilha, e só para quem comprou o passe.
   */
  exclusivoDoPasse?: number;
  /** O jogo a que o item pertence (efeitos de maestria, molduras e títulos). */
  jogo?: MinigameId;
  /**
   * EXCLUSIVO DE MAESTRIA (recompensas v2, onda 3): o nível de maestria do jogo que libera o item.
   * Sem nível da conta, sem Seeds, sem Créditos, fora do baú — nunca à venda. A posse vem do
   * crédito `maestria:<jogo>:<nível>` conferido no servidor.
   */
  origemMaestria?: { jogo: MinigameId; nivel: 2 | 3 | 4 | 5 };
}

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
    precoSeeds: 450,
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
    precoSeeds: 1220,
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
    /* 1300 → 1260 na onda 3: com os efeitos genéricos no baú, o repetido (15/40 Seeds) sai menos e
       o perfil típico cai de 165 para 158,5 Seeds/dia; 1300 passaria de 8 dias. */
    precoSeeds: 1260,
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
    desc: 'Bolas de luz com cauda. Só para quem somou 60 min de escuta.',
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
    precoSeeds: 450,
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





  /* ── AS DEZ VARIANTES DOURADAS (mudança credito-com-destino) ───────────────────────────────
   *
   * `galeria/passe.ts` prometia "Variante Dourada N" em cada marco de dezena da trilha paga — e a
   * promessa era só uma string `nome`: os itens não existiam no catálogo, então o marco coroava o
   * nada. Aqui elas passam a existir.
   *
   * NENHUMA ARTE NOVA, pela mesma técnica dos 25 itens das décadas 6-10: são peças que o app já
   * sabe desenhar, na paleta dourada (`sunset-gold`, `ouro-*`). O que as torna especiais é a VIA,
   * não o pixel.
   *
   * DUAS PORTAS, e é isso que dá destino ao Crédito: vêm de graça no Passe da temporada (`
   * exclusivoDoPasse` = a casa que as entrega) OU se compram avulsas com Créditos.
   *
   * O PREÇO DE 150 É UM PADRÃO DERIVADO, não uma decisão de produto: o Passe custa R$ 14,90 e
   * devolve 1.134 Créditos, então as dez variantes a 150 somam 1.500 — quem compra o passe leva
   * as dez de graça e ainda sobra crédito; quem compra avulso paga mais caro pelo conjunto. É a
   * relação que faz o passe valer a pena sem tornar o avulso inútil. O dono ajusta o número.
   */
  {
    id: 'dourada-1',
    tipo: 'particulas',
    alvo: 'estrelas',
    nome: 'Faíscas Douradas',
    desc: 'A explosão de acerto em ouro velho. ✨',
    raridade: 'lendario',
    nivel: 1,
    precoCreditos: 150,
    exclusivoDoPasse: 10,
  },
  {
    id: 'dourada-2',
    tipo: 'rastro',
    alvo: 'gen:faisca:sunset-gold',
    nome: 'Rastro Dourado',
    desc: 'Ouro escorrendo do cursor.',
    raridade: 'lendario',
    nivel: 1,
    precoCreditos: 150,
    exclusivoDoPasse: 20,
  },
  {
    id: 'dourada-4',
    tipo: 'rastro',
    alvo: 'gen:estrelas:ouro-neon',
    nome: 'Estrelas de Ouro',
    desc: 'Estrelas douradas sobre o escuro.',
    raridade: 'lendario',
    nivel: 1,
    precoCreditos: 150,
    exclusivoDoPasse: 40,
  },
  {
    id: 'dourada-6',
    tipo: 'rastro',
    alvo: 'gen:pixel:ouro-escuro',
    nome: 'Pixel Dourado',
    desc: 'Quadradinhos de ouro, estilo arcade.',
    raridade: 'lendario',
    nivel: 1,
    precoCreditos: 150,
    exclusivoDoPasse: 60,
  },
  {
    id: 'dourada-8',
    tipo: 'rastro',
    alvo: 'gen:coracoes:ouro-pastel',
    nome: 'Corações de Ouro',
    desc: 'Corações dourados, discretos.',
    raridade: 'lendario',
    nivel: 1,
    precoCreditos: 150,
    exclusivoDoPasse: 80,
  },
  {
    id: 'dourada-9',
    tipo: 'particulas',
    alvo: 'confete',
    nome: 'Confete Dourado',
    desc: 'Papel picado de ouro em cada acerto.',
    raridade: 'lendario',
    nivel: 1,
    precoCreditos: 150,
    exclusivoDoPasse: 90,
  },
  {
    id: 'dourada-10',
    tipo: 'rastro',
    alvo: 'gen:arcoiris:sunset-gold',
    nome: 'Aurora Dourada',
    desc: 'O último marco da temporada — bolinhas de ouro.',
    raridade: 'lendario',
    nivel: 1,
    precoCreditos: 150,
    exclusivoDoPasse: 100,
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
];
