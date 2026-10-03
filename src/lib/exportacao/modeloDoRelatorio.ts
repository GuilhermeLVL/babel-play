/**
 * O MODELO DO RELATÓRIO DA SESSÃO — a única fonte do que vai para fora do app.
 *
 * Função PURA: recebe o que a tela de Análise já calculou e devolve um objeto com TODAS as seções
 * já formatadas (texto, números no idioma da interface). O Markdown, o PDF (página imprimível) e as
 * exportações avulsas (CSV, .txt) só desenham este objeto; nenhum deles calcula nada.
 *
 * REGRA DE HONESTIDADE (a mesma de `lib/analise/metricasDaSessao.ts`): nenhuma métrica é refeita
 * aqui. Os números chegam prontos de `useMetricasDaSessao`; uma métrica sem dado vira "—" com o
 * motivo ("requer timing das falas"), nunca um valor inventado. As poucas contas daqui (tempo
 * falado por falante, contagem por nível, onde cada palavra apareceu) são somas e buscas simples
 * sobre as falas, e estão assinaladas.
 *
 * Os textos passam por `t()` na hora de montar: o relatório sai no idioma da interface.
 */
import { extractKeywords, retrievability, type TextStats } from '@core';

import { montarDetalheLexical } from '../analise/metricasDaSessao';
import type { FalaDaAnalise, SilencioDaSessao } from '../analise/tiposDaAnalise';
import type { DesenhoDaSessao } from '../desenho/desenhosDaSessao';
import { data, dataHora, idiomaDaInterface, numero, t, tp } from '../i18n';
import { langLabelNaUI } from '../languages';
import type { Anotacao, TipoDeNota } from '../leitura/anotacaoDaFrase';

/* ── ENTRADA ─────────────────────────────────────────────────────────────────────────────────── */

/** As seções que a pessoa liga e desliga. A ordem é a do relatório. */
export const SECOES = ['cabecalho', 'metricas', 'conversa', 'palavras', 'palavrasNovas', 'notas', 'desenhos'] as const;
export type SecaoId = (typeof SECOES)[number];

/** Uma fala como a tela a monta (`parsedSentences`), mais a tradução polida quando há. */
export interface FalaDoRelatorio
  extends Pick<FalaDaAnalise, 'original' | 'translation' | 'lang' | 'speaker' | 'time' | 'startTime' | 'index'> {
  /** A tradução "polida" (D5 da Fase D), ao lado da original. */
  polida?: string | null;
}

/** O pedaço de `VocabCard` que o relatório lê (o cartão inteiro serve). */
export interface CartaoDoRelatorio {
  word: string;
  translation?: string;
  sentence?: string;
  cefrLevel?: string;
  sourceSessionId?: string;
  inDeck?: boolean;
  /** Revisões feitas (FSRS). */
  reps?: number;
  fsrsStability?: number;
  lastReview?: number;
  dueAtMs?: number | null;
  [k: string]: unknown;
}

export interface EntradaDoRelatorio {
  sessao: {
    id: string;
    titulo: string;
    tipo: 'audio' | 'video' | 'document';
    /** O rótulo de data que a Biblioteca mostra ("Hoje", "Há 3 dias"…); sem data real, é o que há. */
    data: string;
    duracao: string;
    idiomaOrigem?: string;
    idiomaDestino?: string;
  };
  falas: FalaDoRelatorio[];
  /** As linhas cruas de `utterances` (o timing em ms e o nome de quem falou). */
  falasCruas: Array<{ tStartMs?: number | null; tEndMs?: number | null; speakerName?: string | null }>;
  /** O texto inteiro da transcrição (`fullTranscriptText`) e o idioma da sessão. */
  textoCompleto: string;
  idioma: string;
  estatisticas: TextStats;
  metricas: {
    ppm: number | null;
    pausasLongas: number | null;
    vicios: {
      total: number;
      palavras: number;
      porMilPalavras: number;
      detalhe: Array<{ marcador: string; vezes: number }>;
      palavrasSemLista: number;
    } | null;
    silencio: SilencioDaSessao | null;
    monologoMs: number | null;
    sobreposicao: { total: number; msSobrepostos: number; maiorMs: number } | null;
    palavrasChave: string[];
    /** `ritmoPorFalante` da tela: palavras por minuto de cada um, só com o tempo real. */
    ritmoPorFalante: Array<{ nome: string; ppm: number }>;
  };
  /** O baralho INTEIRO da pessoa (para saber o que já era dela antes desta sessão). */
  cartoes: CartaoDoRelatorio[];
  anotacoes: Anotacao[];
  desenhos: DesenhoDaSessao[];
  geradoEm: Date;
}

