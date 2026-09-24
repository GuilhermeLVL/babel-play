import { ChartColumn, Download, FileAudio, Layers, Lock, type LucideIcon, Video } from 'lucide-react';

import { apiFetch, exportarApkg } from '../../../data/api';
import type { useMetricasDaSessao } from '../../../lib/analise/metricasDaSessao';
import { caminhoDoAudio } from '../../../lib/audioDaSessao';
import { data } from '../../../lib/i18n';
import type { Recording } from '../../../types';
import { toast } from '../../Toast';
import { Dialogo, fecharDialogoDe, IconeEmBloco } from '../../ui';

/**
 * EXPORTAR DADOS DA SESSÃO — `dialogoExportarSessao()` do protótipo aprovado.
 *
 * As quatro opções do protótipo, na ordem dele, cada uma com o que o app REALMENTE baixa:
 * - Áudio: o arquivo gravado nesta sessão (tracejado e com cadeado quando não há áudio).
 * - Vídeo: sempre bloqueado — só-áudio, ou vídeo de plataforma de terceiros (direitos autorais).
 * - Flashcards para Anki: as palavras DESTA sessão num `.apkg` (o mesmo gerador do Vocabulário),
 *   com a frase de exemplo. O protótipo promete áudio nos cartões; o `.apkg` não leva, então a
 *   descrição não promete.
 * - Métricas e desempenho: CSV com ritmo, pausas, vícios e o vocabulário da transcrição.
 */

