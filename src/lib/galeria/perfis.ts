/**
 * PERFIS DE PERSONALIZAÇÃO — o "tudo de pato", o "tudo de coração", e o SEU.
 *
 * Um perfil é a combinação completa: paleta (ou tema), fonte, partículas e rastro. Pack de emojis
 * e cursor saíram nas recompensas v2 (27/09); perfil salvo antes com esses campos continua
 * aplicável — os campos a mais são ignorados (inclusive o `emoji` antigo: o ícone agora é lucide,
 * e o perfil salvo sem `icone` ganha o brilho). Os PRESETS são montados por nós, tematizados de ponta a ponta; os PERSONALIZADOS a
 * pessoa monta no editor e salva com nome (localStorage `babel.perfis`). Aplicar um perfil é só
 * chamar os mesmos setters que a Loja e os Ajustes já usam — o perfil não é um segundo dono da
 * aparência.
 */
import type { FonteType, ThemeType } from '../appearance';
import type { ParticulasType } from '../particulas';

/** Os ícones dos perfis — nomes nossos, mapeados para lucide na tela (este módulo não carrega ícone). */
export type IconeDoPerfil =
  | 'passaro' | 'coracao' | 'controle' | 'foguete' | 'pizza' | 'arvores' | 'ondas' | 'fones' | 'fantasma'
  | 'pinheiro' | 'sol' | 'cafe' | 'quadrado' | 'folha' | 'lua' | 'festa' | 'trofeu' | 'gema' | 'brilho';

export interface Perfil {
  id: string;
  nome: string;
  /** O ícone do perfil (lucide, desenhado em `Inventario.tsx`). Sem emoji na interface. */
  icone: IconeDoPerfil;
  desc: string;
  /** Tema nativo OU paleta da galeria (aplicada como tema `custom`). */
  tema?: ThemeType;
  paleta?: string;
  fonte: FonteType;
  particulas: ParticulasType;
  rastro: string;
  /** Presets são nossos; os salvos pela pessoa têm `proprio: true`. */
  proprio?: boolean;
}

