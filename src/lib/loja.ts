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
import { nivelNecessario, liberadoTudo, type TipoDesbloqueavel } from './desbloqueios';

export type Raridade = 'comum' | 'raro' | 'epico' | 'lendario';

/** Tipos além dos desbloqueáveis clássicos: packs de emoji, cursores, rastro do mouse e os
 *  APRIMORAMENTOS (upgrades com barra de progressão — ver lib/aprimoramentos). */
export type TipoDaLoja = TipoDesbloqueavel | 'particulas' | 'pack' | 'cursor' | 'rastro' | 'aprimoramento';

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
}

export const CATALOGO_DA_LOJA: ItemDaLoja[] = [
  // ── TEMAS (equipam via persistTheme) ──
  { id: 'tema-babel', tipo: 'tema', alvo: 'babel', nome: 'Babel Atelier', desc: 'O tema da casa: terracota quente.', raridade: 'comum', nivel: 1, previa: ['#F4F1E8', '#FFFFFF', '#F04E23', '#26241F'] },
  { id: 'tema-linear', tipo: 'tema', alvo: 'linear', nome: 'Linear Indigo', desc: 'Índigo elegante e geométrico.', raridade: 'comum', nivel: 2, precoSeeds: 40, previa: ['#F7F8FB', '#FFFFFF', '#5E6AD2', '#1F2023'] },
  { id: 'tema-vercel', tipo: 'tema', alvo: 'vercel', nome: 'Vercel Geist', desc: 'Monocromático, cantos retos, frio.', raridade: 'raro', nivel: 4, precoSeeds: 80, previa: ['#FAFAFA', '#FFFFFF', '#171717', '#171717'] },
  { id: 'tema-mochi', tipo: 'tema', alvo: 'mochi', nome: 'Mochi Parchment', desc: 'Everforest orgânico, arredondado.', raridade: 'raro', nivel: 6, precoSeeds: 120, previa: ['#F2EFDF', '#FDF6E3', '#8DA101', '#5C6A72'] },
  { id: 'tema-notion', tipo: 'tema', alvo: 'notion', nome: 'Notion Charcoal', desc: 'Carvão sóbrio, tipográfico.', raridade: 'raro', nivel: 7, precoSeeds: 150, previa: ['#F7F6F3', '#FFFFFF', '#37352F', '#37352F'] },
  { id: 'tema-premium', tipo: 'tema', alvo: 'premium', nome: 'Instrument Premium', desc: 'Sofisticado, sereno, raro.', raridade: 'epico', nivel: 8, precoSeeds: 220, previa: ['#101418', '#161C22', '#C7A76C', '#E8E3D9'] },
  { id: 'tema-custom', tipo: 'tema', alvo: 'custom', nome: 'Tema Customizado', desc: 'Suas cores, suas regras.', raridade: 'lendario', nivel: 10, precoSeeds: 400 },
  // ── ESTÚDIO ──
  { id: 'estudio', tipo: 'estudio', alvo: 'abrir', nome: 'Estúdio de Cores & Layout', desc: 'O editor completo: paleta, painéis, tudo na sua mão.', raridade: 'lendario', nivel: 10, precoSeeds: 400 },
  // ── POSIÇÕES DO MENU (topo/esquerda SEMPRE livres: equipar direita/baixo nunca tranca a
  //    pessoa fora do layout padrão — era um beco sem saída real, 2026-08-27) ──
  { id: 'pos-topo', tipo: 'posicao', alvo: 'top', nome: 'Menu no topo', desc: 'A barra clássica, em cima.', raridade: 'comum', nivel: 1 },
  { id: 'pos-esquerda', tipo: 'posicao', alvo: 'left', nome: 'Menu à esquerda', desc: 'O padrão da casa.', raridade: 'comum', nivel: 1 },
  { id: 'pos-direita', tipo: 'posicao', alvo: 'right', nome: 'Menu à direita', desc: 'Navegação no lado direito.', raridade: 'comum', nivel: 3, precoSeeds: 30 },
  { id: 'pos-baixo', tipo: 'posicao', alvo: 'bottom', nome: 'Menu embaixo', desc: 'Estilo dock, embaixo.', raridade: 'comum', nivel: 3, precoSeeds: 30 },
  // ── PARTÍCULAS (equipam via setParticulas) ──
  { id: 'part-pixel', tipo: 'particulas', alvo: 'pixel', nome: 'Partículas Pixel', desc: 'Quadradinhos 8-bits em cada acerto.', raridade: 'comum', nivel: 2, precoSeeds: 30 },
  { id: 'part-confete', tipo: 'particulas', alvo: 'confete', nome: 'Partículas Confete', desc: 'Papel picado girando.', raridade: 'comum', nivel: 3, precoSeeds: 40 },
  { id: 'part-coracoes', tipo: 'particulas', alvo: 'coracoes', nome: 'Partículas Corações', desc: 'Corações subindo a cada acerto.', raridade: 'raro', nivel: 5, precoSeeds: 90 },
  { id: 'part-estrelas', tipo: 'particulas', alvo: 'estrelas', nome: 'Partículas Estrelas', desc: 'Estrelinhas brilhantes ⭐✨.', raridade: 'epico', nivel: 7, precoSeeds: 180 },
  { id: 'part-emoji', tipo: 'particulas', alvo: 'emoji', nome: 'Chuva de Emojis', desc: 'Cada acerto chove o PACK de emojis equipado.', raridade: 'raro', nivel: 4, precoSeeds: 90 },
  // ── APRIMORAMENTOS (progressão Nv.0-3 com barra; ver lib/aprimoramentos) ──
  { id: 'apr-particulas', tipo: 'aprimoramento', alvo: 'particulas', nome: 'Explosão de Partículas', desc: 'Cada nível: mais partículas e maiores. Depois de dominar, a intensidade é sua (pequena/média/grande).', raridade: 'epico', nivel: 1 },
  { id: 'apr-sorte', tipo: 'aprimoramento', alvo: 'sorte', nome: 'Sorte de Eventos Raros', desc: 'Cada nível aumenta a chance de patos, corações, glitch e cia. aparecerem.', raridade: 'epico', nivel: 1 },
  // ── PACKS DE EMOJI (alimentam a Chuva de Emojis, o rastro e os fallbacks) ──
  { id: 'pack-classico', tipo: 'pack', alvo: 'classico', nome: 'Pack Clássico', desc: '⭐ ✨ 💫 🌟', raridade: 'comum', nivel: 1 },
  { id: 'pack-animais', tipo: 'pack', alvo: 'animais', nome: 'Pack Animais', desc: '🦆 🐱 🐶 🦊 🐸 🐼 🦜', raridade: 'comum', nivel: 2, precoSeeds: 40 },
  { id: 'pack-comidas', tipo: 'pack', alvo: 'comidas', nome: 'Pack Comidas', desc: '🍕 🍔 🍩 🍦 🌮 🍓 🍿', raridade: 'comum', nivel: 2, precoSeeds: 40 },
  { id: 'pack-natureza', tipo: 'pack', alvo: 'natureza', nome: 'Pack Natureza', desc: '🌸 🍀 🌈 ☀️ 🌊 🍁 🌵', raridade: 'comum', nivel: 3, precoSeeds: 50 },
  { id: 'pack-festa', tipo: 'pack', alvo: 'festa', nome: 'Pack Festa', desc: '🎉 🎊 🎈 🥳 🪅 🎁 🎂', raridade: 'raro', nivel: 4, precoSeeds: 70 },
  { id: 'pack-musica', tipo: 'pack', alvo: 'musica', nome: 'Pack Música', desc: '🎵 🎶 🎸 🎤 🥁 🎹 🎧', raridade: 'raro', nivel: 4, precoSeeds: 70 },
  { id: 'pack-esportes', tipo: 'pack', alvo: 'esportes', nome: 'Pack Esportes', desc: '⚽ 🏀 🏐 🏆 🎮 🥇 🏁', raridade: 'raro', nivel: 5, precoSeeds: 80 },
  { id: 'pack-espaco', tipo: 'pack', alvo: 'espaco', nome: 'Pack Espaço', desc: '🚀 🪐 👽 ☄️ 🌌 🛸', raridade: 'epico', nivel: 6, precoSeeds: 120 },
  { id: 'pack-arrepio', tipo: 'pack', alvo: 'arrepio', nome: 'Pack Arrepio', desc: '🎃 👻 💀 🦇 🕷️ 🧟', raridade: 'epico', nivel: 7, precoSeeds: 140 },
  { id: 'pack-brasil', tipo: 'pack', alvo: 'brasil', nome: 'Pack Brasil', desc: '🇧🇷 ⚽ 🏖️ 🦜 ☕ 🌴', raridade: 'raro', nivel: 3, precoSeeds: 60 },
  { id: 'pack-tesouros', tipo: 'pack', alvo: 'tesouros', nome: 'Pack Tesouros', desc: '💎 👑 🪙 💰 🔮', raridade: 'lendario', nivel: 9, precoSeeds: 300 },
  // ── CURSORES ──
  { id: 'cur-padrao', tipo: 'cursor', alvo: 'padrao', nome: 'Cursor do sistema', desc: 'O de sempre — volta atrás garantida.', raridade: 'comum', nivel: 1 },
  { id: 'cur-mira', tipo: 'cursor', alvo: 'mira', nome: 'Cursor Mira', desc: 'Precisão de sniper. 🎯', raridade: 'comum', nivel: 2, precoSeeds: 40 },
  { id: 'cur-pato', tipo: 'cursor', alvo: 'pato', nome: 'Cursor Pato', desc: 'Um pato de borracha aponta por você. 🦆', raridade: 'raro', nivel: 3, precoSeeds: 60 },
  { id: 'cur-varinha', tipo: 'cursor', alvo: 'varinha', nome: 'Cursor Varinha', desc: 'Cada clique é um feitiço. 🪄', raridade: 'raro', nivel: 4, precoSeeds: 80 },
  { id: 'cur-pizza', tipo: 'cursor', alvo: 'pizza', nome: 'Cursor Pizza', desc: 'Fome de conhecimento. 🍕', raridade: 'raro', nivel: 5, precoSeeds: 90 },
  { id: 'cur-fogo', tipo: 'cursor', alvo: 'fogo', nome: 'Cursor Fogo', desc: 'Na brasa. 🔥', raridade: 'epico', nivel: 6, precoSeeds: 130 },
  { id: 'cur-espada', tipo: 'cursor', alvo: 'espada', nome: 'Cursor Espada', desc: 'Corta a interface. ⚔️', raridade: 'epico', nivel: 7, precoSeeds: 150 },
  { id: 'cur-foguete', tipo: 'cursor', alvo: 'foguete', nome: 'Cursor Foguete', desc: 'Decolagem. 🚀', raridade: 'epico', nivel: 8, precoSeeds: 180 },
  { id: 'cur-invader', tipo: 'cursor', alvo: 'invader', nome: 'Cursor Invader', desc: '8-bits até no ponteiro. 👾', raridade: 'lendario', nivel: 9, precoSeeds: 280 },
  // ── RASTRO DO MOUSE ──
  { id: 'ras-off', tipo: 'rastro', alvo: 'off', nome: 'Rastro desligado', desc: 'Mouse limpo, zero partícula.', raridade: 'comum', nivel: 1 },
  { id: 'ras-faisca', tipo: 'rastro', alvo: 'faisca', nome: 'Rastro Faíscas', desc: 'Faíscas seguindo o cursor; clique solta uma mini-explosão.', raridade: 'raro', nivel: 3, precoSeeds: 70 },
  { id: 'ras-estrelas', tipo: 'rastro', alvo: 'estrelas', nome: 'Rastro Estrelas', desc: '⭐ atrás do mouse.', raridade: 'raro', nivel: 4, precoSeeds: 80 },
  { id: 'ras-coracoes', tipo: 'rastro', alvo: 'coracoes', nome: 'Rastro Corações', desc: 'Corações por onde você passa.', raridade: 'epico', nivel: 5, precoSeeds: 110 },
  { id: 'ras-pixel', tipo: 'rastro', alvo: 'pixel', nome: 'Rastro Pixel', desc: 'Quadradinhos 8-bits no caminho.', raridade: 'epico', nivel: 6, precoSeeds: 120 },
  { id: 'ras-emoji', tipo: 'rastro', alvo: 'emoji', nome: 'Rastro Emoji', desc: 'O pack equipado escorrendo do cursor.', raridade: 'lendario', nivel: 8, precoSeeds: 220 },
];

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

