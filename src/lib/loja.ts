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

export interface ItemDaLoja {
  id: string;
  tipo: TipoDesbloqueavel | 'particulas';
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
  // ── POSIÇÕES DO MENU ──
  { id: 'pos-direita', tipo: 'posicao', alvo: 'right', nome: 'Menu à direita', desc: 'Navegação no lado direito.', raridade: 'comum', nivel: 3, precoSeeds: 30 },
  { id: 'pos-baixo', tipo: 'posicao', alvo: 'bottom', nome: 'Menu embaixo', desc: 'Estilo dock, embaixo.', raridade: 'comum', nivel: 3, precoSeeds: 30 },
  // ── PARTÍCULAS (equipam via setParticulas) ──
  { id: 'part-pixel', tipo: 'particulas', alvo: 'pixel', nome: 'Partículas Pixel', desc: 'Quadradinhos 8-bits em cada acerto.', raridade: 'comum', nivel: 2, precoSeeds: 30 },
  { id: 'part-confete', tipo: 'particulas', alvo: 'confete', nome: 'Partículas Confete', desc: 'Papel picado girando.', raridade: 'comum', nivel: 3, precoSeeds: 40 },
  { id: 'part-coracoes', tipo: 'particulas', alvo: 'coracoes', nome: 'Partículas Corações', desc: 'Corações subindo a cada acerto.', raridade: 'raro', nivel: 5, precoSeeds: 90 },
  { id: 'part-estrelas', tipo: 'particulas', alvo: 'estrelas', nome: 'Partículas Estrelas', desc: 'Estrelinhas brilhantes ⭐✨.', raridade: 'epico', nivel: 7, precoSeeds: 180 },
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
  if (item.tipo === 'particulas') return true; // partículas só existem na loja
  return nivelNecessario(item.tipo, item.alvo) === item.nivel;
}
