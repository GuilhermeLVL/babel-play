/**
 * EXPORTAR O VOCABULÁRIO — o diálogo "V1" do protótipo aprovado (`dialogoExportarVocab()`).
 *
 * Os quatro formatos do desenho, e todos de verdade:
 *  - Baralho do Anki (`.apkg`): gerado no SERVIDOR (`exportarApkg`), o mesmo da tela do Anki;
 *  - Planilha (`.csv`) e Quizlet (`.txt`, palavra e tradução separadas por tab): montados aqui,
 *    do deck real;
 *  - Relatório (`.txt`): o relatório de progresso que o antigo "Exportar relatório" já baixava.
 *
 * "Filtradas" usa o filtro que está no catálogo agora (busca, níveis e origens, resolvidos no
 * servidor). FICA DE FORA do desenho: "Incluir o áudio da pronúncia" — o `.apkg` que o servidor
 * gera não leva mídia.
 */
import { isDueNow } from '@core';
import { Download, Info } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { type AppMetrics, exportarApkg } from '../../../data/api';
import { langLabelNaUI } from '../../../lib/languages';
import { baixarRelatorio } from '../../../lib/relatorioDeProgresso';
import type { VocabCard } from '../../../types';
import { toast } from '../../Toast';
import { type FiltroDoCatalogo, idsDoFiltro } from './CatalogoDePalavras';
import Dialogo, { CampoLinha, Interruptor, Segmentos } from './Dialogo';

type Formato = 'apkg' | 'csv' | 'tsv' | 'txt';
type Escopo = 'todas' | 'filtradas' | 'revisar';

const FORMATOS: Array<[Formato, string, string, string]> = [
  ['apkg', 'Baralho do Anki', '.apkg', 'Abre direto no Anki e no AnkiDroid'],
  ['csv', 'Planilha', '.csv', 'Excel, Google Planilhas'],
  ['tsv', 'Quizlet', '.txt', 'Palavra e tradução separadas por tab'],
  ['txt', 'Relatório', '.txt', 'Resumo do progresso para ler'],
];

