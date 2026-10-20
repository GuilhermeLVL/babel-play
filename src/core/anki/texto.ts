import { limparCampo } from './campo';
import type { LeituraAnki, NotaAnki } from './tipos';

/**
 * Lê o formato TEXTO que o Anki exporta e importa nativamente.
 *
 * Vale a pena aceitar porque é o que sai de planilha, e porque quem já tem um baralho em CSV não
 * precisa abrir o Anki só para converter. Separador detectado por frequência: tabulação primeiro
 * (é o padrão do Anki), depois ponto-e-vírgula, depois vírgula.
 */
export function lerTextoAnki(texto: string): LeituraAnki {
  const linhas = (texto ?? '').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (!linhas.length) return { notas: [], formato: 'texto', campos: [], descartadas: 0, temMidia: false };

  const candidatos = ['\t', ';', ','] as const;
  const sep = candidatos.find((s) => linhas[0].includes(s)) ?? '\t';

  const notas: NotaAnki[] = [];
  let descartadas = 0;
  let campos: string[] = [];

  linhas.forEach((linha, i) => {
    const partes = linha.split(sep).map((p) => limparCampo(p.replace(/^"|"$/g, '')));
    // Cabeçalho: primeira linha cujos dois primeiros campos parecem rótulos, não conteúdo.
    if (i === 0 && /^(front|frente|word|palavra|term)$/i.test(partes[0] ?? '')) {
      campos = partes.filter(Boolean);
      return;
    }
    const [frente, verso, exemplo] = partes;
    if (!frente || !verso) {
      descartadas++;
      return;
    }
    /* Texto puro não tem identidade estável: quem gerou o arquivo não guardou id nenhum. Guid
       vazio é a resposta honesta — quem grava decide o que fazer com isso (hoje, sintetizar). */
    notas.push({ guid: '', frente, verso, exemplo: exemplo || undefined, tags: [] });
  });

  return {
    notas,
    formato: `texto (separado por ${sep === '\t' ? 'tabulação' : sep})`,
    campos,
    descartadas,
    temMidia: false,
  };
}