export const PRESETS: Perfil[] = [
  { id: 'pato', nome: 'Tudo de pato', icone: 'passaro', desc: 'Amarelo de borracha, patos por todo lado.', paleta: 'pato-de-borracha', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:faisca:pato-de-borracha' },
  { id: 'coracao', nome: 'Tudo de coração', icone: 'coracao', desc: 'Rosa de mel, corações subindo em cada acerto, rastro de corações.', paleta: 'coracao-de-mel', fonte: 'padrao', particulas: 'coracoes', rastro: 'gen:coracoes:coracao-de-mel' },
  { id: 'arcade', nome: 'Arcade', icone: 'controle', desc: 'Néon magenta, fonte pixel, partículas quadradas.', paleta: 'arcade', fonte: 'pixel', particulas: 'pixel', rastro: 'gen:pixel:arcade' },
  { id: 'espaco', nome: 'Espaço sideral', icone: 'foguete', desc: 'Meia-noite índigo, chuva de planetas.', paleta: 'espaco-sideral', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:estrelas:espaco-sideral' },
  { id: 'pizzaria', nome: 'Pizzaria', icone: 'pizza', desc: 'Papel quente e vermelho, chuva de comida.', paleta: 'pizza', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:pixel:pizza' },
  { id: 'floresta', nome: 'Floresta', icone: 'arvores', desc: 'Verde escuro, natureza em cada acerto, faíscas verdes.', paleta: 'floresta', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:faisca:floresta' },
  { id: 'oceano', nome: 'Oceano', icone: 'ondas', desc: 'Azul profundo, bichos do mar, bolinhas na cor do mar.', paleta: 'oceano-profundo', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:arcoiris:oceano-profundo' },
  { id: 'lofi', nome: 'Lo-fi', icone: 'fones', desc: 'Roxo sereno, notas musicais, rastro discreto.', paleta: 'lo-fi', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:faisca:lo-fi' },
  { id: 'halloween', nome: 'Halloween', icone: 'fantasma', desc: 'Laranja no escuro, abóboras e fantasmas.', paleta: 'halloween', fonte: 'pixel', particulas: 'estrelas', rastro: 'gen:faisca:halloween' },
  { id: 'natal', nome: 'Natal', icone: 'pinheiro', desc: 'Papel verde e vermelho, neve e presentes.', paleta: 'natal', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:estrelas:natal' },
  /* Os três abaixo são LIVRES no nível 1 (só paleta clara/papel + o que já vem de fábrica): são a
     porta de entrada dos perfis — quem chega já troca o visual inteiro com um toque. */
  { id: 'praia', nome: 'Praia', icone: 'sol', desc: 'Areia e turquesa. Leve, para começar.', paleta: 'praia', fonte: 'padrao', particulas: 'tema', rastro: 'off' },
  { id: 'cafe', nome: 'Café', icone: 'cafe', desc: 'Tons de café e papel, discreto para estudar horas.', paleta: 'cafe', fonte: 'padrao', particulas: 'tema', rastro: 'off' },
  { id: 'minimal', nome: 'Minimal', icone: 'quadrado', desc: 'Atelier claro, sem rastro. Só o estudo.', paleta: 'babel-atelier', fonte: 'padrao', particulas: 'tema', rastro: 'off' },
  { id: 'menta', nome: 'Menta fresca', icone: 'folha', desc: 'Verde-menta claro, partículas do tema.', paleta: 'menta-fresca', fonte: 'padrao', particulas: 'tema', rastro: 'off' },
  { id: 'grafite', nome: 'Grafite', icone: 'lua', desc: 'Escuro e neutro, sem partículas, sem rastro.', paleta: 'grafite', fonte: 'padrao', particulas: 'tema', rastro: 'off' },
  { id: 'festa', nome: 'Festa', icone: 'festa', desc: 'Confete em tudo, balões e bolo.', paleta: 'lilas-pastel', fonte: 'padrao', particulas: 'confete', rastro: 'gen:pixel:lilas-pastel' },
  { id: 'esportes', nome: 'Esportes', icone: 'trofeu', desc: 'Verde de campo, bolas e troféus.', paleta: 'verde-claro', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:pixel:verde-claro' },
  { id: 'tesouro', nome: 'Tesouro', icone: 'gema', desc: 'Ouro no escuro, gemas e coroas.', paleta: 'ouro-meia-noite', fonte: 'padrao', particulas: 'estrelas', rastro: 'gen:estrelas:ouro-meia-noite' },
];

const CHAVE = 'babel.perfis';

export function perfisSalvos(): Perfil[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE) || '[]') as Perfil[];
    return Array.isArray(lista) ? lista.filter((p) => p && typeof p.id === 'string').map((p) => ({ ...p, icone: p.icone ?? 'brilho', proprio: true })) : [];
  } catch { return []; }
}

export function salvarPerfil(p: Omit<Perfil, 'id' | 'proprio'> & { id?: string }): Perfil {
  const lista = perfisSalvos();
  // Sufixo aleatório: só o timestamp colidia quando dois perfis eram salvos no mesmo
  // milissegundo — o upsert por id engolia o primeiro (pego por teste em 31/08).
  const id = p.id ?? `meu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const novo: Perfil = { ...p, id, proprio: true };
  const semEle = lista.filter((x) => x.id !== id);
  try { localStorage.setItem(CHAVE, JSON.stringify([novo, ...semEle].slice(0, 30))); } catch { /* sem storage */ }
  return novo;
}

/** Renomeia NO LUGAR: mesma combinação, mesma posição na lista — só o nome muda. */
export function renomearPerfil(id: string, nome: string): Perfil | null {
  const limpo = nome.trim();
  if (!limpo) return null;
  const lista = perfisSalvos();
  const alvo = lista.find((x) => x.id === id);
  if (!alvo) return null;
  const novo: Perfil = { ...alvo, nome: limpo };
  try { localStorage.setItem(CHAVE, JSON.stringify(lista.map((x) => (x.id === id ? novo : x)))); } catch { /* sem storage */ }
  return novo;
}

export function apagarPerfil(id: string): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(perfisSalvos().filter((x) => x.id !== id))); } catch { /* sem storage */ }
}
