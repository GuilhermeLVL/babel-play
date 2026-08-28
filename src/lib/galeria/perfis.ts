/**
 * PERFIS DE PERSONALIZAÇÃO — o "tudo de pato", o "tudo de coração", e o SEU.
 *
 * Um perfil é a combinação completa: paleta (ou tema), fonte, partículas, pack de emojis, cursor,
 * rastro. Os PRESETS são montados por nós, tematizados de ponta a ponta; os PERSONALIZADOS a
 * pessoa monta no editor e salva com nome (localStorage `babel.perfis`). Aplicar um perfil é só
 * chamar os mesmos setters que a Loja e os Ajustes já usam — o perfil não é um segundo dono da
 * aparência.
 */
import type { FonteType, ThemeType } from '../appearance';
import type { ParticulasType } from '../particulas';

export interface Perfil {
  id: string;
  nome: string;
  emoji: string;
  desc: string;
  /** Tema nativo OU paleta da galeria (aplicada como tema `custom`). */
  tema?: ThemeType;
  paleta?: string;
  fonte: FonteType;
  particulas: ParticulasType;
  /** Pack nativo (`classico`, `animais`...) ou lista de emojis (vira o pack personalizado). */
  pack: string | string[];
  cursor: string;
  rastro: string;
  /** Presets são nossos; os salvos pela pessoa têm `proprio: true`. */
  proprio?: boolean;
}