function baixar(blob: Blob, nome: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

const celulaCsv = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const semQuebra = (v: string) => v.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');

export default function ExportarVocabulario({
  cartoes,
  metrics,
  idioma,
  filtro,
  formatoInicial = 'apkg',
  aoFechar,
}: {
  cartoes: VocabCard[];
  metrics: AppMetrics | null;
  idioma: string;
  /** O filtro do catálogo agora; sem ele, "Filtradas" é igual a "Todas". */
  filtro: FiltroDoCatalogo | null;
  /** O formato já marcado ao abrir: a aba "Trazer e levar" de Cartões abre em cada um dos quatro. */
  formatoInicial?: Formato;
  aoFechar: () => void;
}) {
  const [formato, setFormato] = useState<Formato>(formatoInicial);
  const [escopo, setEscopo] = useState<Escopo>('todas');
  const [frase, setFrase] = useState(true);
  const [enviando, setEnviando] = useState(false);
  /* `qv-dlg` liga o acabamento dos formatos e da prévia (`questVocabulario.css`). */

  const noBaralho = useMemo(() => cartoes.filter((c) => c.inDeck), [cartoes]);
  const paraRevisar = useMemo(() => noBaralho.filter((c) => isDueNow(c)), [noBaralho]);
  const temFiltro = !!filtro && (!!filtro.q || filtro.niveis.length > 0 || filtro.origens.length > 0);
  const [idsFiltrados, setIdsFiltrados] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (escopo !== 'filtradas' || !filtro || !temFiltro) return;
    let vivo = true;
    idsDoFiltro(filtro)
      .then((ids) => vivo && setIdsFiltrados(ids))
      .catch(() => vivo && setIdsFiltrados(new Set()));
    return () => {
      vivo = false;
    };
  }, [escopo, filtro, temFiltro]);
  const filtradas = useMemo(
    () => (temFiltro ? (idsFiltrados ? noBaralho.filter((c) => idsFiltrados.has(c.id)) : []) : noBaralho),
    [temFiltro, idsFiltrados, noBaralho],
  );
  const escolhidas = escopo === 'revisar' ? paraRevisar : escopo === 'filtradas' ? filtradas : noBaralho;
  const nomeDoIdioma = idioma ? langLabelNaUI(idioma).toLowerCase() : '';
  /** Cartão sem verso não vira cartão no Anki nem no Quizlet: fica de fora, e o número diz isso. */
  const saem =
    formato === 'apkg' || formato === 'tsv' ? escolhidas.filter((c) => (c.translation ?? '').trim()) : escolhidas;
  const n = formato === 'txt' ? noBaralho.length : saem.length;
  const bloqueado = formato === 'txt' ? !metrics : n === 0;
  const exemplo = saem[0];
  const data = new Date().toISOString().slice(0, 10);

  const exportar = async () => {
    if (formato === 'txt') {
      if (metrics) baixarRelatorio(metrics, cartoes);
      aoFechar();
      return;
    }
    if (formato === 'apkg') {
      setEnviando(true);
      try {
        const blob = await exportarApkg(
          saem.map((c) => ({ frente: c.word, verso: c.translation, exemplo: frase ? c.sentence : undefined })),
          `Babel Play ${nomeDoIdioma}`.trim(),
        );
        baixar(blob, `babel-${idioma || 'deck'}-${data}.apkg`);
        toast.ok(`Baixando “${`Babel Play ${nomeDoIdioma}`.trim()}.apkg”: abra com o Anki`);
        aoFechar();
      } catch (e) {
        toast.error(`Não consegui gerar o .apkg: ${(e as Error).message}`);
      } finally {
        setEnviando(false);
      }
      return;
    }
    if (formato === 'csv') {
      const cab = ['palavra', 'tradução', ...(frase ? ['frase'] : []), 'nível'];
      const linhas = saem.map((c) =>
        [c.word, c.translation ?? '', ...(frase ? [c.sentence ?? ''] : []), c.cefrLevel ?? '']
          .map((v) => celulaCsv(String(v)))
          .join(','),
      );
      baixar(
        new Blob([[cab.join(','), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' }),
        `babel-vocabulario-${data}.csv`,
      );
    } else {
      const linhas = saem.map((c) => `${semQuebra(c.word)}\t${semQuebra(c.translation ?? '')}`);
      baixar(new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' }), `babel-vocabulario-${data}.txt`);
    }
    toast.ok(`Baixando babel-vocabulario-${data}.${formato === 'csv' ? 'csv' : 'txt'}`);
    aoFechar();
  };

  return (
    <Dialogo
      icone={Download}
      titulo="Exportar o vocabulário"
      sub="Leve o seu caderno para o Anki, uma planilha ou um relatório."
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha rola-dlg qv-dlg">
        <div>
          <span className="label-mono">Formato</span>
          <div className="g-formatos" role="radiogroup" aria-label="Formato">
            {FORMATOS.map(([v, r, ext, d]) => (
              <button
                key={v}
                type="button"
                className="cartao formato"
                role="radio"
                aria-checked={formato === v}
                onClick={() => setFormato(v)}
              >
                <b>
                  {r} <code>{ext}</code>
                </b>
                <small className="mut">{d}</small>
              </button>
            ))}
          </div>
        </div>
        {formato !== 'txt' && (
          <div>
            <span className="label-mono">Quais palavras</span>
            <Segmentos<Escopo>
              atual={escopo}
              aoTrocar={setEscopo}
              rotulo="Quais palavras"
              opcoes={[
                ['todas', `Todas · ${noBaralho.length}`],
                ['filtradas', `Filtradas · ${temFiltro ? (filtro?.total ?? 0) : noBaralho.length}`],
                ['revisar', `Para revisar · ${paraRevisar.length}`],
              ]}
            />
          </div>
        )}
        {(formato === 'apkg' || formato === 'csv') && (
          <CampoLinha rotulo="Incluir a frase de exemplo">
            <Interruptor ligado={frase} aoTrocar={() => setFrase(!frase)} rotulo="Incluir a frase" />
          </CampoLinha>
        )}
        {formato === 'apkg' && exemplo && (
          <div>
            <span className="label-mono">Como o cartão fica no Anki</span>
            <div className="cartao-anki">
              <div className="frente">{exemplo.word}</div>
              <div className="verso">
                <b>{exemplo.translation}</b>
                {frase && exemplo.sentence && <i>{exemplo.sentence}</i>}
              </div>
            </div>
          </div>
        )}
        {
          <p className="mut" style={{ fontSize: 12.5 }}>
            <Info style={{ width: 13, height: 13, verticalAlign: -2, display: 'inline' }} aria-hidden /> O histórico da
            revisão não vai junto: no Anki, as palavras começam como novas.
          </p>
        }
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={aoFechar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-solid"
          disabled={bloqueado || enviando}
          onClick={() => void exportar()}
        >
          <Download aria-hidden />{' '}
          {enviando
            ? 'Gerando…'
            : formato === 'txt'
              ? 'Baixar o relatório'
              : `Baixar ${n} palavra${n === 1 ? '' : 's'}`}
        </button>
      </div>
    </Dialogo>
  );
}
