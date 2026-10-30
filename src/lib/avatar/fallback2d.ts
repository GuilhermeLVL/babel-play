/**
 * O FALLBACK 2D: sem WebGL2, com erro de carga ou com o contexto perdido, o avatar vira a foto do perfil (que
 * já vive só neste aparelho) ou, sem foto, as iniciais. Este módulo só DESCREVE; quem desenha é a UI.
 */
import { lerFoto } from '../fotoDoPerfil';

export type MotivoDoFallback =
  | 'sem_webgl2'
  | 'carregando'
  | 'erro_de_carga'
  | 'contexto_perdido'
  | 'tier_minimo'
  | 'sem_modelo';

export type DescritorDoFallback =
  | { tipo: 'foto'; src: string; motivo: MotivoDoFallback }
  | { tipo: 'iniciais'; texto: string; motivo: MotivoDoFallback };

/** Até duas letras: a inicial da primeira e da última palavra do nome. Sem nome: "?". */
export function iniciaisDe(nome: string | null | undefined): string {
  const palavras = (nome ?? '')
    .normalize('NFC')
    .split(/\s+/)
    .filter((p) => /[\p{L}\p{N}]/u.test(p));
  if (palavras.length === 0) return '?';
  const inicial = (p: string) => Array.from(p.replace(/^[^\p{L}\p{N}]+/u, ''))[0]?.toLocaleUpperCase() ?? '';
  const primeira = inicial(palavras[0]);
  const ultima = palavras.length > 1 ? inicial(palavras[palavras.length - 1]) : '';
  return primeira + ultima || '?';
}

/** `data:image/` é o único formato que `reduzirFoto` grava; qualquer outra coisa no armazenamento é ignorada. */
const ehFotoLocal = (v: string | null): v is string => !!v && /^data:image\/(jpeg|png|webp);base64,/.test(v);

export function descritorDoFallback(opcoes: {
  usuario?: string | null;
  nome?: string | null;
  motivo: MotivoDoFallback;
}): DescritorDoFallback {
  const foto = lerFoto(opcoes.usuario);
  if (ehFotoLocal(foto)) return { tipo: 'foto', src: foto, motivo: opcoes.motivo };
  return { tipo: 'iniciais', texto: iniciaisDe(opcoes.nome), motivo: opcoes.motivo };
}
