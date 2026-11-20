/** Os textos curtos que mais de uma peça da Leitura ativa repete. */
import type { RotuloDaCobertura } from '../../../core/leitura/coberturaDoTexto';
import { type FichaDeTexto, nivelNumerico } from '../../../core/leitura/fichaDeTexto';
import { t } from '../../../lib/i18n';

export const rotuloDoNivel = (f: Pick<FichaDeTexto, 'nivel'>) =>
  t('Nível {n} · {cefr}', { n: nivelNumerico(f.nivel), cefr: f.nivel });

export function nomeDoRotulo(r: RotuloDaCobertura): string {
  if (r === 'tranquila') return t('Leitura tranquila');
  if (r === 'desafio') return t('Bom desafio');
  return t('Puxado');
}

/** "~2 min": a leitura de um iniciante, cerca de 100 palavras por minuto. */
export function minutosDoTexto(texto: string): string {
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  return t('~{n} min', { n: Math.max(1, Math.round(palavras / 100)) });
}

export const SELO_DE_ORIGEM = () => t('Criado com IA e revisado por pessoas');

/** O nome da categoria na língua da interface (as categorias do acervo são fixas). */
export function nomeDaCategoria(c: string): string {
  if (c === 'Dia a dia') return t('Dia a dia');
  if (c === 'Histórias') return t('Histórias');
  if (c === 'Mundo') return t('Mundo');
  return c;
}