type Stats = ReturnType<typeof useMetricasDaSessao>['stats'];
interface Ritmo {
  ppm: number | null;
  pausasLongas: number | null;
  vicios: number | null;
}
interface CartaoDoBaralho {
  word: string;
  phonetics?: string;
  translation?: string;
  sentence?: string;
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', nome);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** `op()` do protótipo: `.cartao.fonte`, clicável ou tracejado com cadeado. */
function Opcao({
  icone,
  titulo,
  desc,
  trava,
  aoEscolher,
  aoTravado,
}: {
  icone: LucideIcon;
  titulo: string;
  desc: string;
  trava?: boolean;
  aoEscolher?: (el: HTMLElement) => void;
  /** O aviso do protótipo ao clicar numa opção bloqueada. */
  aoTravado?: () => void;
}) {
  return (
    <button
      type="button"
      className={`cartao ${trava ? 'tracejado' : 'clicavel'} fonte`}
      aria-disabled={trava || undefined}
      onClick={(e) => (trava ? aoTravado?.() : aoEscolher?.(e.currentTarget))}
    >
      <IconeEmBloco icone={icone} />
      <span style={{ flex: 1 }}>
        <h3>
          {titulo}{' '}
          {trava && (
            <Lock aria-hidden style={{ width: 14, height: 14, color: 'var(--ink-muted)', display: 'inline' }} />
          )}
        </h3>
        <p>{desc}</p>
      </span>
      <Download aria-hidden style={{ width: 16, height: 16, color: 'var(--ink-muted)', alignSelf: 'center' }} />
    </button>
  );
}

export default function ExportarSessao({
  recording,
  vocabCards,
  stats,
  ritmo,
  aoFechar,
}: {
  recording: Recording;
  /** As palavras DESTA sessão que estão no caderno. */
  vocabCards: CartaoDoBaralho[];
  stats: Stats;
  ritmo: Ritmo;
  aoFechar: () => void;
}) {
  const baixarAudio = async (el: HTMLElement) => {
    fecharDialogoDe(el);
    try {
      /* `apiFetch`, e não `fetch`: esta rota exige o Bearer no modo público, e o download
         silenciosamente virava um arquivo de erro de 401. */
      const r = await apiFetch(caminhoDoAudio(recording.id), { timeoutMs: 300_000 });
      if (!r.ok) throw new Error(`áudio indisponível (${r.status})`);
      const blob = await r.blob();
      const t = blob.type || '';
      const ext = t.includes('webm')
        ? 'webm'
        : t.includes('mpeg') || t.includes('mp3')
          ? 'mp3'
          : t.includes('wav')
            ? 'wav'
            : t.includes('ogg')
              ? 'ogg'
              : t.includes('mp4')
                ? 'm4a'
                : 'audio';
      baixar(blob, `audio_sessao_${recording.id}.${ext}`);
      toast.ok('Áudio da sessão: download iniciado');
    } catch (e) {
      toast.error('Não deu para baixar o áudio da sessão.', { detail: e });
    }
  };

  // As palavras desta sessão, num baralho do Anki de verdade (o gerador do servidor).
  const baixarAnki = async (el: HTMLElement) => {
    fecharDialogoDe(el);
    try {
      const blob = await exportarApkg(
        vocabCards
          .filter((c) => (c.translation ?? '').trim())
          .map((c) => ({ frente: c.word, verso: c.translation ?? '', exemplo: c.sentence })),
        `Babel Play · ${recording.title}`,
      );
      baixar(blob, `babel-sessao-${recording.id}.apkg`);
      toast.ok('Flashcards para Anki: download iniciado');
    } catch (e) {
      toast.error('Não deu para gerar o baralho do Anki.', { detail: e });
    }
  };

  const baixarMetricas = (el: HTMLElement) => {
    const vazio = (v: number | null | undefined) => (v == null ? '' : String(v));
    const linhas: Array<[string, string]> = [
      ['sessao', recording.title],
      ['gerado_em', data(new Date())],
      ['palavras_por_minuto', vazio(ritmo.ppm)],
      ['pausas_longas', vazio(ritmo.pausasLongas)],
      ['vicios_de_linguagem', vazio(ritmo.vicios)],
      ['palavras', String(stats.wordCount)],
      ['palavras_unicas', String(stats.uniqueWords)],
      ['frases', String(stats.sentenceCount)],
      ['densidade_lexical_pct', vazio(stats.lexicalDensityPct)],
      ['riqueza_ttr_pct', String(Math.round(stats.typeTokenRatio * 100))],
      ['facilidade_de_leitura', vazio(stats.readingEase)],
      ['palavras_no_caderno', String(vocabCards.length)],
    ];
    const cel = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = ['metrica,valor', ...linhas.map(([k, v]) => `${k},${cel(v)}`)].join('\n') + '\n';
    baixar(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `metricas_sessao_${recording.id}.csv`);
    toast.ok('Métricas e desempenho: download iniciado');
    fecharDialogoDe(el);
  };

  const temAudio = !!recording.audioUrl;
  const n = vocabCards.length;

  return (
    <Dialogo
      icone={Download}
      titulo="Exportar dados da sessão"
      sub="Escolha o que levar para fora do app."
      largura=""
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha">
        <Opcao
          icone={FileAudio}
          titulo="Áudio da sessão"
          desc={
            temAudio
              ? `O arquivo da gravação original${recording.durationStr ? `, ${recording.durationStr}` : ''}.`
              : 'Sem áudio gravado nesta sessão.'
          }
          trava={!temAudio}
          aoEscolher={(el) => void baixarAudio(el)}
          aoTravado={() => toast.info('Áudio: esta sessão não tem gravação')}
        />
        <Opcao
          icone={Video}
          titulo="Vídeo da sessão"
          desc={
            recording.type === 'video'
              ? 'Download bloqueado: direitos autorais da plataforma de origem.'
              : 'Download bloqueado: esta sessão é só de áudio.'
          }
          trava
          aoTravado={() =>
            toast.info(
              recording.type === 'video'
                ? 'Vídeo: download bloqueado pelos direitos da plataforma de origem'
                : 'Vídeo: download bloqueado, esta sessão é só de áudio',
            )
          }
        />
        <Opcao
          icone={Layers}
          titulo="Flashcards para Anki"
          desc={
            n
              ? `${n === 1 ? 'A palavra' : `As ${n} palavras`} desta sessão, com frase de exemplo.`
              : 'Nenhuma palavra desta sessão no caderno ainda.'
          }
          trava={n === 0}
          aoEscolher={(el) => void baixarAnki(el)}
          aoTravado={() => toast.info('Flashcards: guarde uma palavra desta sessão primeiro')}
        />
        <Opcao
          icone={ChartColumn}
          titulo="Métricas e desempenho"
          desc="CSV com ritmo, pausas e vocabulário."
          aoEscolher={baixarMetricas}
        />
      </div>
    </Dialogo>
  );
}
