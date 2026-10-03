/**
 * OS RENDERIZADORES DE TEXTO do relatório: Markdown completo, e os avulsos (conversa .md/.txt,
 * palavras .md/CSV). Só desenham o `ModeloDoRelatorio`; não calculam nada.
 */
import { t } from '../i18n';
import type { ModeloDoRelatorio, PalavraDoRelatorio } from './modeloDoRelatorio';

/** Célula de tabela de pipe: `|` escapado e quebra de linha vira `<br>`. */
export function celulaMd(v: string | number): string {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim();
}

function tabelaMd(cabecalho: string[], linhas: Array<Array<string | number>>): string {
  const l = (cs: Array<string | number>) => `| ${cs.map(celulaMd).join(' | ')} |`;
  return [l(cabecalho), l(cabecalho.map(() => '---')), ...linhas.map(l)].join('\n');
}

const citacao = (texto: string) =>
  texto
    .split(/\r?\n/)
    .map((x) => `> ${x}`)
    .join('\n');

export function conversaParaMd(m: ModeloDoRelatorio): string {
  if (!m.conversa.length) return `_${t('Esta sessão não tem transcrição.')}_\n`;
  return (
    m.conversa
      .map((f) => {
        const linhas = [`**${f.tempo}** · **${f.falante}**`, '', citacao(f.original)];
        if (f.traducao) linhas.push('>', citacao(`${f.traducao}`));
        if (f.polida) linhas.push('>', citacao(`${t('Tradução polida')}: ${f.polida}`));
        return linhas.join('\n');
      })
      .join('\n\n') + '\n'
  );
}

export function conversaParaTxt(m: ModeloDoRelatorio): string {
  const corpo = m.conversa
    .map((f) => {
      const l = [`[${f.tempo}] ${f.falante}`, f.original];
      if (f.traducao) l.push(`  → ${f.traducao}`);
      if (f.polida) l.push(`  → (${t('Tradução polida')}) ${f.polida}`);
      return l.join('\n');
    })
    .join('\n\n');
  return `${m.titulo}\n${'='.repeat(Math.min(60, [...m.titulo].length))}\n\n${corpo}\n`;
}

const colunasDePalavras = (novas: boolean) => [
  t('Palavra'),
  t('Tradução'),
  t('Nível'),
  t('Frase de exemplo'),
  t('Onde ocorreu'),
  t('Vezes'),
  ...(novas ? [t('Estado')] : []),
  t('Revisão'),
];

const estadoEmTexto = (e: PalavraDoRelatorio['estado']) =>
  e === 'adicionada' ? t('já adicionada') : e === 'nova' ? t('ainda não adicionada') : '';

const linhaDePalavra = (p: PalavraDoRelatorio, novas: boolean) => [
  p.palavra,
  p.traducao || '—',
  p.nivel || '—',
  p.exemplo || '—',
  p.onde || '—',
  p.vezes,
  ...(novas ? [estadoEmTexto(p.estado)] : []),
  p.revisao || '—',
];

export function palavrasParaMd(lista: PalavraDoRelatorio[], novas: boolean, omitidas = 0): string {
  if (!lista.length)
    return `_${novas ? t('Nenhuma palavra nova nesta sessão.') : t('Nenhuma palavra desta sessão no caderno.')}_\n`;
  const nota =
    omitidas > 0
      ? `\n\n_${t('Mostrando as {n} primeiras; há mais {m} candidatas.', { n: lista.length, m: omitidas })}_`
      : '';
  return (
    tabelaMd(
      colunasDePalavras(novas),
      lista.map((p) => linhaDePalavra(p, novas)),
    ) +
    nota +
    '\n'
  );
}

function cel(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n;\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com BOM (o Excel abre acento e árabe/CJK certo) e vírgula, como o CSV de métricas. */
export function palavrasParaCsv(lista: PalavraDoRelatorio[], novas: boolean): string {
  const linhas = [
    colunasDePalavras(novas),
    ...lista.map((p) => linhaDePalavra(p, novas).map((x) => (x === '—' ? '' : x))),
  ];
  return '﻿' + linhas.map((l) => l.map(cel).join(',')).join('\r\n') + '\r\n';
}

export function metricasParaMd(m: ModeloDoRelatorio): string {
  const me = m.metricas;
  const partes = [
    tabelaMd(
      [t('Métrica'), t('Valor'), t('Observação')],
      me.itens.map((i) => [i.rotulo, i.valor, i.nota]),
    ),
  ];
  if (me.porFalante.length)
    partes.push(
      `### ${t('Por falante')}`,
      tabelaMd(
        [t('Falante'), t('Falas'), t('Tempo falado'), t('Palavras por minuto')],
        me.porFalante.map((f) => [f.nome, f.falas, f.tempo, f.ppm]),
      ),
    );
  if (me.vicios.length)
    partes.push(
      `### ${t('Vícios de linguagem')}`,
      tabelaMd(
        [t('Marcador'), t('Vezes')],
        me.vicios.map((v) => [v.marcador, v.vezes]),
      ),
    );
  if (me.palavrasChave.length) partes.push(`### ${t('Palavras-chave')}`, me.palavrasChave.join(', '));
  for (const a of me.avisos) partes.push(`_${a}_`);
  return partes.join('\n\n') + '\n';
}

/** O relatório inteiro, só com as seções ligadas. */
export function paraMarkdown(m: ModeloDoRelatorio): string {
  const s = m.secoes;
  const out: string[] = [`# ${m.titulo}`, `_${t('Relatório da sessão')} · Babel Play · ${m.geradoEm}_`];

  if (s.cabecalho) {
    const c = m.cabecalho;
    out.push(
      `## ${t('Sobre a sessão')}`,
      [
        `- **${t('Tipo')}:** ${c.tipo}`,
        `- **${t('Data')}:** ${c.data}`,
        `- **${t('Duração')}:** ${c.duracao}`,
        `- **${t('Idiomas')}:** ${c.idiomas}`,
        `- **${t('Quem falou')}:** ${c.falantes.length ? c.falantes.join(', ') : '—'}`,
      ].join('\n'),
    );
  }
  if (s.metricas) out.push(`## ${t('Resumo e métricas')}`, metricasParaMd(m).trimEnd());
  if (s.conversa) out.push(`## ${t('Conversa')}`, conversaParaMd(m).trimEnd());
  if (s.palavras) out.push(`## ${t('Palavras')}`, palavrasParaMd(m.palavras, false).trimEnd());
  if (s.palavrasNovas)
    out.push(`## ${t('Palavras novas')}`, palavrasParaMd(m.palavrasNovas, true, m.palavrasNovasOmitidas).trimEnd());
  if (s.notas && m.notas.length)
    out.push(
      `## ${t('Notas e marcações')}`,
      tabelaMd(
        [t('Tipo'), t('Trecho'), t('Nota')],
        m.notas.map((n) => [n.tipo, n.trecho, n.conteudo || '—']),
      ),
    );
  if (s.desenhos && m.desenhos.length)
    out.push(
      `## ${t('Desenhos')}`,
      ...m.desenhos.map((d) => `### ${d.rotulo}\n\n![${d.rotulo.replace(/[[\]]/g, '')}](${d.png})`),
    );

  return out.join('\n\n') + '\n';
}
