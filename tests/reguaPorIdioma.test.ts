/**
 * AUSÊNCIA DECLARADA, EM VEZ DE ZERO (auditoria de 2026-09-07, achado A39).
 *
 * Quatro réguas do núcleo eram de inglês (ou de inglês+português) e não diziam: voz passiva pelo
 * padrão "be + particípio", sílabas e Flesch Reading Ease, e as duas listas de stopwords. Aplicadas
 * a outro idioma elas não falhavam — devolviam ZERO, e zero na tela é uma afirmação sobre a fala
 * da pessoa ("você não usa voz passiva", "0% de palavras de conteúdo") que ninguém mediu.
 *
 * Este arquivo trava a diferença entre "medi e deu zero" e "não sei medir isto neste idioma".
 */
import { describe, it, expect } from 'vitest';
import { computeTextStats, temReguaDeLegibilidade, temStopwordsDeTexto } from '../src/core/learning/text-stats';
import { detectarVozPassiva, temReguaDeVozPassiva } from '../src/core/learning/passive-voice';
import { extractKeywords, temStopwords } from '../src/core/learning/keywords';
import { prepararFala, idiomasComPreparacaoDeFala } from '../src/lib/traducao/prepararFala';

const INGLES = 'The report was written by the committee. The results were published later.';
const ALEMAO = 'Der Bericht wurde vom Ausschuss geschrieben. Die Ergebnisse wurden veröffentlicht.';

describe('estatísticas de texto', () => {
  it('em inglês, mede tudo: legibilidade, sílabas e densidade lexical', () => {
    const s = computeTextStats(INGLES, 'en');
    expect(s.wordCount).toBeGreaterThan(10);
    expect(s.readingEase).not.toBeNull();
    expect(s.syllableCount).not.toBeNull();
    expect(s.lexicalDensityPct).not.toBeNull();
    expect(s.idioma).toBe('en');
  });

  it('em alemão, o que não tem régua volta NULO — e o que é neutro continua medido', () => {
    const s = computeTextStats(ALEMAO, 'de');
    // Contagens não dependem de idioma: continuam valendo.
    expect(s.wordCount).toBeGreaterThan(0);
    expect(s.uniqueWords).toBeGreaterThan(0);
    // Sílabas e Flesch são heurísticas inglesas; densidade precisa de lista de stopwords.
    expect(s.syllableCount).toBeNull();
    expect(s.readingEase).toBeNull();
    expect(s.lexicalDensityPct).toBeNull();
  });

  it('em português mede densidade (há lista) mas não legibilidade (a fórmula é inglesa)', () => {
    const s = computeTextStats('O relatório foi escrito pela comissão e os resultados saíram depois.', 'pt');
    expect(s.lexicalDensityPct).not.toBeNull();
    expect(s.readingEase).toBeNull();
  });

  it('as réguas são consultáveis por quem exibe', () => {
    expect(temReguaDeLegibilidade('en')).toBe(true);
    expect(temReguaDeLegibilidade('pt')).toBe(false);
    expect(temStopwordsDeTexto('pt')).toBe(true);
    expect(temStopwordsDeTexto('ja')).toBe(false);
  });
});

describe('voz passiva', () => {
  it('mede em inglês', () => {
    const r = detectarVozPassiva(INGLES, 'en');
    expect(r).not.toBeNull();
    expect(r!.ocorrencias).toBeGreaterThan(0);
  });

  it('devolve null fora do inglês — nunca zero ocorrências', () => {
    expect(detectarVozPassiva(ALEMAO, 'de')).toBeNull();
    expect(temReguaDeVozPassiva('de')).toBe(false);
  });
});

describe('extração de palavras-chave', () => {
  it('filtra o ruído gramatical do idioma pedido', () => {
    const kws = extractKeywords('The committee published the results about the report', { lang: 'en', max: 10 });
    expect(kws.map((k) => k.toLowerCase())).not.toContain('about');
    expect(kws.map((k) => k.toLowerCase())).toContain('committee');
  });

  it('sem lista para o idioma, extrai sem filtro — e diz que não filtrou', () => {
    expect(temStopwords('en')).toBe(true);
    expect(temStopwords('de')).toBe(false);
    // "wurden" é palavra gramatical alemã; sem lista ela passa, e é isso que `temStopwords` avisa.
    const kws = extractKeywords(ALEMAO, { lang: 'de', max: 10 });
    expect(kws.length).toBeGreaterThan(0);
  });

  it('a lista é a do idioma PEDIDO, não a soma de todas', () => {
    // 'that' é stopword inglesa e não portuguesa: pedindo português, ela passa.
    const emPortugues = extractKeywords('that palavra importante', { lang: 'pt', minLength: 4, max: 10 });
    expect(emPortugues.map((k) => k.toLowerCase())).toContain('that');
  });
});

describe('preparação da fala antes de traduzir', () => {
  it('age em português', () => {
    const r = prepararFala('né, a gente tá indo', 'pt-BR', 'en');
    expect(r.mudou).toBe(true);
  });

  it('idioma sem tabela sai intacto, e a lista de idiomas é consultável', () => {
    const texto = 'also, wir sind da';
    expect(prepararFala(texto, 'de', 'en')).toEqual({ texto, mudou: false });
    expect(idiomasComPreparacaoDeFala()).toEqual(['pt']);
  });
});
