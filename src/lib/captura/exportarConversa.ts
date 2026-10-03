/**
 * EXPORTAR A CONVERSA DO INTÉRPRETE (Intérprete v3, Fase 1) — o Markdown da conversa, puro: uma entrada
 * por fala final, na ordem, com quem falou, o original e a tradução. O texto é o de AGORA: a fala que a
 * pessoa corrigiu já vem corrigida. A conversa não sai do aparelho: quem chama baixa o arquivo.
 *
 * O relatório completo (PDF, métricas, palavras) continua sendo o da sessão salva, na Análise.
 */
import type { LadoDoInterprete, SpeechSegment } from './tiposDaFala';

export type FalaParaExportar = Pick<SpeechSegment, 'id' | 'originalText' | 'translatedText'> &
  Partial<Pick<SpeechSegment, 'isPartial' | 'lado' | 'timestamp'>>;

export interface OpcoesDaExportacao {
  titulo: string;
  /** Quem é cada lado no arquivo ("Você", "A outra pessoa"). */
  rotulos: Record<LadoDoInterprete, string>;
  /** O nome do idioma de cada lado ("Português", "English"). */
  idiomas: Record<LadoDoInterprete, string>;
}

export function conversaEmMarkdown(falas: ReadonlyArray<FalaParaExportar>, o: OpcoesDaExportacao): string {
  const linhas: string[] = [`# ${o.titulo}`, ''];
  let escreveu = false;
  for (const f of falas) {
    if (!f.lado || f.isPartial || !f.originalText.trim()) continue;
    escreveu = true;
    const hora = f.timestamp ? ` · ${f.timestamp}` : '';
    linhas.push(`**${o.rotulos[f.lado]}** (${o.idiomas[f.lado]})${hora}`, '', f.originalText.trim(), '');
    const traducao = f.translatedText?.trim();
    if (traducao && traducao !== '…') linhas.push(`> ${traducao}`, '');
  }
  if (!escreveu) linhas.push('Nenhuma fala nesta conversa.', '');
  return linhas.join('\n');
}

/** O nome do arquivo: sem o que o sistema recusa (`\ / : * ? " < > |`), terminando em `.md`. */
export const nomeDoArquivoDaConversa = (titulo: string): string =>
  `${titulo.replace(/[\\/:*?"<>|]/g, '-').trim() || 'conversa'}.md`;

/** Baixa o texto como arquivo (só no navegador). */
export function baixarTexto(nome: string, texto: string, tipo = 'text/markdown;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
