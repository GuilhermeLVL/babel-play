/**
 * "MEUS LIVROS" — as regras puras da tela: progresso, status sugerido, tempo restante, busca, filtro e ordem.
 * Sem React, sem rede, sem disco: a posição de leitura vem de quem chama (`posicoes.ler`, no aparelho).
 */
import { casaComBusca } from './catalogo';

export type StatusDeLeitura = 'quero-ler' | 'lendo' | 'lido';

/** A partir daqui o livro conta como terminado (a última página raramente chega a 100%: epílogo, notas). */
export const FRACAO_DE_LIDO = 0.98;

/** A fração (0..1) como porcentagem inteira. Valor inválido vale 0; entre 0 e 1% mostra 1 (já começou). */
export function porcentagemDe(fracao: number | null | undefined): number {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao) || fracao <= 0) return 0;
  if (fracao >= 1) return 100;
  return Math.min(99, Math.max(1, Math.round(fracao * 100)));
}

/**
 * O status que o progresso sugere, ou `null` quando o atual já combina. SUGERE, não impõe: a pessoa pode ter
 * marcado "Lido" no que leu em papel, ou "Quero ler" para reler. Só aponta o que está desatualizado:
 * começou e ainda está em "Quero ler" → "Lendo"; chegou ao fim e não está "Lido" → "Lido".
 */
export function statusSugerido(status: StatusDeLeitura, fracao: number | null | undefined): StatusDeLeitura | null {
  const f = typeof fracao === 'number' && Number.isFinite(fracao) ? fracao : 0;
  if (f >= FRACAO_DE_LIDO) return status === 'lido' ? null : 'lido';
  if (f > 0 && status === 'quero-ler') return 'lendo';
  return null;
}

/** Minutos que faltam, arredondados para cima; `null` sem estimativa do livro. */
export function minutosRestantes(minutosEstimados: number | null | undefined, fracao: number | null | undefined) {
  if (typeof minutosEstimados !== 'number' || !Number.isFinite(minutosEstimados) || minutosEstimados <= 0) return null;
  const f = typeof fracao === 'number' && Number.isFinite(fracao) ? Math.min(1, Math.max(0, fracao)) : 0;
  return Math.ceil(minutosEstimados * (1 - f));
}

export interface ItemParaListar {
  titulo: string;
  autor?: string;
  status: StatusDeLeitura;
  /** Quando foi lido por último (a posição) ou aberto; senão, quando entrou na lista. */
  ultimaAtividade: number;
}

export interface FiltroDeMeusLivros {
  texto?: string;
  status?: StatusDeLeitura | null;
}

/** Busca por título e autor (sem acento nem caixa, termos em qualquer ordem) e filtro por status. */
export function filtrarMeus<T extends ItemParaListar>(itens: readonly T[], f: FiltroDeMeusLivros): T[] {
  return itens.filter(
    (i) =>
      (!f.status || i.status === f.status) &&
      casaComBusca(
        { titulo: i.titulo, autores: i.autor ? [{ nome: i.autor, anoMorte: null }] : [], tradutores: [] },
        f.texto,
      ),
  );
}

/** Do mais recente ao mais antigo (estável: empate mantém a ordem de entrada). */
export function ordenarPorRecentes<T extends ItemParaListar>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => b.ultimaAtividade - a.ultimaAtividade);
}

/** Quantos livros há em cada status (para os números do filtro). */
export function contarPorStatus(itens: readonly Pick<ItemParaListar, 'status'>[]): Record<StatusDeLeitura, number> {
  const n: Record<StatusDeLeitura, number> = { 'quero-ler': 0, lendo: 0, lido: 0 };
  for (const i of itens) n[i.status]++;
  return n;
}