export type EstadoDoItem = 'equipavel' | 'compravel' | 'bloqueado';

/** Um item está disponível se: liberou tudo, OU nível alcançado, OU comprado com Seeds. */
export function estadoDoItem(item: ItemDaLoja, nivel: number, saldoSeeds: number): {
  estado: EstadoDoItem; motivo?: string;
} {
  if (liberadoTudo() || nivel >= item.nivel || possuidos().has(item.id)) return { estado: 'equipavel' };
  if (item.precoSeeds !== undefined && saldoSeeds >= item.precoSeeds) return { estado: 'compravel' };
  if (item.precoSeeds !== undefined) return { estado: 'bloqueado', motivo: `Nível ${item.nivel} ou ${item.precoSeeds} Seeds` };
  return { estado: 'bloqueado', motivo: `Nível ${item.nivel}` };
}

/** Itens que o nível N (próximo) vai liberar — a vitrine de "continue jogando". */
export function vitrineDoProximoNivel(nivelAtual: number): ItemDaLoja[] {
  const proximos = CATALOGO_DA_LOJA.filter((i) => i.nivel > nivelAtual);
  const menorNivel = Math.min(...proximos.map((i) => i.nivel));
  return Number.isFinite(menorNivel) ? proximos.filter((i) => i.nivel === menorNivel) : [];
}

export const COR_DA_RARIDADE: Record<Raridade, { borda: string; fundo: string; rotulo: string }> = {
  comum: { borda: 'border-border-subtle', fundo: 'bg-surface', rotulo: 'Comum' },
  raro: { borda: 'border-[#4C9AFF]', fundo: 'bg-[#4C9AFF]/10', rotulo: 'Raro' },
  epico: { borda: 'border-[#A66CFF]', fundo: 'bg-[#A66CFF]/10', rotulo: 'Épico' },
  lendario: { borda: 'border-warn', fundo: 'bg-warn/10', rotulo: 'Lendário' },
};

/** Consistência com o catálogo de níveis do `desbloqueios` (teste trava). */
export function nivelCoerente(item: ItemDaLoja): boolean {
  if (item.tipo !== 'tema' && item.tipo !== 'fonte' && item.tipo !== 'posicao' && item.tipo !== 'estudio') return true; // vivem só na loja
  return nivelNecessario(item.tipo, item.alvo) === item.nivel;
}
