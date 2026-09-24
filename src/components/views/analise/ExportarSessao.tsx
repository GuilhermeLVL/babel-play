import { ChartColumn, Download, FileAudio, Layers, Lock, type LucideIcon, Video } from 'lucide-react';

import { apiFetch } from '../../../data/api';
import type { useMetricasDaSessao } from '../../../lib/analise/metricasDaSessao';
import { caminhoDoAudio } from '../../../lib/audioDaSessao';
import { data } from '../../../lib/i18n';
import type { Recording } from '../../../types';
import { Dialogo, fecharDialogoDe, IconeEmBloco } from '../../ui';

/**
 * EXPORTAR DADOS DA SESSÃO — `dialogoExportarSessao()` do protótipo aprovado.
 *
 * As quatro opções do protótipo, na ordem dele, cada uma com o que o app REALMENTE baixa:
 * - Áudio: o arquivo gravado nesta sessão (tracejado e com cadeado quando não há áudio).
 * - Vídeo: sempre bloqueado — só-áudio, ou vídeo de plataforma de terceiros (direitos autorais).
 * - Flashcards para Anki: o baralho real, em CSV (palavra; fonética; tradução; frase). O
 *   protótipo promete áudio nos cartões; o CSV não leva, então a descrição não promete.
 * - Métricas e desempenho: o relatório em Markdown (o protótipo diz CSV; o app gera .md).
 */

type Stats = ReturnType<typeof useMetricasDaSessao>['stats'];
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
}: {
  icone: LucideIcon;
  titulo: string;
  desc: string;
  trava?: boolean;
  aoEscolher?: (el: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      className={`cartao ${trava ? 'tracejado' : 'clicavel'} fonte`}
      aria-disabled={trava || undefined}
      onClick={(e) => !trava && aoEscolher?.(e.currentTarget)}
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
  aoFechar,
}: {
  recording: Recording;
  vocabCards: CartaoDoBaralho[];
  stats: Stats;
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
    } catch {
      /* download best-effort */
    }
  };

  // Deck REAL do usuário (nada hardcoded).
  const baixarAnki = (el: HTMLElement) => {
    const esc = (v?: string) => (v || '').replace(/;/g, ',').replace(/\n/g, ' ');
    const rows = vocabCards.map((c) => `${esc(c.word)};${esc(c.phonetics)};${esc(c.translation)};${esc(c.sentence)}`);
    const content = `Word;Phonetic;Translation;Sentence\n` + rows.join('\n') + '\n';
    baixar(new Blob([content], { type: 'text/csv;charset=utf-8;' }), `vocab_anki_${recording.id}.csv`);
    fecharDialogoDe(el);
  };

  const baixarMetricas = (el: HTMLElement) => {
    const content =
      `# Relatório de Sessão - Babel Play\n\n` +
      `**Sessão:** ${recording.title}\n` +
      `**Tipo:** ${recording.type}\n` +
      `**Total de Palavras:** ${recording.wordCount}\n\n` +
      `## Estatísticas do Texto (transcrição)\n` +
      `- Palavras: ${stats.wordCount}\n` +
      `- Vocábulos únicos: ${stats.uniqueWords}\n` +
      `- Frases: ${stats.sentenceCount}\n` +
      `- Densidade lexical: ${stats.lexicalDensityPct != null ? `${stats.lexicalDensityPct}%` : 'sem régua para este idioma'}
` +
      `- Razão tipo/token: ${Math.round(stats.typeTokenRatio * 100)}/100\n` +
      `- Facilidade de leitura (Flesch): ${stats.readingEase != null ? stats.readingEase : '-'}\n\n` +
      `Gerado em ${data(new Date())}`;
    baixar(new Blob([content], { type: 'text/markdown;charset=utf-8;' }), `relatorio_sessao_${recording.id}.md`);
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
        />
        <Opcao
          icone={Layers}
          titulo="Flashcards para Anki"
          desc={`${n === 1 ? 'A palavra' : `As ${n} palavras`}, com tradução e frase de exemplo.`}
          aoEscolher={baixarAnki}
        />
        <Opcao
          icone={ChartColumn}
          titulo="Métricas e desempenho"
          desc="Relatório .md com palavras, frases e legibilidade."
          aoEscolher={baixarMetricas}
        />
      </div>
    </Dialogo>
  );
}
