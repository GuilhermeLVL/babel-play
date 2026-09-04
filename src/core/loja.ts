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

export type Raridade = 'comum' | 'raro' | 'epico' | 'lendario';

/* Vinha de `lib/desbloqueios`. Mora aqui porque o catálogo é quem o usa para tipar `tipo`, e o
   core não pode depender de `lib/` (a seta aponta só para dentro). `desbloqueios.ts` passa a
   importar daqui — continua sendo o dono da REGRA de nível; o core é o dono do VOCABULÁRIO. */
export type TipoDesbloqueavel = 'tema' | 'fonte' | 'posicao' | 'estudio';

/** Tipos além dos desbloqueáveis clássicos: packs de emoji, cursores, rastro do mouse e os
 *  APRIMORAMENTOS (upgrades com barra de progressão — ver lib/aprimoramentos). */
export type TipoDaLoja = TipoDesbloqueavel | 'particulas' | 'pack' | 'cursor' | 'rastro' | 'aprimoramento' | 'galeria';

export interface ItemDaLoja {
  id: string;
  tipo: TipoDaLoja;
  /** id concreto usado pelo módulo que equipa (ThemeType, FonteType, ParticulasType...). */
  alvo: string;
  nome: string;
  desc: string;
  raridade: Raridade;
  /** Nível que destrava de graça (1 = livre desde o início). */
  nivel: number;
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
}

/* PREÇOS (economia v2, 2026-08-28). Calibrados para o ritmo que o dono pediu — lendário em ≈ 1
   semana de uso diário (~86 Seeds/dia): comum 40-60 · raro 100-140 · épico 200-260 · lendário
   380-600. Os EXCLUSIVOS de conquista não têm preço nem nível: só a conquista abre. */
