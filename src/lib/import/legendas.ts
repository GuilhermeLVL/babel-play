/**
 * LEGENDAS (.srt, .vtt, .ass/.ssa) COMO MATERIAL DE ESTUDO, LIDAS NO NAVEGADOR. Quem já tem a legenda de uma série, de um
 * anime ou de uma aula (arquivo ao lado do vídeo) não precisa transcrever nada: o texto já existe, com o idioma certo e sem custo de
 * nuvem. Puro, sem DOM nem rede, para rodar também na edição estática e ser testado inteiro.
 *
 * O QUE SAI: um texto com UMA FALA POR LINHA, sem número de bloco, tempo, etiqueta de estilo nem repetição consecutiva (as
 * legendas de rolagem repetem a mesma fala em vários blocos). Os tempos não entram: a sessão-documento é de leitura e estudo.
 */

export type FormatoDeLegenda = 'srt' | 'vtt' | 'ass';

/** Teto do arquivo lido no navegador: uma legenda de filme tem ~100 KB; passar muito disso é outro tipo de arquivo. */
export const TAMANHO_MAXIMO_DA_LEGENDA_BYTES = 5 * 1024 * 1024;

/** O formato pela extensão do nome do arquivo, ou `null` se não é legenda. */
export function formatoDaLegenda(nome: string): FormatoDeLegenda | null {
  const ext = /\.([a-z0-9]+)$/i.exec(nome.trim())?.[1]?.toLowerCase();
  if (ext === 'srt') return 'srt';
  if (ext === 'vtt') return 'vtt';
  if (ext === 'ass' || ext === 'ssa') return 'ass';
  return null;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Tira etiquetas (`<i>`, `<c.cor>`), sobreposições do ASS (`{\an8}`) e entidades, e junta as quebras de linha. */
function limparFala(bruto: string): string {
  return bruto
    .replace(/\{[^}]*\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\\[Nn]/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTIDADES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** SRT e WebVTT: blocos separados por linha em branco; a fala vem depois da linha com `-->`. */
function falasDeBlocos(conteudo: string): string[] {
  const falas: string[] = [];
  for (const bloco of conteudo.split(/\n{2,}/)) {
    const linhas = bloco.split('\n');
    const i = linhas.findIndex((l) => l.includes('-->'));
    if (i < 0) continue; // cabeçalho WEBVTT, NOTE, STYLE, REGION: sem tempo, sem fala
    falas.push(limparFala(linhas.slice(i + 1).join(' ')));
  }
  return falas;
}

/** ASS/SSA: `Dialogue:` com a fala no ÚLTIMO campo (que pode ter vírgulas); `Format:` diz quantos campos vêm antes. */
function falasDoAss(conteudo: string): string[] {
  const linhas = conteudo.split('\n');
  let camposDoTexto = 9; // o padrão do ASS v4+: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
  const formato = linhas.find((l) => /^\s*Format:/i.test(l) && /\bText\b/i.test(l) && /\bStart\b/i.test(l));
  if (formato) {
    const campos = formato
      .replace(/^\s*Format:/i, '')
      .split(',')
      .map((c) => c.trim().toLowerCase());
    const t = campos.indexOf('text');
    if (t > 0) camposDoTexto = t;
  }
  const falas: string[] = [];
  for (const l of linhas) {
    if (!/^\s*Dialogue:/i.test(l)) continue;
    const partes = l.replace(/^\s*Dialogue:/i, '').split(',');
    if (partes.length <= camposDoTexto) continue;
    falas.push(limparFala(partes.slice(camposDoTexto).join(',')));
  }
  return falas;
}

/**
 * O texto da legenda: uma fala por linha. Lança se não há fala nenhuma (arquivo vazio, só cabeçalho, ou não era legenda).
 */
export function textoDaLegenda(conteudo: string, formato: FormatoDeLegenda): string {
  const texto = conteudo.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const brutas = formato === 'ass' ? falasDoAss(texto) : falasDeBlocos(texto);
  const falas: string[] = [];
  for (const f of brutas) {
    if (f && f !== falas[falas.length - 1]) falas.push(f); // a rolagem repete a mesma fala em vários blocos
  }
  if (!falas.length) throw new Error('Não achei falas nesta legenda.');
  return falas.join('\n');
}
