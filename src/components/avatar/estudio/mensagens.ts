/**
 * As mensagens do Estúdio: cada erro ou aviso do core/lib vira uma frase clara, sem jargão, que diz o que houve e o
 * que fazer. O core devolve códigos e textos técnicos; a tradução é daqui (`t()`).
 */
import type { MotivoDaNegativa } from '../../../core/avatar/estudio';
import type { AvisoDoArquivo } from '../../../lib/avatar/estudio';
import { t } from '../../../lib/i18n';
import { nomeDaPeca } from './nomesDasPecas';

/** Erros de importação (texto técnico do core) em frases para a pessoa. Sem repetir. */
export function frasesDeErroDeImportacao(erros: readonly string[]): string[] {
  const out = new Set<string>();
  for (const e of erros) {
    if (/grande demais/.test(e))
      out.add(t('O arquivo é grande demais para ser uma receita de avatar (o máximo é 16 KB).'));
    else if (/aninhamento/.test(e)) out.add(t('O arquivo tem uma estrutura complicada demais para ser uma receita.'));
    else if (/JSON|texto|ilegível/.test(e))
      out.add(t('Isto não parece uma receita do Frasy: o arquivo não é um JSON válido.'));
    else if (/endere/.test(e)) out.add(t('Uma receita não pode conter endereços da internet.'));
    else if (/mais nova/.test(e))
      out.add(t('Esta receita foi feita por uma versão mais nova do Frasy. Atualize o app para abri-la.'));
    else if (/desconhecid/.test(e) && /pecas|peça/.test(e))
      out.add(t('A receita usa uma peça que o Frasy não conhece.'));
    else if (/mesmo lugar|no máximo|orçamento|não combina/.test(e))
      out.add(t('A receita junta peças demais, ou peças que não cabem juntas.'));
    else if (/desconhecido/.test(e)) out.add(t('A receita tem um campo que o Frasy não conhece.'));
    else out.add(t('A receita está incompleta ou tem valores fora do permitido.'));
  }
  return [...out].slice(0, 3);
}

export function frasesDeAviso(avisos: readonly AvisoDoArquivo[]): string[] {
  const out: string[] = [];
  for (const a of avisos) {
    if (a.codigo === 'modelo_ausente')
      out.push(
        t(
          'Modelo não encontrado neste aparelho. A receita foi carregada, mas o modelo trazido por você precisa ser importado de novo.',
        ),
      );
    else if (a.codigo === 'pecas_removidas')
      out.push(t('Estas peças não existem mais e foram deixadas de fora: {pecas}.', { pecas: a.ids.join(', ') }));
  }
  return out;
}

export function fraseDaNegativa(motivo: MotivoDaNegativa, id: string): string {
  const nome = nomeDaPeca(id);
  switch (motivo) {
    case 'bloqueada':
      return t('{peca} é um item da loja que você ainda não tem.', { peca: nome });
    case 'limite':
    case 'orcamento':
      return t('Já são peças demais. Tire uma para colocar {peca}.', { peca: nome });
    case 'incompativel':
      return t('{peca} não combina com este modelo.', { peca: nome });
    default:
      return t('Não deu para usar {peca}.', { peca: nome });
  }
}