export interface OpcoesDoRelatorio {
  /** Seções ligadas. Ausente = todas. */
  secoes?: Partial<Record<SecaoId, boolean>>;
}

/* ── SAÍDA ───────────────────────────────────────────────────────────────────────────────────── */

export interface LinhaDeMetrica {
  rotulo: string;
  valor: string;
  /** Explicação curta (o motivo do "—", a unidade, a ressalva). */
  nota: string;
}

export interface FalaFormatada {
  tempo: string;
  falante: string;
  lang: string;
  original: string;
  traducao: string;
  polida: string;
}

export interface PalavraDoRelatorio {
  palavra: string;
  traducao: string;
  nivel: string;
  exemplo: string;
  /** "0:12, 1:03" — os momentos da conversa em que a palavra aparece (até 5). */
  onde: string;
  vezes: number;
  /** Estado de revisão em frase ("3 revisões, retenção 82%…"); vazio quando não há. */
  revisao: string;
  /** Só nas "novas": se já virou cartão (`adicionada`) ou ainda não (`nova`). */
  estado: 'adicionada' | 'nova' | '';
}

export interface NotaDoRelatorio {
  tipo: string;
  trecho: string;
  conteudo: string;
}

export interface DesenhoFormatado {
  rotulo: string;
  png: string;
  largura: number;
  altura: number;
}

export interface ModeloDoRelatorio {
  /** Idioma do TEXTO do relatório (o da interface), para `lang`/`dir` no PDF. */
  idiomaDoTexto: string;
  secoes: Record<SecaoId, boolean>;
  titulo: string;
  geradoEm: string;
  /** `babel-play-<título-limpo>-<AAAA-MM-DD>` sem extensão. */
  nomeDoArquivo: string;
  cabecalho: {
    tipo: string;
    data: string;
    duracao: string;
    idiomas: string;
    falantes: string[];
  };
  metricas: {
    itens: LinhaDeMetrica[];
    vicios: Array<{ marcador: string; vezes: number }>;
    porFalante: Array<{ nome: string; falas: number; tempo: string; ppm: string }>;
    palavrasChave: string[];
    niveis: Array<{ nivel: string; n: number }>;
    avisos: string[];
  };
  conversa: FalaFormatada[];
  palavras: PalavraDoRelatorio[];
  palavrasNovas: PalavraDoRelatorio[];
  /** Quantas candidatas existem além das que couberam no relatório. */
  palavrasNovasOmitidas: number;
  notas: NotaDoRelatorio[];
  desenhos: DesenhoFormatado[];
}

/* ── PEQUENAS PEÇAS ──────────────────────────────────────────────────────────────────────────── */

export const LIMITE_DE_CANDIDATAS = 200;
const SEM_DADO = '—';