export const PRESETS: Perfil[] = [
  { id: 'pato', nome: 'Tudo de pato', emoji: '🦆', desc: 'Amarelo de borracha, patos por todo lado, cursor de pato.', paleta: 'pato-de-borracha', fonte: 'padrao', particulas: 'emoji', pack: ['🦆', '🐤', '🐥', '🐣', '🪿'], cursor: 'pato', rastro: 'emojis:🦆,🐤' },
  { id: 'coracao', nome: 'Tudo de coração', emoji: '💖', desc: 'Rosa de mel, corações subindo em cada acerto, rastro de corações.', paleta: 'coracao-de-mel', fonte: 'padrao', particulas: 'coracoes', pack: ['❤️', '💖', '💗', '💞', '💕', '🧡'], cursor: 'emoji:💘', rastro: 'gen:coracoes:coracao-de-mel' },
  { id: 'arcade', nome: 'Arcade', emoji: '👾', desc: 'Néon magenta, fonte pixel, partículas quadradas, invader no ponteiro.', paleta: 'arcade', fonte: 'pixel', particulas: 'pixel', pack: ['👾', '🕹️', '🎮', '⭐', '💥'], cursor: 'invader', rastro: 'gen:pixel:arcade' },
  { id: 'espaco', nome: 'Espaço sideral', emoji: '🚀', desc: 'Meia-noite índigo, chuva de planetas, foguete no ponteiro.', paleta: 'espaco-sideral', fonte: 'padrao', particulas: 'emoji', pack: 'espaco', cursor: 'foguete', rastro: 'gen:estrelas:espaco-sideral' },
  { id: 'pizzaria', nome: 'Pizzaria', emoji: '🍕', desc: 'Papel quente e vermelho, chuva de comida, pizza no ponteiro.', paleta: 'pizza', fonte: 'padrao', particulas: 'emoji', pack: 'comidas', cursor: 'pizza', rastro: 'emojis:🍕,🍔,🌮' },
  { id: 'floresta', nome: 'Floresta', emoji: '🌿', desc: 'Verde escuro, natureza em cada acerto, faíscas verdes.', paleta: 'floresta', fonte: 'padrao', particulas: 'emoji', pack: 'natureza', cursor: 'emoji:🍀', rastro: 'gen:faisca:floresta' },
  { id: 'oceano', nome: 'Oceano', emoji: '🌊', desc: 'Azul profundo, bichos do mar, bolinhas na cor do mar.', paleta: 'oceano-profundo', fonte: 'padrao', particulas: 'emoji', pack: ['🐬', '🐳', '🐙', '🐠', '🐟', '🦈', '🌊'], cursor: 'emoji:🐬', rastro: 'gen:arcoiris:oceano-profundo' },
  { id: 'lofi', nome: 'Lo-fi', emoji: '🎧', desc: 'Roxo sereno, notas musicais, rastro discreto.', paleta: 'lo-fi', fonte: 'padrao', particulas: 'emoji', pack: 'musica', cursor: 'emoji:🎧', rastro: 'gen:faisca:lo-fi' },
  { id: 'halloween', nome: 'Halloween', emoji: '🎃', desc: 'Laranja no escuro, abóboras e fantasmas.', paleta: 'halloween', fonte: 'pixel', particulas: 'emoji', pack: 'arrepio', cursor: 'emoji:🎃', rastro: 'emojis:👻,🎃' },
  { id: 'natal', nome: 'Natal', emoji: '🎄', desc: 'Papel verde e vermelho, neve e presentes.', paleta: 'natal', fonte: 'padrao', particulas: 'emoji', pack: ['🎄', '🎁', '❄️', '⛄', '🔔', '⭐'], cursor: 'emoji:🎁', rastro: 'emojis:❄️,✨' },
  /* Os três abaixo são LIVRES no nível 1 (só paleta clara/papel + o que já vem de fábrica): são a
     porta de entrada dos perfis — quem chega já troca o visual inteiro com um toque. */
  { id: 'praia', nome: 'Praia', emoji: '🏖️', desc: 'Areia e turquesa. Leve, para começar.', paleta: 'praia', fonte: 'padrao', particulas: 'tema', pack: 'classico', cursor: 'padrao', rastro: 'off' },
  { id: 'cafe', nome: 'Café', emoji: '☕', desc: 'Tons de café e papel, discreto para estudar horas.', paleta: 'cafe', fonte: 'padrao', particulas: 'tema', pack: 'classico', cursor: 'padrao', rastro: 'off' },
  { id: 'minimal', nome: 'Minimal', emoji: '⬜', desc: 'Atelier claro, sem rastro. Só o estudo.', paleta: 'babel-atelier', fonte: 'padrao', particulas: 'tema', pack: 'classico', cursor: 'padrao', rastro: 'off' },
  { id: 'menta', nome: 'Menta fresca', emoji: '🌿', desc: 'Verde-menta claro, partículas do tema.', paleta: 'menta-fresca', fonte: 'padrao', particulas: 'tema', pack: 'classico', cursor: 'padrao', rastro: 'off' },
  { id: 'grafite', nome: 'Grafite', emoji: '⬛', desc: 'Escuro e neutro, sem partículas, sem rastro.', paleta: 'grafite', fonte: 'padrao', particulas: 'tema', pack: 'classico', cursor: 'padrao', rastro: 'off' },
  { id: 'festa', nome: 'Festa', emoji: '🎉', desc: 'Confete em tudo, balões e bolo.', paleta: 'lilas-pastel', fonte: 'padrao', particulas: 'confete', pack: 'festa', cursor: 'emoji:🎈', rastro: 'gen:pixel:lilas-pastel' },
  { id: 'esportes', nome: 'Esportes', emoji: '🏆', desc: 'Verde de campo, bolas e troféus.', paleta: 'verde-claro', fonte: 'padrao', particulas: 'emoji', pack: 'esportes', cursor: 'emoji:⚽', rastro: 'emojis:⚽,🏀,🏆' },
  { id: 'tesouro', nome: 'Tesouro', emoji: '💎', desc: 'Ouro no escuro, gemas e coroas.', paleta: 'ouro-meia-noite', fonte: 'padrao', particulas: 'emoji', pack: 'tesouros', cursor: 'emoji:💎', rastro: 'gen:estrelas:ouro-meia-noite' },
];

const CHAVE = 'babel.perfis';

export function perfisSalvos(): Perfil[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE) || '[]') as Perfil[];
    return Array.isArray(lista) ? lista.filter((p) => p && typeof p.id === 'string').map((p) => ({ ...p, proprio: true })) : [];
  } catch { return []; }
}

export function salvarPerfil(p: Omit<Perfil, 'id' | 'proprio'> & { id?: string }): Perfil {
  const lista = perfisSalvos();
  const id = p.id ?? `meu-${Date.now().toString(36)}`;
  const novo: Perfil = { ...p, id, proprio: true };
  const semEle = lista.filter((x) => x.id !== id);
  try { localStorage.setItem(CHAVE, JSON.stringify([novo, ...semEle].slice(0, 30))); } catch { /* sem storage */ }
  return novo;
}

export function apagarPerfil(id: string): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(perfisSalvos().filter((x) => x.id !== id))); } catch { /* sem storage */ }
}
