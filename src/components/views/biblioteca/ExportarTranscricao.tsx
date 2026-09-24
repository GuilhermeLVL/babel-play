import { Download, Info, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fetchSessionTranscript, type SessionTranscript } from '../../../data/api';
import type { Recording } from '../../../types';
import { toast } from '../../Toast';
import { Dialogo, fecharDialogoDe } from '../../ui';
import { CampoLinha, Interruptor } from '../vocab/Dialogo';

/**
 * EXPORTAR A TRANSCRIÇÃO — o `dialogoExportarTranscricao()` (B4) do protótipo aprovado, aberto pelo
 * menu "⋮" do card da Biblioteca.
 *
 * Os quatro formatos são montados aqui, das falas REAIS da sessão (`GET /api/sessions/:id`): texto
 * original, tradução e os tempos que o motor de transcrição gravou. Legenda (.srt/.vtt) sem tempos
 * não existe — uma sessão de texto importado não tem nenhum, e o botão diz isso em vez de inventar.
 */
type Formato = 'md' | 'txt' | 'srt' | 'vtt';

const FORMATOS: Array<[Formato, string, string, string]> = [
  ['md', 'Markdown', '.md', 'Para notas (Obsidian, Notion)'],
  ['txt', 'Texto', '.txt', 'Só o texto, sem formatação'],
  ['srt', 'Legenda', '.srt', 'Para players de vídeo'],
  ['vtt', 'Legenda web', '.vtt', 'Para a web e o YouTube'],
];

const relogio = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const tempoDeLegenda = (ms: number, sep: ',' | '.') => {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = Math.floor(ms % 1000);
  const d2 = (n: number) => String(n).padStart(2, '0');
  return `${d2(h)}:${d2(m)}:${d2(s)}${sep}${String(r).padStart(3, '0')}`;
};

export function montarTranscricao(
  t: SessionTranscript,
  titulo: string,
  formato: Formato,
  { trad, tempos }: { trad: boolean; tempos: boolean },
): string {
  const falas = t.utterances.filter((u) => (u.sourceText ?? '').trim());
  if (formato === 'srt' || formato === 'vtt') {
    const sep = formato === 'srt' ? ',' : '.';
    const blocos = falas
      .filter((u) => u.tStartMs != null)
      .map((u, i, l) => {
        const ini = u.tStartMs as number;
        const fim = u.tEndMs ?? l[i + 1]?.tStartMs ?? t.session.durationMs ?? ini;
        const linhas = [u.sourceText!.trim(), ...(trad && u.translatedText ? [u.translatedText.trim()] : [])];
        const cab = `${tempoDeLegenda(ini, sep)} --> ${tempoDeLegenda(Math.max(fim, ini), sep)}`;
        return formato === 'srt' ? `${i + 1}\n${cab}\n${linhas.join('\n')}` : `${cab}\n${linhas.join('\n')}`;
      });
    return (formato === 'vtt' ? 'WEBVTT\n\n' : '') + blocos.join('\n\n') + '\n';
  }
  const linhas = falas.map((u) => {
    const quando = tempos && u.tStartMs != null ? `[${relogio(u.tStartMs)}] ` : '';
    const quem = u.speakerName ? (formato === 'md' ? `**${u.speakerName}:** ` : `${u.speakerName}: `) : '';
    const tr =
      trad && u.translatedText
        ? formato === 'md'
          ? `\n> ${u.translatedText.trim()}`
          : `\n  ${u.translatedText.trim()}`
        : '';
    return `${quando}${quem}${u.sourceText!.trim()}${tr}`;
  });
  return (formato === 'md' ? `# ${titulo}\n\n` : `${titulo}\n\n`) + linhas.join('\n\n') + '\n';
}

export default function ExportarTranscricao({ rec, aoFechar }: { rec: Recording; aoFechar: () => void }) {
  const [formato, setFormato] = useState<Formato>('md');
  const [trad, setTrad] = useState(true);
  const [tempos, setTempos] = useState(true);
  const [dados, setDados] = useState<SessionTranscript | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    fetchSessionTranscript(rec.id)
      .then((t) => vivo && setDados(t))
      .catch((e) => vivo && setErro(String((e as Error)?.message || e)));
    return () => {
      vivo = false;
    };
  }, [rec.id]);

  const falas = dados?.utterances.filter((u) => (u.sourceText ?? '').trim()) ?? [];
  const temTempos = falas.some((u) => u.tStartMs != null);
  const legenda = formato === 'srt' || formato === 'vtt';
  const bloqueado = !dados || !falas.length || (legenda && !temTempos);

  const baixar = (el: HTMLElement) => {
    if (!dados) return;
    const texto = montarTranscricao(dados, rec.title, formato, { trad, tempos });
    const tipo = { md: 'text/markdown', txt: 'text/plain', srt: 'application/x-subrip', vtt: 'text/vtt' }[formato];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
    const nome = `${rec.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'transcricao'}.${formato}`;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.ok(`Baixando “${nome}”`);
    fecharDialogoDe(el);
  };

  return (
    <Dialogo icone={Download} titulo="Exportar a transcrição" sub={rec.title} aoFechar={aoFechar}>
      <div className="dlg-corpo pilha">
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
        <CampoLinha rotulo="Incluir a tradução" desc="Uma linha em português abaixo de cada fala.">
          <Interruptor ligado={trad} aoTrocar={() => setTrad((v) => !v)} rotulo="Incluir a tradução" />
        </CampoLinha>
        <CampoLinha
          rotulo="Incluir os tempos"
          desc={legenda ? 'Legendas sempre levam os tempos.' : 'Ex.: [00:04] antes de cada fala.'}
        >
          <Interruptor ligado={legenda || tempos} aoTrocar={() => setTempos((v) => !v)} rotulo="Incluir os tempos" />
        </CampoLinha>
        {dados && legenda && !temTempos && (
          <p className="aviso-info">
            <Info aria-hidden />
            <span>
              Esta sessão não tem tempos (é texto importado): a legenda precisa deles. Escolha Markdown ou Texto.
            </span>
          </p>
        )}
        {dados && !falas.length && (
          <p className="aviso-info">
            <Info aria-hidden />
            <span>Esta sessão ainda não tem transcrição para exportar.</span>
          </p>
        )}
        {erro && (
          <p className="aviso-info warn" role="alert">
            <Info aria-hidden />
            <span>Não deu para carregar a transcrição: {erro}</span>
          </p>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          Cancelar
        </button>
        <button type="button" className="btn btn-solid" disabled={bloqueado} onClick={(e) => baixar(e.currentTarget)}>
          {dados || erro ? <Download aria-hidden /> : <Loader2 aria-hidden className="animate-spin" />} Baixar .
          {formato}
        </button>
      </div>
    </Dialogo>
  );
}
