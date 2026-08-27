import React, { useRef, useState } from 'react';
import { ArrowLeft, Upload, Download, Loader2, AlertTriangle, FileText, Info } from 'lucide-react';
import { lerBaralhoAnki, bulkAddCards, exportarApkg, type LeituraAnki, type CartaoPulado } from '../../data/api';
import { motivoLegivel, ROTULO_MOTIVO, type MotivoDescarte } from '@core';
import type { VocabCard } from '../../types';
import type { AgeProfileType } from '../../lib/profile';
import { toast } from '../Toast';

/**
 * BARALHOS DO ANKI — trazer e levar.
 *
 * POR QUE IMPORTAR. Existe um acervo enorme de baralhos prontos de idiomas, e obrigar quem já tem
 * um a recomeçar do zero aqui seria pedir que jogue fora um trabalho que já fez. Trazer o baralho
 * é o caminho mais rápido de sair do vocabulário vazio sem depender de captura.
 *
 * POR QUE EXPORTAR, e isto importa tanto quanto: o vocabulário é da pessoa, não do aplicativo. Um
 * app que só aceita entrada prende; poder levar embora é o que torna a escolha de ficar uma
 * escolha de verdade.
 *
 * A IMPORTAÇÃO É EM DOIS PASSOS de propósito — ler, mostrar, e só então gravar. O baralho passa
 * pela MESMA régua de qualidade e pela MESMA deduplicação de tudo que entra no vocabulário; um
 * caminho paralelo seria a porta por onde o lixo que acabamos de tirar voltaria a entrar. E
 * mexer no vocabulário de alguém sem mostrar antes o que vai acontecer é abuso de confiança.
 */

interface BaralhoAnkiProps {
  deck: VocabCard[];
  /** Idiomas a atribuir ao que for importado — o Anki não guarda essa informação de forma confiável. */
  idioma: string;
  idiomaNativo: string;
  ageProfile: AgeProfileType;
  onVoltar: () => void;
  onImportou: () => void | Promise<void>;
}

/** Teto por importação. Um baralho do AnkiWeb tem milhares de notas; entrar tudo de uma vez
 *  inundaria a fila de revisão e a pessoa abriria o app com 3.000 cartões vencendo no mesmo dia. */
const TETO = 300;

