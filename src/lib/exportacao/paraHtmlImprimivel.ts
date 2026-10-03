/**
 * A PÁGINA IMPRIMÍVEL do relatório — o PDF sai dela pelo "Salvar como PDF" do navegador.
 *
 * Por que não uma biblioteca de PDF: nenhuma está no projeto, e as leves (jsPDF, pdf-lib) não trazem
 * fonte para árabe nem CJK — a fala de uma sessão é exatamente isso. O navegador usa as fontes do
 * sistema, quebra tabela por linha (`break-inside: avoid`), numera páginas (`@page` margin boxes) e
 * respeita RTL. Sem dependência e sem peso no pacote inicial.
 */
import { t } from '../i18n';
import { ehRTL } from '../i18n';
import type { ModeloDoRelatorio, PalavraDoRelatorio } from './modeloDoRelatorio';

export function esc(v: string | number): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const tabela = (cab: string[], linhas: Array<Array<string | number>>, classe = '') =>
  `<table class="${classe}"><thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${linhas
    .map((l) => `<tr>${l.map((c) => `<td dir="auto">${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

function palavrasHtml(lista: PalavraDoRelatorio[], novas: boolean, omitidas: number): string {
  if (!lista.length)
    return `<p class="vazio">${esc(novas ? t('Nenhuma palavra nova nesta sessão.') : t('Nenhuma palavra desta sessão no caderno.'))}</p>`;
  const cab = [
    t('Palavra'),
    t('Tradução'),
    t('Nível'),
    t('Frase de exemplo'),
    t('Onde ocorreu'),
    t('Vezes'),
    ...(novas ? [t('Estado')] : []),
    t('Revisão'),
  ];
  const linhas = lista.map((p) => [
    p.palavra,
    p.traducao || '—',
    p.nivel || '—',
    p.exemplo || '—',
    p.onde || '—',
    p.vezes,
    ...(novas ? [p.estado === 'adicionada' ? t('já adicionada') : t('ainda não adicionada')] : []),
    p.revisao || '—',
  ]);
  const nota =
    omitidas > 0
      ? `<p class="vazio">${esc(t('Mostrando as {n} primeiras; há mais {m} candidatas.', { n: lista.length, m: omitidas }))}</p>`
      : '';
  return tabela(cab, linhas, 'larga') + nota;
}

const CSS = `
@page { size: A4; margin: 18mm 16mm 20mm;
  @top-left { content: string(titulo); font: 9pt sans-serif; color: #666; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 9pt sans-serif; color: #666; }
  @bottom-left { content: "Babel Play"; font: 9pt sans-serif; color: #666; } }
* { box-sizing: border-box; }
html { color: #1d1d1b; background: #fff; }
body { margin: 0; font: 10.5pt/1.5 system-ui, "Segoe UI", "Noto Sans", "Noto Sans Arabic", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; }
h1 { font-size: 21pt; line-height: 1.2; margin: 0 0 4px; string-set: titulo content(); }
h2 { font-size: 14pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1.5px solid #c9c4b8; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 14px 0 6px; break-after: avoid; }
.sub { color: #666; margin: 0 0 12px; font-size: 9.5pt; }
ul.cab { list-style: none; padding: 0; margin: 0; } ul.cab li { padding: 2px 0; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 9.5pt; }
th, td { border: 1px solid #d6d1c5; padding: 4px 6px; text-align: start; vertical-align: top; overflow-wrap: anywhere; }
th { background: #f1eee6; white-space: nowrap; overflow-wrap: normal; }
thead { display: table-header-group; }
tr, .fala, figure { break-inside: avoid; page-break-inside: avoid; }
table.larga { font-size: 8.5pt; }
.fala { margin: 0 0 8px; padding-inline-start: 9px; border-inline-start: 3px solid #c9c4b8; }
.fala .quem { font-weight: 700; font-size: 9.5pt; } .fala .quem span { color: #666; font-weight: 600; margin-inline-end: 6px; }
.fala p { margin: 2px 0; } .fala .trad { color: #555; } .fala .pol { color: #555; font-style: italic; }
figure { margin: 8px 0 14px; text-align: center; }
figure img { max-width: 100%; max-height: 220mm; height: auto; border: 1px solid #d6d1c5; background: #fff; }
figcaption { font-size: 9pt; color: #666; margin-top: 3px; }
.vazio { color: #666; font-style: italic; }
@media screen { body { max-width: 190mm; margin: 0 auto; padding: 14mm 12mm; } }
@media print { a { color: inherit; text-decoration: none; } }
`;

export function paraHtmlImprimivel(m: ModeloDoRelatorio): string {
  const s = m.secoes;
  const c = m.cabecalho;
  const b: string[] = [
    `<h1>${esc(m.titulo)}</h1>`,
    `<p class="sub">${esc(t('Relatório da sessão'))} · Babel Play · ${esc(m.geradoEm)}</p>`,
  ];

  if (s.cabecalho)
    b.push(
      `<h2>${esc(t('Sobre a sessão'))}</h2><ul class="cab">`,
      `<li><b>${esc(t('Tipo'))}:</b> ${esc(c.tipo)}</li>`,
      `<li><b>${esc(t('Data'))}:</b> ${esc(c.data)}</li>`,
      `<li><b>${esc(t('Duração'))}:</b> ${esc(c.duracao)}</li>`,
      `<li><b>${esc(t('Idiomas'))}:</b> <span dir="auto">${esc(c.idiomas)}</span></li>`,
      `<li><b>${esc(t('Quem falou'))}:</b> <span dir="auto">${esc(c.falantes.length ? c.falantes.join(', ') : '—')}</span></li></ul>`,
    );

  if (s.metricas) {
    const me = m.metricas;
    b.push(
      `<h2>${esc(t('Resumo e métricas'))}</h2>`,
      tabela(
        [t('Métrica'), t('Valor'), t('Observação')],
        me.itens.map((i) => [i.rotulo, i.valor, i.nota]),
      ),
    );
    if (me.porFalante.length)
      b.push(
        `<h3>${esc(t('Por falante'))}</h3>`,
        tabela(
          [t('Falante'), t('Falas'), t('Tempo falado'), t('Palavras por minuto')],
          me.porFalante.map((f) => [f.nome, f.falas, f.tempo, f.ppm]),
        ),
      );
    if (me.vicios.length)
      b.push(
        `<h3>${esc(t('Vícios de linguagem'))}</h3>`,
        tabela(
          [t('Marcador'), t('Vezes')],
          me.vicios.map((v) => [v.marcador, v.vezes]),
        ),
      );
    if (me.palavrasChave.length)
      b.push(`<h3>${esc(t('Palavras-chave'))}</h3><p dir="auto">${esc(me.palavrasChave.join(', '))}</p>`);
    for (const a of me.avisos) b.push(`<p class="vazio">${esc(a)}</p>`);
  }

  if (s.conversa) {
    b.push(`<h2>${esc(t('Conversa'))}</h2>`);
    if (!m.conversa.length) b.push(`<p class="vazio">${esc(t('Esta sessão não tem transcrição.'))}</p>`);
    for (const f of m.conversa)
      b.push(
        `<div class="fala"><div class="quem"><span>${esc(f.tempo)}</span>${esc(f.falante)}</div>` +
          `<p dir="auto">${esc(f.original)}</p>` +
          (f.traducao ? `<p class="trad" dir="auto">${esc(f.traducao)}</p>` : '') +
          (f.polida ? `<p class="pol" dir="auto">${esc(t('Tradução polida'))}: ${esc(f.polida)}</p>` : '') +
          `</div>`,
      );
  }

  if (s.palavras) b.push(`<h2>${esc(t('Palavras'))}</h2>`, palavrasHtml(m.palavras, false, 0));
  if (s.palavrasNovas)
    b.push(`<h2>${esc(t('Palavras novas'))}</h2>`, palavrasHtml(m.palavrasNovas, true, m.palavrasNovasOmitidas));
  if (s.notas && m.notas.length)
    b.push(
      `<h2>${esc(t('Notas e marcações'))}</h2>`,
      tabela(
        [t('Tipo'), t('Trecho'), t('Nota')],
        m.notas.map((n) => [n.tipo, n.trecho, n.conteudo || '—']),
      ),
    );
  if (s.desenhos && m.desenhos.length) {
    b.push(`<h2>${esc(t('Desenhos'))}</h2>`);
    for (const d of m.desenhos) {
      /* A proporção vem das medidas do PNG: width/height explícitos reservam o espaço certo. */
      b.push(
        `<figure><img src="${esc(d.png)}" width="${Math.round(d.largura)}" height="${Math.round(d.altura)}" alt="${esc(d.rotulo)}"><figcaption>${esc(d.rotulo)}</figcaption></figure>`,
      );
    }
  }

  const lang = m.idiomaDoTexto || 'pt';
  return `<!doctype html><html lang="${esc(lang)}" dir="${ehRTL(lang) ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.nomeDoArquivo)}</title><style>${CSS}</style></head><body>${b.join('\n')}</body></html>`;
}