export const CATALOGO_DA_LOJA: ItemDaLoja[] = [
  // ── TEMAS (equipam via persistTheme) ──
  { id: 'tema-babel', tipo: 'tema', alvo: 'babel', nome: 'Babel Atelier', desc: 'O tema da casa: terracota quente.', raridade: 'comum', nivel: 1, previa: ['#F4F1E8', '#FFFFFF', '#F04E23', '#26241F'] },
  { id: 'tema-linear', tipo: 'tema', alvo: 'linear', nome: 'Linear Indigo', desc: 'Índigo elegante e geométrico.', raridade: 'comum', nivel: 2, precoSeeds: 60, previa: ['#F7F8FB', '#FFFFFF', '#5E6AD2', '#1F2023'] },
  { id: 'tema-vercel', tipo: 'tema', alvo: 'vercel', nome: 'Vercel Geist', desc: 'Monocromático, cantos retos, frio.', raridade: 'raro', nivel: 4, precoSeeds: 110, previa: ['#FAFAFA', '#FFFFFF', '#171717', '#171717'] },
  { id: 'tema-mochi', tipo: 'tema', alvo: 'mochi', nome: 'Mochi Parchment', desc: 'Everforest orgânico, arredondado.', raridade: 'raro', nivel: 6, precoSeeds: 130, previa: ['#F2EFDF', '#FDF6E3', '#8DA101', '#5C6A72'] },
  { id: 'tema-notion', tipo: 'tema', alvo: 'notion', nome: 'Notion Charcoal', desc: 'Carvão sóbrio, tipográfico.', raridade: 'raro', nivel: 7, precoSeeds: 140, previa: ['#F7F6F3', '#FFFFFF', '#37352F', '#37352F'] },
  { id: 'tema-premium', tipo: 'tema', alvo: 'premium', nome: 'Instrument Premium', desc: 'Sofisticado, sereno, raro.', raridade: 'epico', nivel: 8, precoSeeds: 240, previa: ['#101418', '#161C22', '#C7A76C', '#E8E3D9'] },
  { id: 'tema-custom', tipo: 'tema', alvo: 'custom', nome: 'Tema Customizado', desc: 'Suas cores, suas regras.', raridade: 'lendario', nivel: 10, precoSeeds: 600 },
  { id: 'tema-aurora', tipo: 'tema', alvo: 'aurora', nome: 'Tema Aurora', desc: 'Noite polar com verde-aurora. Só para quem aparece 30 dias seguidos.', raridade: 'lendario', nivel: 1, exclusivoDe: 'constante', previa: ['#070B14', '#0E1626', '#4ADE80', '#A78BFA'] },
  // ── ESTÚDIO ──
  { id: 'estudio', tipo: 'estudio', alvo: 'abrir', nome: 'Estúdio de Cores & Layout', desc: 'O editor completo: paleta, painéis, tudo na sua mão.', raridade: 'lendario', nivel: 10, precoSeeds: 600 },
  // ── POSIÇÕES DO MENU (topo/esquerda SEMPRE livres: equipar direita/baixo nunca tranca a
  //    pessoa fora do layout padrão — era um beco sem saída real, 2026-08-27) ──
  { id: 'pos-topo', tipo: 'posicao', alvo: 'top', nome: 'Menu no topo', desc: 'A barra clássica, em cima.', raridade: 'comum', nivel: 1 },
  { id: 'pos-esquerda', tipo: 'posicao', alvo: 'left', nome: 'Menu à esquerda', desc: 'O padrão da casa.', raridade: 'comum', nivel: 1 },
  { id: 'pos-direita', tipo: 'posicao', alvo: 'right', nome: 'Menu à direita', desc: 'Navegação no lado direito.', raridade: 'comum', nivel: 3, precoSeeds: 45 },
  { id: 'pos-baixo', tipo: 'posicao', alvo: 'bottom', nome: 'Menu embaixo', desc: 'Estilo dock, embaixo.', raridade: 'comum', nivel: 3, precoSeeds: 45 },
  // ── PARTÍCULAS (equipam via setParticulas) ──
  { id: 'part-pixel', tipo: 'particulas', alvo: 'pixel', nome: 'Partículas Pixel', desc: 'Quadradinhos 8-bits em cada acerto.', raridade: 'comum', nivel: 2, precoSeeds: 45 },
  { id: 'part-confete', tipo: 'particulas', alvo: 'confete', nome: 'Partículas Confete', desc: 'Papel picado girando.', raridade: 'comum', nivel: 3, precoSeeds: 55 },
  { id: 'part-coracoes', tipo: 'particulas', alvo: 'coracoes', nome: 'Partículas Corações', desc: 'Corações subindo a cada acerto.', raridade: 'raro', nivel: 5, precoSeeds: 120 },
  { id: 'part-estrelas', tipo: 'particulas', alvo: 'estrelas', nome: 'Partículas Estrelas', desc: 'Estrelinhas brilhantes ⭐✨.', raridade: 'epico', nivel: 7, precoSeeds: 240 },
  { id: 'part-emoji', tipo: 'particulas', alvo: 'emoji', nome: 'Chuva de Emojis', desc: 'Cada acerto chove o PACK de emojis equipado.', raridade: 'raro', nivel: 4, precoSeeds: 120 },
  { id: 'part-cometa', tipo: 'particulas', alvo: 'cometa', nome: 'Partículas Cometa', desc: 'Bolas de luz com cauda. Só para quem somou 60 min de escuta.', raridade: 'lendario', nivel: 1, exclusivoDe: 'ouvinte' },
  // ── APRIMORAMENTOS (progressão Nv.0-3 com barra; ver lib/aprimoramentos) ──
  { id: 'apr-particulas', tipo: 'aprimoramento', alvo: 'particulas', nome: 'Explosão de Partículas', desc: 'Cada nível: mais partículas e maiores. Depois de dominar, a intensidade é sua (pequena/média/grande).', raridade: 'epico', nivel: 1 },
  { id: 'apr-sorte', tipo: 'aprimoramento', alvo: 'sorte', nome: 'Sorte de Eventos Raros', desc: 'Cada nível aumenta a chance de patos, corações, glitch e cia. aparecerem.', raridade: 'epico', nivel: 1 },
  // ── PACKS DE EMOJI (alimentam a Chuva de Emojis, o rastro e os fallbacks) ──
  { id: 'pack-classico', tipo: 'pack', alvo: 'classico', nome: 'Pack Clássico', desc: '⭐ ✨ 💫 🌟', raridade: 'comum', nivel: 1 },
  { id: 'pack-animais', tipo: 'pack', alvo: 'animais', nome: 'Pack Animais', desc: '🦆 🐱 🐶 🦊 🐸 🐼 🦜', raridade: 'comum', nivel: 2, precoSeeds: 50 },
  { id: 'pack-comidas', tipo: 'pack', alvo: 'comidas', nome: 'Pack Comidas', desc: '🍕 🍔 🍩 🍦 🌮 🍓 🍿', raridade: 'comum', nivel: 2, precoSeeds: 50 },
  { id: 'pack-natureza', tipo: 'pack', alvo: 'natureza', nome: 'Pack Natureza', desc: '🌸 🍀 🌈 ☀️ 🌊 🍁 🌵', raridade: 'comum', nivel: 3, precoSeeds: 60 },
  { id: 'pack-festa', tipo: 'pack', alvo: 'festa', nome: 'Pack Festa', desc: '🎉 🎊 🎈 🥳 🪅 🎁 🎂', raridade: 'raro', nivel: 4, precoSeeds: 110 },
  { id: 'pack-musica', tipo: 'pack', alvo: 'musica', nome: 'Pack Música', desc: '🎵 🎶 🎸 🎤 🥁 🎹 🎧', raridade: 'raro', nivel: 4, precoSeeds: 110 },
  { id: 'pack-esportes', tipo: 'pack', alvo: 'esportes', nome: 'Pack Esportes', desc: '⚽ 🏀 🏐 🏆 🎮 🥇 🏁', raridade: 'raro', nivel: 5, precoSeeds: 120 },
  { id: 'pack-espaco', tipo: 'pack', alvo: 'espaco', nome: 'Pack Espaço', desc: '🚀 🪐 👽 ☄️ 🌌 🛸', raridade: 'epico', nivel: 6, precoSeeds: 220 },
  { id: 'pack-arrepio', tipo: 'pack', alvo: 'arrepio', nome: 'Pack Arrepio', desc: '🎃 👻 💀 🦇 🕷️ 🧟', raridade: 'epico', nivel: 7, precoSeeds: 240 },
  { id: 'pack-brasil', tipo: 'pack', alvo: 'brasil', nome: 'Pack Brasil', desc: '🇧🇷 ⚽ 🏖️ 🦜 ☕ 🌴', raridade: 'raro', nivel: 3, precoSeeds: 100 },
  { id: 'pack-tesouros', tipo: 'pack', alvo: 'tesouros', nome: 'Pack Tesouros', desc: '💎 👑 🪙 💰 🔮', raridade: 'lendario', nivel: 9, precoSeeds: 550 },
  // ── CURSORES ──
  { id: 'cur-padrao', tipo: 'cursor', alvo: 'padrao', nome: 'Cursor do sistema', desc: 'O de sempre — volta atrás garantida.', raridade: 'comum', nivel: 1 },
  { id: 'cur-mira', tipo: 'cursor', alvo: 'mira', nome: 'Cursor Mira', desc: 'Precisão de sniper. 🎯', raridade: 'comum', nivel: 2, precoSeeds: 50 },
  { id: 'cur-pato', tipo: 'cursor', alvo: 'pato', nome: 'Cursor Pato', desc: 'Um pato de borracha aponta por você. 🦆', raridade: 'raro', nivel: 3, precoSeeds: 100 },
  { id: 'cur-varinha', tipo: 'cursor', alvo: 'varinha', nome: 'Cursor Varinha', desc: 'Cada clique é um feitiço. 🪄', raridade: 'raro', nivel: 4, precoSeeds: 110 },
  { id: 'cur-pizza', tipo: 'cursor', alvo: 'pizza', nome: 'Cursor Pizza', desc: 'Fome de conhecimento. 🍕', raridade: 'raro', nivel: 5, precoSeeds: 120 },
  { id: 'cur-fogo', tipo: 'cursor', alvo: 'fogo', nome: 'Cursor Fogo', desc: 'Na brasa. 🔥', raridade: 'epico', nivel: 6, precoSeeds: 220 },
  { id: 'cur-espada', tipo: 'cursor', alvo: 'espada', nome: 'Cursor Espada', desc: 'Corta a interface. ⚔️', raridade: 'epico', nivel: 7, precoSeeds: 240 },
  { id: 'cur-foguete', tipo: 'cursor', alvo: 'foguete', nome: 'Cursor Foguete', desc: 'Decolagem. 🚀', raridade: 'epico', nivel: 8, precoSeeds: 260 },
  { id: 'cur-invader', tipo: 'cursor', alvo: 'invader', nome: 'Cursor Invader', desc: '8-bits até no ponteiro. 👾', raridade: 'lendario', nivel: 9, precoSeeds: 500 },
  { id: 'cur-coroa', tipo: 'cursor', alvo: 'coroa', nome: 'Cursor Coroa', desc: 'A coroa de quem fechou 10 rodadas perfeitas. 👑', raridade: 'lendario', nivel: 1, exclusivoDe: 'perfeccionista' },
  // ── RASTRO DO MOUSE ──
  { id: 'ras-off', tipo: 'rastro', alvo: 'off', nome: 'Rastro desligado', desc: 'Mouse limpo, zero partícula.', raridade: 'comum', nivel: 1 },
  { id: 'ras-faisca', tipo: 'rastro', alvo: 'faisca', nome: 'Rastro Faíscas', desc: 'Faíscas seguindo o cursor; clique solta uma mini-explosão.', raridade: 'raro', nivel: 3, precoSeeds: 100 },
  { id: 'ras-estrelas', tipo: 'rastro', alvo: 'estrelas', nome: 'Rastro Estrelas', desc: '⭐ atrás do mouse.', raridade: 'raro', nivel: 4, precoSeeds: 110 },
  { id: 'ras-coracoes', tipo: 'rastro', alvo: 'coracoes', nome: 'Rastro Corações', desc: 'Corações por onde você passa.', raridade: 'epico', nivel: 5, precoSeeds: 220 },
  { id: 'ras-pixel', tipo: 'rastro', alvo: 'pixel', nome: 'Rastro Pixel', desc: 'Quadradinhos 8-bits no caminho.', raridade: 'epico', nivel: 6, precoSeeds: 230 },
  { id: 'ras-emoji', tipo: 'rastro', alvo: 'emoji', nome: 'Rastro Emoji', desc: 'O pack equipado escorrendo do cursor.', raridade: 'lendario', nivel: 8, precoSeeds: 380 },
  { id: 'ras-arcoiris', tipo: 'rastro', alvo: 'arcoiris', nome: 'Rastro Arco-íris', desc: 'Seis cores escorrendo do cursor. Só para quem viu todos os eventos raros.', raridade: 'lendario', nivel: 1, exclusivoDe: 'colecionador' },
  // ── GALERIA (ver lib/galeria/acesso.ts): capacidades de personalização na MESMA régua da Loja ──
  { id: 'gal-estilo-pastel', tipo: 'galeria', alvo: 'estilo:pastel', nome: 'Paletas Pastel', desc: '30 paletas suaves, uma por matiz.', raridade: 'comum', nivel: 2, precoSeeds: 50 },
  { id: 'gal-estilo-escuro', tipo: 'galeria', alvo: 'estilo:escuro', nome: 'Paletas Escuras', desc: '30 paletas escuras, uma por matiz.', raridade: 'comum', nivel: 3, precoSeeds: 60 },
  { id: 'gal-estilo-neon', tipo: 'galeria', alvo: 'estilo:neon', nome: 'Paletas Néon', desc: '30 paletas de acento néon sobre preto.', raridade: 'raro', nivel: 5, precoSeeds: 120 },
  { id: 'gal-estilo-meia-noite', tipo: 'galeria', alvo: 'estilo:meia-noite', nome: 'Paletas Meia-noite', desc: '30 paletas profundas, para estudar à noite.', raridade: 'epico', nivel: 7, precoSeeds: 220 },
  { id: 'gal-editor-pack', tipo: 'galeria', alvo: 'editor-pack', nome: 'Editor de pack', desc: 'Monte o seu pack de emojis: escolha um a um, categoria inteira, ou tire só um.', raridade: 'comum', nivel: 2, precoSeeds: 50 },
  { id: 'gal-cursor-emoji', tipo: 'galeria', alvo: 'cursor-emoji', nome: 'Cursor de qualquer emoji', desc: 'Todo emoji liberado do catálogo vira ponteiro.', raridade: 'raro', nivel: 3, precoSeeds: 100 },
  { id: 'gal-cat-patos', tipo: 'galeria', alvo: 'cat:patos', nome: 'Emojis: Patos & aves', desc: '🦆 🐤 🐔 🦢 🦩 e cia. para packs, cursor e rastro.', raridade: 'comum', nivel: 2, precoSeeds: 40 },
  { id: 'gal-cat-esportes', tipo: 'galeria', alvo: 'cat:esportes', nome: 'Emojis: Esportes', desc: '⚽ 🏀 🏆 🎮 e cia.', raridade: 'comum', nivel: 2, precoSeeds: 40 },
  { id: 'gal-cat-festa', tipo: 'galeria', alvo: 'cat:festa', nome: 'Emojis: Festa', desc: '🎉 🎊 🎈 🥳 e cia.', raridade: 'comum', nivel: 3, precoSeeds: 50 },
  { id: 'gal-cat-musica', tipo: 'galeria', alvo: 'cat:musica', nome: 'Emojis: Música', desc: '🎵 🎸 🎧 🥁 e cia.', raridade: 'comum', nivel: 3, precoSeeds: 50 },
  { id: 'gal-cat-espaco', tipo: 'galeria', alvo: 'cat:espaco', nome: 'Emojis: Espaço', desc: '🚀 🪐 👽 🛸 e cia.', raridade: 'raro', nivel: 4, precoSeeds: 100 },
  { id: 'gal-cat-transporte', tipo: 'galeria', alvo: 'cat:transporte', nome: 'Emojis: Transporte', desc: '🚗 ✈️ 🚂 ⛵ e cia.', raridade: 'raro', nivel: 4, precoSeeds: 100 },
  { id: 'gal-cat-objetos', tipo: 'galeria', alvo: 'cat:objetos', nome: 'Emojis: Objetos', desc: '💎 👑 🔮 🔑 e cia.', raridade: 'raro', nivel: 5, precoSeeds: 110 },
  { id: 'gal-cat-bebidas', tipo: 'galeria', alvo: 'cat:bebidas', nome: 'Emojis: Bebidas', desc: '☕ 🧋 🍹 🥂 e cia.', raridade: 'comum', nivel: 5, precoSeeds: 60 },

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
  { id: 'pack-oceano', tipo: 'pack', alvo: 'oceano', nome: 'Pack Oceano', desc: '🐬 🐳 🐙 🐠 🦈 🌊 🐚', raridade: 'comum', nivel: 5, precoSeeds: 60 },

  { id: 'pack-doces', tipo: 'pack', alvo: 'doces', nome: 'Pack Doces', desc: '🍩 🍪 🧁 🍰 🍫 🍬 🍭', raridade: 'comum', nivel: 6, precoSeeds: 60 },
  { id: 'pack-gatos', tipo: 'pack', alvo: 'gatos', nome: 'Pack Gatos', desc: '🐱 🐈 🐾 😺 😻 🐯 🦁', raridade: 'comum', nivel: 6, precoSeeds: 60 },
  { id: 'cur-golfinho', tipo: 'cursor', alvo: 'golfinho', nome: 'Cursor Golfinho', desc: 'Um golfinho nada pelo ponteiro. 🐬', raridade: 'raro', nivel: 6, precoSeeds: 120 },
  /* FAÍSCA, e não estrela: a forma `estrelas` desenha ⭐ e ✨ por `fillText` (effects.ts), e
     emoji IGNORA cor — este item prometia "nas cores do oceano profundo" e entregava a mesma
     estrela amarela do Rastro Estrelas. As miniaturas reais (01/09) mostraram os dois idênticos
     lado a lado, que foi como o defeito apareceu. Faísca é círculo pintado: a paleta vale. */
  { id: 'ras-oceano', tipo: 'rastro', alvo: 'gen:faisca:oceano-profundo', nome: 'Rastro Maré', desc: 'Faíscas nas cores do oceano profundo.', raridade: 'raro', nivel: 6, precoSeeds: 130 },

  { id: 'pack-jardim', tipo: 'pack', alvo: 'jardim', nome: 'Pack Jardim', desc: '🌷 🌻 🌹 🌵 🍀 🌿 🌱', raridade: 'raro', nivel: 7, precoSeeds: 110 },
  { id: 'cur-coruja', tipo: 'cursor', alvo: 'coruja', nome: 'Cursor Coruja', desc: 'Quem estuda de madrugada tem companhia. 🦉', raridade: 'raro', nivel: 7, precoSeeds: 140 },
  { id: 'ras-lofi', tipo: 'rastro', alvo: 'gen:coracoes:lo-fi', nome: 'Rastro Lo-fi', desc: 'Corações em roxo sereno, para estudar horas.', raridade: 'raro', nivel: 7, precoSeeds: 140 },

  { id: 'pack-noite', tipo: 'pack', alvo: 'noite', nome: 'Pack Noite', desc: '🌙 ⭐ ✨ 🌌 🦉 🌠 💤', raridade: 'raro', nivel: 8, precoSeeds: 140 },
  { id: 'pack-viagem', tipo: 'pack', alvo: 'viagem', nome: 'Pack Viagem', desc: '✈️ 🚂 ⛵ 🗺️ 🧳 🏝️ 🎒', raridade: 'raro', nivel: 8, precoSeeds: 140 },
  { id: 'pack-clima', tipo: 'pack', alvo: 'clima', nome: 'Pack Clima', desc: '☀️ 🌧️ ⛈️ 🌈 ❄️ ☁️ 🌪️', raridade: 'raro', nivel: 8, precoSeeds: 140 },
  { id: 'cur-borboleta', tipo: 'cursor', alvo: 'borboleta', nome: 'Cursor Borboleta', desc: 'Leve, e some quando você para. 🦋', raridade: 'epico', nivel: 8, precoSeeds: 220 },
  { id: 'ras-arcade', tipo: 'rastro', alvo: 'gen:pixel:arcade', nome: 'Rastro Arcade', desc: 'Quadradinhos em néon magenta, direto dos anos 80.', raridade: 'epico', nivel: 8, precoSeeds: 230 },

  { id: 'pack-medieval', tipo: 'pack', alvo: 'medieval', nome: 'Pack Medieval', desc: '⚔️ 🛡️ 🏰 👑 🐉 🗝️ 🏹', raridade: 'epico', nivel: 9, precoSeeds: 240 },
  { id: 'pack-circo', tipo: 'pack', alvo: 'circo', nome: 'Pack Circo', desc: '🎪 🎠 🤹 🎈 🍿 🎭 🎩', raridade: 'epico', nivel: 9, precoSeeds: 240 },
  { id: 'cur-dragao', tipo: 'cursor', alvo: 'dragao', nome: 'Cursor Dragão', desc: 'O ponteiro que guarda o tesouro. 🐉', raridade: 'epico', nivel: 9, precoSeeds: 250 },
  { id: 'cur-unicornio', tipo: 'cursor', alvo: 'unicornio', nome: 'Cursor Unicórnio', desc: 'Raro como acertar tudo de primeira. 🦄', raridade: 'epico', nivel: 9, precoSeeds: 250 },
  { id: 'ras-esmeralda', tipo: 'rastro', alvo: 'gen:faisca:deep-emerald', nome: 'Rastro Esmeralda', desc: 'Faíscas verdes profundas atrás do cursor.', raridade: 'epico', nivel: 9, precoSeeds: 250 },
  { id: 'ras-menta', tipo: 'rastro', alvo: 'gen:arcoiris:menta-fresca', nome: 'Rastro Menta', desc: 'Bolinhas verde-menta, claras e leves.', raridade: 'epico', nivel: 9, precoSeeds: 250 },

  { id: 'pack-gala', tipo: 'pack', alvo: 'gala', nome: 'Pack Gala', desc: '🎩 🥂 🎭 💫 🕯️ 🪩 🎼', raridade: 'epico', nivel: 10, precoSeeds: 260 },
  { id: 'pack-lendas', tipo: 'pack', alvo: 'lendas', nome: 'Pack Lendas', desc: '🐉 🦄 🔱 ⚡ 🧙 🗿 🔥', raridade: 'lendario', nivel: 10, precoSeeds: 450 },
  { id: 'cur-tridente', tipo: 'cursor', alvo: 'tridente', nome: 'Cursor Tridente', desc: 'O ponteiro dos mares. 🔱', raridade: 'lendario', nivel: 10, precoSeeds: 400 },
  { id: 'cur-raio', tipo: 'cursor', alvo: 'raio', nome: 'Cursor Raio', desc: 'Rápido como quem já sabe a resposta. ⚡', raridade: 'lendario', nivel: 10, precoSeeds: 400 },
  { id: 'ras-ametista', tipo: 'rastro', alvo: 'gen:estrelas:amethyst-night', nome: 'Rastro Ametista', desc: 'Estrelas roxas na noite — o mais raro da trilha.', raridade: 'lendario', nivel: 10, precoSeeds: 420 },
  { id: 'ras-ouro', tipo: 'rastro', alvo: 'gen:faisca:sunset-gold', nome: 'Rastro Ouro', desc: 'Faíscas douradas de fim de tarde.', raridade: 'lendario', nivel: 10, precoSeeds: 420 },

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
  { id: 'dourada-1', tipo: 'particulas', alvo: 'estrelas', nome: 'Faíscas Douradas', desc: 'A explosão de acerto em ouro velho. ✨', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 10 },
  { id: 'dourada-2', tipo: 'rastro', alvo: 'gen:faisca:sunset-gold', nome: 'Rastro Dourado', desc: 'Ouro escorrendo do cursor.', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 20 },
  { id: 'dourada-3', tipo: 'cursor', alvo: 'coroa', nome: 'Ponteiro de Ouro', desc: 'A coroa, em dourado. 👑', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 30 },
  { id: 'dourada-4', tipo: 'rastro', alvo: 'gen:estrelas:ouro-neon', nome: 'Estrelas de Ouro', desc: 'Estrelas douradas sobre o escuro.', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 40 },
  { id: 'dourada-5', tipo: 'pack', alvo: 'tesouros', nome: 'Pack Tesouro Dourado', desc: '💎 👑 🏆 🪙 ⭐ 🔱', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 50 },
  { id: 'dourada-6', tipo: 'rastro', alvo: 'gen:pixel:ouro-escuro', nome: 'Pixel Dourado', desc: 'Quadradinhos de ouro, estilo arcade.', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 60 },
  { id: 'dourada-7', tipo: 'cursor', alvo: 'tridente', nome: 'Tridente de Ouro', desc: 'O ponteiro dos mares, em ouro. 🔱', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 70 },
  { id: 'dourada-8', tipo: 'rastro', alvo: 'gen:coracoes:ouro-pastel', nome: 'Corações de Ouro', desc: 'Corações dourados, discretos.', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 80 },
  { id: 'dourada-9', tipo: 'particulas', alvo: 'confete', nome: 'Confete Dourado', desc: 'Papel picado de ouro em cada acerto.', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 90 },
  { id: 'dourada-10', tipo: 'rastro', alvo: 'gen:arcoiris:sunset-gold', nome: 'Aurora Dourada', desc: 'O último marco da temporada — bolinhas de ouro.', raridade: 'lendario', nivel: 1, precoCreditos: 150, exclusivoDoPasse: 100 },
];