export default function BaralhoAnki({
  deck, idioma, idiomaNativo, ageProfile, onVoltar, onImportou,
}: BaralhoAnkiProps) {
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [leitura, setLeitura] = useState<LeituraAnki | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ entraram: number; pulados: CartaoPulado[] } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null);
    setResultado(null);
    setLeitura(null);
    setNomeArquivo(arquivo.name);
    setLendo(true);
    try {
      setLeitura(await lerBaralhoAnki(arquivo));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  };

  const gravar = async () => {
    if (!leitura) return;
    setGravando(true);
    try {
      const { cards, skipped } = await bulkAddCards(leitura.notas.slice(0, TETO).map(n => ({
        word: n.frente,
        back: n.verso,
        sentence: n.exemplo,
        srcLang: idioma,
        tgtLang: idiomaNativo,
        sessionId: `anki:${nomeArquivo}`.slice(0, 64),
      })));
      setResultado({ entraram: cards.length, pulados: skipped });
      await onImportou();
      if (cards.length) toast.ok(`${cards.length} ${cards.length === 1 ? 'palavra entrou' : 'palavras entraram'}`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGravando(false);
    }
  };

  /** As palavras que dá para levar: só as que têm tradução — cartão de um lado só não é cartão. */
  const exportaveis = deck.filter(c => c.inDeck && (c.translation ?? '').trim());

  const baixar = (blob: Blob, nome: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** `.apkg`: abre no Anki com duplo clique e chega com nome de baralho. */
  const exportarBaralho = async () => {
    if (!exportaveis.length) { toast.warn('Não há palavras com tradução para exportar.'); return; }
    setGravando(true);
    try {
      const blob = await exportarApkg(
        exportaveis.map(c => ({ frente: c.word, verso: c.translation, exemplo: c.sentence })),
        `Babel Play ${idioma || ''}`.trim(),
      );
      baixar(blob, `babel-${idioma || 'deck'}-${new Date().toISOString().slice(0, 10)}.apkg`);
      toast.ok(`${exportaveis.length} palavras no arquivo`);
    } catch (e) {
      toast.error(`Não consegui gerar o .apkg: ${(e as Error).message}`);
    } finally { setGravando(false); }
  };

  /**
   * EXPORTAR em texto separado por tabulação — o formato que o Anki importa NATIVAMENTE, sem
   * plugin nem conversão. Fica ao lado do `.apkg` de propósito: é o caminho que funciona mesmo
   * que a versão do Anki recuse o pacote, e o que serve para abrir numa planilha.
   */
  const exportar = () => {
    const linhas = exportaveis
      .map(c => [c.word, c.translation, c.sentence ?? '']
        .map(x => String(x).replace(/\t/g, ' ').replace(/\r?\n/g, ' '))
        .join('\t'));
    if (!linhas.length) { toast.warn('Não há palavras com tradução para exportar.'); return; }

    // O cabeçalho `#separator:tab` é lido pelo Anki e evita a tela de escolher separador.
    const conteudo = ['#separator:tab', '#html:false', ...linhas].join('\n');
    baixar(new Blob([conteudo], { type: 'text/plain;charset=utf-8' }),
      `babel-${idioma || 'deck'}-${new Date().toISOString().slice(0, 10)}.txt`);
    toast.ok(`${linhas.length} palavras exportadas`);
  };

  const totalUtil = leitura ? Math.min(leitura.notas.length, TETO) : 0;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 pb-28 animate-in fade-in duration-200">
      <header className="mb-6">
        <button onClick={onVoltar} className="flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink mb-3 py-1 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Voltar aos jogos
        </button>
        <h1 className="font-display font-black text-2xl text-ink tracking-tight">
          {ageProfile === 'kids' ? 'Trazer palavras de fora' : 'Baralhos do Anki'}
        </h1>
        <p className="text-[13px] text-ink-muted mt-1 max-w-[70ch]">
          Traga um baralho pronto que você já tenha, ou leve o seu vocabulário embora. As palavras
          importadas entram nos jogos como todas as outras.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ─── IMPORTAR ─── */}
        <section className="card-panel bg-surface p-5 flex flex-col gap-3">
          <span className="label-mono flex items-center gap-2">
            <Upload className="w-4 h-4 text-accent" aria-hidden /> Trazer um baralho
          </span>

          <input
            ref={inputRef}
            type="file"
            accept=".apkg,.txt,.csv,.tsv"
            className="hidden"
            onChange={e => void escolher(e.target.files?.[0])}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={lendo}
            className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {lendo ? <><Loader2 className="w-4 h-4 animate-spin" /> lendo…</> : <><Upload className="w-4 h-4" /> Escolher arquivo</>}
          </button>
          <p className="text-[11px] text-ink-faint">
            Aceita <b>.apkg</b> (o que se baixa do AnkiWeb, inclusive os novos, comprimidos) e
            texto <b>.txt</b>/<b>.csv</b>.
          </p>

          {erro && (
            <p className="flex items-start gap-2 text-[12px] text-error-ink bg-error-soft border border-error/20 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {erro}
            </p>
          )}

          {/* A PRÉVIA: o que foi lido, ANTES de gravar. */}
          {leitura && !resultado && (
            <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
              <div className="text-[12px] text-ink-muted flex flex-wrap gap-x-4 gap-y-1">
                <span><b className="text-ink">{leitura.notas.length}</b> notas lidas</span>
                {leitura.descartadas > 0 && <span>{leitura.descartadas} sem um dos lados</span>}
                <span className="font-mono text-[11px]">{leitura.formato}</span>
              </div>
              {leitura.campos.length > 0 && (
                <p className="text-[11px] text-ink-faint">
                  Campos do baralho: {leitura.campos.join(' · ')} → viram <b>palavra</b>,{' '}
                  <b>tradução</b>{leitura.campos.length > 2 && <> e <b>frase</b></>}.
                </p>
              )}

              {/* Amostra real: a pessoa confere se os lados não vieram trocados. */}
              <ul className="flex flex-col gap-1">
                {leitura.notas.slice(0, 4).map((n, i) => (
                  <li key={i} className="text-[12px] flex gap-2 items-baseline">
                    <span className="font-bold text-ink">{n.frente}</span>
                    <span className="text-ink-faint">=</span>
                    <span className="text-ink-muted truncate">{n.verso}</span>
                  </li>
                ))}
              </ul>

              {leitura.temMidia && (
                <p className="flex items-start gap-2 text-[11px] text-warn-ink">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                  Este baralho tem áudio ou imagem. Trazemos só o texto, o resto ficaria sem uso aqui.
                </p>
              )}
              {leitura.notas.length > TETO && (
                <p className="flex items-start gap-2 text-[11px] text-warn-ink">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                  Vou trazer as primeiras <b>{TETO}</b>. Mais que isso de uma vez encheria a sua fila
                  de revisão de amanhã, importe de novo quando quiser as próximas.
                </p>
              )}

              <button
                onClick={() => void gravar()}
                disabled={gravando || !totalUtil}
                className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {gravando ? <><Loader2 className="w-4 h-4 animate-spin" /> gravando…</> : `Trazer ${totalUtil} para o meu baralho`}
              </button>
            </div>
          )}

          {/* O SALDO REAL: entrou, e o que não entrou, com o motivo de cada grupo. */}
          {resultado && (
            <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
              <p className="text-[13px] font-bold text-good-ink">{resultado.entraram} entraram no seu baralho</p>
              {resultado.pulados.length > 0 && (
                <>
                  <p className="text-[12px] text-ink-muted">{resultado.pulados.length} não entraram:</p>
                  <ul className="flex flex-col gap-0.5">
                    {Object.entries(
                      resultado.pulados.reduce<Record<string, number>>((acc, p) => {
                        acc[p.motivo] = (acc[p.motivo] ?? 0) + 1;
                        return acc;
                      }, {}),
                    ).map(([motivo, n]) => (
                      <li key={motivo} className="text-[12px] text-ink-muted">
                        <b className="text-ink">{n}</b>{' '}
                        {ROTULO_MOTIVO[motivo as MotivoDescarte]?.titulo.toLowerCase() ?? motivoLegivel(motivo)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>

        {/* ─── EXPORTAR ─── */}
        <section className="card-panel bg-surface p-5 flex flex-col gap-3">
          <span className="label-mono flex items-center gap-2">
            <Download className="w-4 h-4 text-accent" aria-hidden /> Levar o meu embora
          </span>
          <p className="text-[12px] text-ink-muted leading-relaxed">
            Leva palavra, tradução e a frase de onde ela veio. São <b>{exportaveis.length}</b> palavras
            com tradução no seu baralho.
          </p>
          <button
            onClick={() => void exportarBaralho()}
            disabled={gravando || !exportaveis.length}
            className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {gravando ? <><Loader2 className="w-4 h-4 animate-spin" /> montando…</> : <><Download className="w-4 h-4" /> Baralho .apkg</>}
          </button>
          <button
            onClick={exportar}
            disabled={!exportaveis.length}
            className="py-2.5 px-4 bg-canvas border border-border-subtle hover:border-accent text-ink rounded-xl font-bold text-[13px] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" /> Texto (.txt)
          </button>
          {/* Os DOIS, e a diferença dita: o `.apkg` é o mais confortável, o texto é o que nunca
              falha. Prometer um só seria escolher pela pessoa sem ela saber o custo. */}
          <p className="text-[11px] text-ink-faint leading-relaxed">
            O <b>.apkg</b> abre no Anki com duplo clique e já chega com nome de baralho. O
            <b> .txt</b> é separado por tabulação: o Anki importa sem plugin nenhum, e abre em
            planilha. Em nenhum dos dois vai o histórico de revisão, o agendamento daqui é outro,
            e as datas não corresponderiam a nada lá.
          </p>
        </section>
      </div>
    </div>
  );
}