/** m:ss (ou h:mm:ss). */
export function mmss(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** AAAA-MM-DD no fuso local. */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Título limpo para nome de arquivo: sem acento, sem símbolo, com hífen. Mantém letras e números de
 * QUALQUER escrita (árabe, japonês…): tirar tudo que não é ASCII deixaria o nome vazio para eles.
 */
export function titulolimpo(titulo: string): string {
  const s = (titulo ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'sessao';
}

export function nomeDoArquivo(titulo: string, quando: Date): string {
  return `babel-play-${titulolimpo(titulo)}-${isoLocal(quando)}`;
}

const rotuloDoTipo = (tipo: 'audio' | 'video' | 'document') =>
  tipo === 'video' ? t('Vídeo') : tipo === 'document' ? t('Documento') : t('Áudio');

function nomeDoFalante(bruto: string | null | undefined): string {
  const n = (bruto ?? '').trim();
  return n && n !== '-' && n !== '—' ? n : t('Sem nome');
}

const aoMinuto = (ms: number) => mmss(ms / 1000);

/** A palavra existe como palavra INTEIRA no texto (a fronteira por letra do resto do app; o `\b` quebra em acento). */
function aparece(alvo: string, textoMinusculo: string): boolean {
  if (!alvo) return false;
  if (!textoMinusculo.includes(alvo)) return false;
  try {
    const re = new RegExp('(?<!\\p{L})' + alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\p{L})', 'iu');
    if (re.test(textoMinusculo)) return true;
  } catch {
    return true;
  }
  /* Escritas sem espaço (japonês, chinês): não há fronteira de palavra, vale o trecho. */
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(alvo);
}

function momentos(alvo: string, falas: FalaDoRelatorio[]): { onde: string; exemplo: string } {
  const a = alvo.toLowerCase();
  const achadas = falas.filter((f) => aparece(a, f.original.toLowerCase()));
  const rotulo = (f: FalaDoRelatorio) => f.time || t('fala {n}', { n: f.index + 1 });
  return {
    onde: achadas.slice(0, 5).map(rotulo).join(', '),
    exemplo: achadas[0]?.original ?? '',
  };
}

function frasesDeRevisao(c: CartaoDoRelatorio, agoraMs: number): string {
  const reps = Number(c.reps ?? 0);
  const estab = Number(c.fsrsStability ?? 0);
  const ultima = Number(c.lastReview ?? 0);
  if (!(reps > 0) && !(estab > 0 && ultima > 0)) return t('ainda não revisada');
  const partes: string[] = [];
  if (reps > 0) partes.push(tp(reps, '{n} revisão', '{n} revisões'));
  if (estab > 0 && ultima > 0) {
    const dias = Math.max(0, (agoraMs - ultima) / 86_400_000);
    partes.push(t('retenção {n}%', { n: Math.round(retrievability(dias, estab) * 100) }));
  }
  if (c.dueAtMs) partes.push(t('próxima: {data}', { data: data(c.dueAtMs) }));
  return partes.join(' · ');
}

/* ── AS SEÇÕES ───────────────────────────────────────────────────────────────────────────────── */

function montarMetricas(
  e: EntradaDoRelatorio,
  niveis: Array<{ nivel: string; n: number }>,
): ModeloDoRelatorio['metricas'] {
  const { estatisticas: s, metricas: m, sessao } = e;
  const audio = sessao.tipo !== 'document';
  const semTempo = t('requer timing das falas');
  const itens: LinhaDeMetrica[] = [];
  const add = (rotulo: string, valor: string, nota = '') => itens.push({ rotulo, valor, nota });
  const tem = s.wordCount > 0;

  add(t('Palavras'), tem ? numero(s.wordCount) : SEM_DADO, t('na transcrição inteira'));
  add(t('Palavras únicas'), tem ? numero(s.uniqueWords) : SEM_DADO, t('sem repetir'));
  add(t('Frases'), tem ? numero(s.sentenceCount) : SEM_DADO, '');
  add(
    t('Minutos de leitura'),
    tem ? numero(Math.max(1, Math.round(s.wordCount / 250))) : SEM_DADO,
    t('no ritmo médio de leitura'),
  );
  if (audio) {
    add(
      t('Palavras por minuto'),
      m.ppm != null ? numero(m.ppm) : SEM_DADO,
      m.ppm != null ? t('ritmo da fala') : semTempo,
    );
    add(
      t('Pausas longas'),
      m.pausasLongas != null ? numero(m.pausasLongas) : SEM_DADO,
      m.pausasLongas != null ? t('acima de 3 segundos') : semTempo,
    );
    add(
      t('Silêncio total'),
      m.silencio ? aoMinuto(m.silencio.ms) : SEM_DADO,
      m.silencio ? t('{pct}% da gravação', { pct: m.silencio.pct }) : semTempo,
    );
    add(
      t('Maior monólogo'),
      m.monologoMs != null ? aoMinuto(m.monologoMs) : SEM_DADO,
      m.monologoMs != null ? t('a fala mais longa de uma vez') : semTempo,
    );
    add(
      t('Sobreposição de falas'),
      m.sobreposicao ? numero(m.sobreposicao.total) : SEM_DADO,
      m.sobreposicao
        ? t('{tempo} sobrepostos, a maior de {maior}', {
            tempo: aoMinuto(m.sobreposicao.msSobrepostos),
            maior: aoMinuto(m.sobreposicao.maiorMs),
          })
        : t('requer dois falantes identificados e o timing das falas'),
    );
    const v = m.vicios;
    add(
      t('Vícios de linguagem'),
      v && v.palavras > 0 ? numero(v.total) : SEM_DADO,
      v && v.palavras > 0
        ? t('{n} a cada mil palavras', { n: numero(v.porMilPalavras) })
        : t('requer fala em português ou inglês'),
    );
  }
  add(
    t('Densidade lexical'),
    s.lexicalDensityPct != null ? `${Math.round(s.lexicalDensityPct)}%` : SEM_DADO,
    s.lexicalDensityPct != null ? t('palavras de conteúdo') : t('sem lista de stopwords para este idioma'),
  );
  add(t('Riqueza (TTR)'), tem ? `${Math.round(s.typeTokenRatio * 100)}%` : SEM_DADO, t('variedade do vocabulário'));
  add(
    t('Facilidade de leitura'),
    s.readingEase != null ? numero(Math.round(s.readingEase)) : SEM_DADO,
    s.readingEase != null
      ? t('de 100: texto {nivel}', {
          nivel: s.readingEase >= 70 ? t('fácil') : s.readingEase >= 50 ? t('médio') : t('difícil'),
        })
      : s.syllableCount == null
        ? t('sem régua de legibilidade para este idioma')
        : t('precisa de mais texto'),
  );
  add(t('Tamanho médio da palavra'), tem ? numero(s.avgWordLength) : SEM_DADO, t('letras'));
  add(t('Tamanho médio da frase'), tem ? numero(s.avgSentenceLength) : SEM_DADO, t('palavras'));
  /* O app não mede um nível CEFR da SESSÃO; mede o de cada palavra. Dizê-lo é a resposta honesta. */
  add(
    t('Nível CEFR'),
    niveis.length ? niveis.map((x) => `${x.nivel}: ${x.n}`).join(' · ') : SEM_DADO,
    niveis.length
      ? t('das palavras desta sessão que têm nível')
      : t('o app mede o nível por palavra, e nenhuma tem nível ainda'),
  );

  /* Tempo falado e falas por pessoa — a SOMA das durações das falas (tEnd − tStart). */
  const porNome = new Map<string, { ms: number; falas: number }>();
  e.falas.forEach((f, i) => {
    const cru = e.falasCruas[i];
    const nome = nomeDoFalante(cru?.speakerName ?? f.speaker);
    const acc = porNome.get(nome) ?? { ms: 0, falas: 0 };
    acc.falas += 1;
    if (cru?.tStartMs != null && cru?.tEndMs != null && cru.tEndMs > cru.tStartMs) acc.ms += cru.tEndMs - cru.tStartMs;
    porNome.set(nome, acc);
  });
  const ppmDe = new Map(m.ritmoPorFalante.map((r) => [r.nome, r.ppm]));
  const porFalante = [...porNome.entries()].map(([nome, v]) => ({
    nome,
    falas: v.falas,
    tempo: v.ms > 0 ? aoMinuto(v.ms) : SEM_DADO,
    ppm: ppmDe.has(nome) ? numero(ppmDe.get(nome)!) : SEM_DADO,
  }));

  const avisos: string[] = [];
  if (e.falas.length === 0) avisos.push(t('Esta sessão não tem transcrição: as métricas de texto não se aplicam.'));
  if (audio && m.ppm == null && m.pausasLongas == null)
    avisos.push(t('As falas não têm tempo gravado: as métricas de ritmo ficam sem valor.'));
  if (m.vicios && m.vicios.palavrasSemLista > 0)
    avisos.push(
      t('{n} palavras ficaram fora dos vícios de linguagem: não há lista para o idioma delas.', {
        n: numero(m.vicios.palavrasSemLista),
      }),
    );

  return {
    itens,
    vicios: m.vicios?.detalhe ?? [],
    porFalante,
    palavrasChave: m.palavrasChave,
    niveis,
    avisos,
  };
}

/** Uma palavra do baralho ou candidata, no formato do relatório. */
function palavraDoCartao(
  c: CartaoDoRelatorio,
  e: EntradaDoRelatorio,
  estado: PalavraDoRelatorio['estado'],
): PalavraDoRelatorio {
  const det = montarDetalheLexical(c.word, [c], e.falas as FalaDaAnalise[], e.textoCompleto, e.geradoEm.getTime());
  const { onde, exemplo } = momentos(c.word, e.falas);
  return {
    palavra: c.word,
    traducao: (c.translation ?? '').trim(),
    nivel: c.cefrLevel ?? '',
    exemplo: (c.sentence ?? '').trim() || exemplo,
    onde,
    vezes: det?.ocorrencias ?? 0,
    revisao: frasesDeRevisao(c, e.geradoEm.getTime()),
    estado,
  };
}

/* ── O MONTADOR ──────────────────────────────────────────────────────────────────────────────── */

export function montarModeloDoRelatorio(e: EntradaDoRelatorio, opcoes: OpcoesDoRelatorio = {}): ModeloDoRelatorio {
  const secoes = Object.fromEntries(SECOES.map((id) => [id, opcoes.secoes?.[id] ?? true])) as Record<SecaoId, boolean>;
  const texto = e.textoCompleto.toLowerCase();
  const noCaderno = (c: CartaoDoRelatorio) => c.inDeck !== false;

  /* PALAVRAS: o que o caderno tem e esta sessão tocou — os cartões nascidos aqui, mais os que já
     eram da pessoa e aparecem na conversa. */
  const doCaderno = e.cartoes.filter(noCaderno);
  const daSessao = doCaderno.filter((c) => c.sourceSessionId === e.sessao.id);
  const outros = doCaderno.filter((c) => c.sourceSessionId !== e.sessao.id && aparece(c.word.toLowerCase(), texto));
  const palavras = [...daSessao, ...outros].map((c) => palavraDoCartao(c, e, ''));

  /* PALAVRAS NOVAS: o que a sessão trouxe — cartões nascidos aqui ("adicionada") e as palavras de
     conteúdo da conversa que ainda não estão em NENHUM cartão ("nova"). As candidatas vêm do mesmo
     `extractKeywords` das "palavras-chave" da tela, limitadas para o arquivo não virar um dicionário. */
  const conhecidas = new Set(e.cartoes.map((c) => c.word.toLowerCase()));
  const candidatasTodas = extractKeywords(e.textoCompleto, { max: 5000, lang: e.idioma }).filter(
    (w) => !conhecidas.has(w.toLowerCase()),
  );
  const candidatas = candidatasTodas.slice(0, LIMITE_DE_CANDIDATAS).map<PalavraDoRelatorio>((w) => {
    const { onde, exemplo } = momentos(w, e.falas);
    const det = montarDetalheLexical(w, [], e.falas as FalaDaAnalise[], e.textoCompleto);
    return {
      palavra: w,
      traducao: '',
      nivel: '',
      exemplo,
      onde,
      vezes: det?.ocorrencias ?? 0,
      revisao: '',
      estado: 'nova',
    };
  });
  const palavrasNovas = [...daSessao.map((c) => palavraDoCartao(c, e, 'adicionada')), ...candidatas];

  /* Nível por palavra → a contagem que o resumo mostra no lugar de um "nível da sessão". */
  const porNivel = new Map<string, number>();
  for (const p of palavras) if (p.nivel) porNivel.set(p.nivel, (porNivel.get(p.nivel) ?? 0) + 1);
  const niveis = [...porNivel.entries()]
    .map(([nivel, n]) => ({ nivel, n }))
    .sort((a, b) => a.nivel.localeCompare(b.nivel));

  /* CONVERSA */
  const conversa = e.falas.map<FalaFormatada>((f, i) => ({
    tempo: f.time || SEM_DADO,
    falante: nomeDoFalante(e.falasCruas[i]?.speakerName ?? f.speaker),
    lang: f.lang,
    original: f.original,
    traducao: f.translation ?? '',
    polida: (f.polida ?? '').trim(),
  }));

  /* NOTAS — o mesmo mapeamento da lista "Estudos & notas" da Leitura (`linhaDaNota`). */
  const rotuloDaNota = (tipo: TipoDeNota) =>
    ({ vocab: t('Vocabulário'), gram: t('Gramática'), expr: t('Expressão'), duvida: t('Dúvida'), audio: t('Áudio') })[
      tipo
    ];
  const notas = e.anotacoes.map<NotaDoRelatorio>((a) => {
    if (a.type === 'frase' && a.tipo) {
      return { tipo: rotuloDaNota(a.tipo), trecho: e.falas[a.textIndex]?.original ?? '', conteudo: '' };
    }
    return {
      tipo: a.type === 'highlight' ? a.content || t('Marcação') : a.type === 'note' ? t('Nota') : t('Áudio'),
      trecho: a.wordText ? `“${a.wordText}”` : (e.falas[a.textIndex]?.original ?? ''),
      conteudo: a.type === 'note' ? (a.content ?? '') : '',
    };
  });

  const falantes = [...new Set(conversa.map((f) => f.falante).filter((n) => n !== t('Sem nome')))];
  const origem = e.sessao.idiomaOrigem ? langLabelNaUI(e.sessao.idiomaOrigem) : '';
  const destino = e.sessao.idiomaDestino ? langLabelNaUI(e.sessao.idiomaDestino) : '';

  return {
    idiomaDoTexto: idiomaDaInterface(),
    secoes,
    titulo: e.sessao.titulo,
    geradoEm: dataHora(e.geradoEm),
    nomeDoArquivo: nomeDoArquivo(e.sessao.titulo, e.geradoEm),
    cabecalho: {
      tipo: rotuloDoTipo(e.sessao.tipo),
      data: e.sessao.data || SEM_DADO,
      duracao:
        e.sessao.tipo === 'document' || !e.sessao.duracao || e.sessao.duracao === '-' ? SEM_DADO : e.sessao.duracao,
      idiomas: origem && destino ? `${origem} → ${destino}` : origem || destino || SEM_DADO,
      falantes,
    },
    metricas: montarMetricas(e, niveis),
    conversa,
    palavras,
    palavrasNovas,
    palavrasNovasOmitidas: Math.max(0, candidatasTodas.length - LIMITE_DE_CANDIDATAS),
    notas,
    desenhos: e.desenhos.map((d) => ({ rotulo: d.rotulo, png: d.png, largura: d.largura, altura: d.altura })),
  };
}

/** Ligar seção só faz sentido se há o que mostrar. Quem desenha o diálogo usa isto para o motivo. */
export function contagens(m: ModeloDoRelatorio) {
  return {
    conversa: m.conversa.length,
    palavras: m.palavras.length,
    palavrasNovas: m.palavrasNovas.length,
    notas: m.notas.length,
    desenhos: m.desenhos.length,
  };
}
