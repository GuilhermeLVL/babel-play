import '../../../styles/exportacao.css';

import {
  ChartColumn,
  Download,
  FileAudio,
  FileDown,
  FileText,
  Layers,
  Lock,
  type LucideIcon,
  MessagesSquare,
  Sparkles,
  Type,
  Video,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch, exportarApkg } from '../../../data/api';
import type { useMetricasDaSessao } from '../../../lib/analise/metricasDaSessao';
import { caminhoDoAudio } from '../../../lib/audioDaSessao';
import type { DesenhoDaSessao } from '../../../lib/desenho/desenhosDaSessao';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import type { EntradaDoRelatorio, ModeloDoRelatorio, SecaoId } from '../../../lib/exportacao/modeloDoRelatorio';
import { data, numero, t, tp } from '../../../lib/i18n';
import type { Anotacao } from '../../../lib/leitura/anotacaoDaFrase';
import type { Recording } from '../../../types';
import { toast } from '../../Toast';
import { Dialogo, fecharDialogoDe, IconeEmBloco } from '../../ui';

/**
 * EXPORTAR DADOS DA SESSÃO — `dialogoExportarSessao()` do protótipo aprovado, agora com o RELATÓRIO.
 *
 * - Relatório da sessão: PDF e Markdown com as seções que a pessoa liga e desliga (cabeçalho,
 *   métricas, conversa, palavras, palavras novas, notas, desenhos). Um modelo só
 *   (`lib/exportacao/modeloDoRelatorio`), dois desenhos (`paraMarkdown`, `paraHtmlImprimivel`).
 * - Só uma parte: conversa (.md/.txt), palavras e palavras novas (CSV/.md), métricas (CSV).
 * - Arquivos da sessão: áudio, vídeo (bloqueado) e flashcards para Anki.
 *
 * O código de exportação é carregado SÓ aqui, ao abrir o diálogo / clicar: nada disso entra no
 * pacote inicial.
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

/** O que a tela de Análise já tem e o relatório precisa (o resto — notas e desenhos — o diálogo busca). */
export type DadosDoRelatorio = Omit<EntradaDoRelatorio, 'anotacoes' | 'desenhos' | 'geradoEm'>;

type Modulo = typeof import('../../../lib/exportacao/modeloDoRelatorio');

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
  const questNovo = useQuestNovo();
  /* META QUEST: a mesma opção como uma linha de lista (alvo de 72 px). A bloqueada continua na
     lista, tracejada e com cadeado, e o toque diz o motivo. */
  if (questNovo) {
    const Icone = icone;
    return (
      <button
        type="button"
        className={`q-linha ${trava ? 'qs-travada' : ''}`}
        aria-disabled={trava || undefined}
        onClick={(e) => (trava ? aoTravado?.() : aoEscolher?.(e.currentTarget))}
      >
        <span className="q-ic">
          <Icone aria-hidden />
        </span>
        <span>
          <b>{titulo}</b>
          <small>{desc}</small>
        </span>
        <span className="q-fim">{trava ? <Lock aria-hidden /> : <Download aria-hidden />}</span>
      </button>
    );
  }
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

/** Uma exportação avulsa com mais de um formato: um botão por formato; sem conteúdo, tracejada e com o motivo. */
function LinhaComFormatos({
  icone: Icone,
  titulo,
  desc,
  vazio,
  formatos,
  ocupado,
}: {
  icone: LucideIcon;
  titulo: string;
  desc: string;
  /** O motivo de não haver o que exportar; presente = linha desabilitada. */
  vazio?: string;
  formatos: Array<{ rotulo: string; aoEscolher: () => void }>;
  ocupado: boolean;
}) {
  const questNovo = useQuestNovo();
  return (
    <div className={`exp-linha ${vazio ? 'vazia' : ''}`}>
      {questNovo ? (
        <span className="q-ic">
          <Icone aria-hidden />
        </span>
      ) : (
        <IconeEmBloco icone={Icone} />
      )}
      <span className="exp-txt">
        <b>{titulo}</b>
        <small>{vazio ?? desc}</small>
      </span>
      <span className="exp-fmts">
        {formatos.map((f) => (
          <button
            key={f.rotulo}
            type="button"
            className={questNovo ? 'q-ctl' : 'btn btn-outline peq'}
            disabled={!!vazio || ocupado}
            aria-label={`${titulo}: ${f.rotulo}`}
            onClick={f.aoEscolher}
          >
            <Download aria-hidden /> {f.rotulo}
          </button>
        ))}
      </span>
    </div>
  );
}

const ROTULO_DA_SECAO: Record<SecaoId, string> = {
  cabecalho: 'Cabeçalho',
  metricas: 'Resumo e métricas',
  conversa: 'Conversa',
  palavras: 'Palavras',
  palavrasNovas: 'Palavras novas',
  notas: 'Notas e marcações',
  desenhos: 'Desenhos',
};

const MB = 1024 * 1024;

export default function ExportarSessao({
  recording,
  vocabCards,
  stats,
  ritmo,
  dados,
  aoFechar,
}: {
  recording: Recording;
  /** As palavras DESTA sessão que estão no caderno. */
  vocabCards: CartaoDoBaralho[];
  stats: Stats;
  ritmo: Ritmo;
  /** Tudo o que o relatório lê da tela. Sem isto o relatório não aparece (só as opções antigas). */
  dados?: DadosDoRelatorio;
  aoFechar: () => void;
}) {
  const questNovo = useQuestNovo();
  const [modelo, setModelo] = useState<Modulo | null>(null);
  const [desenhos, setDesenhos] = useState<DesenhoDaSessao[]>([]);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [secoes, setSecoes] = useState<Record<SecaoId, boolean>>({
    cabecalho: true,
    metricas: true,
    conversa: true,
    palavras: true,
    palavrasNovas: true,
    notas: true,
    desenhos: true,
  });
  const [gerando, setGerando] = useState<string | null>(null);

  /* Carrega o código do relatório, as notas da Leitura e os desenhos — só ao abrir o diálogo. */
  const temDados = !!dados;
  useEffect(() => {
    let vivo = true;
    if (!temDados) return;
    void import('../../../lib/exportacao/modeloDoRelatorio').then((m) => vivo && setModelo(m));
    void import('../../../lib/leitura/anotacaoDaFrase').then(({ lerAnotacoes }) => {
      try {
        if (vivo) setAnotacoes(lerAnotacoes(localStorage.getItem(`readingAnnotations:${recording.id}`)));
      } catch {
        /* sem armazenamento: sem notas */
      }
    });
    void import('../../../lib/desenho/desenhosDaSessao')
      .then((m) => m.desenhosDaSessao(recording.id))
      .then((l) => vivo && setDesenhos(l))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [temDados, recording.id]);

  const montar = (ligadas?: Partial<Record<SecaoId, boolean>>): ModeloDoRelatorio | null =>
    modelo && dados
      ? modelo.montarModeloDoRelatorio({ ...dados, anotacoes, desenhos, geradoEm: new Date() }, { secoes: ligadas })
      : null;

  /* Contagens do que há para exportar, com todas as seções ligadas (uma vez, não a cada caixa marcada). */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todo = useMemo(() => montar(), [modelo, dados, anotacoes, desenhos]);
  const n = {
    conversa: todo?.conversa.length ?? 0,
    palavras: todo?.palavras.length ?? 0,
    novas: todo?.palavrasNovas.length ?? 0,
    notas: todo?.notas.length ?? 0,
    desenhos: desenhos.length,
  };
  const bytesDosDesenhos = desenhos.reduce((s, d) => s + d.png.length, 0);

  const gerar = async (formato: 'pdf' | 'md') => {
    const m = montar(secoes);
    if (!m) return;
    setGerando(formato);
    try {
      const { baixarTexto } = await import('../../../lib/exportacao/baixar');
      if (formato === 'md') {
        const { paraMarkdown } = await import('../../../lib/exportacao/paraMarkdown');
        baixarTexto(paraMarkdown(m), `${m.nomeDoArquivo}.md`, 'text/markdown');
        toast.ok(t('Relatório em Markdown: download iniciado'));
      } else {
        const { gerarPdfDoRelatorio } = await import('../../../lib/exportacao/gerarPdfDoRelatorio');
        const via = await gerarPdfDoRelatorio(m, (html, nome) => baixarTexto(html, nome, 'text/html'));
        if (via === 'impressao') toast.ok(t('Relatório pronto: na janela de impressão, escolha “Salvar como PDF”.'));
        else
          toast.info(
            t('Este aparelho não imprime: baixei a página do relatório. Abra-a num computador e salve como PDF.'),
          );
      }
    } catch (e) {
      toast.error(t('Não deu para gerar o relatório.'), { detail: e });
    } finally {
      setGerando(null);
    }
  };

  /** As exportações avulsas: do modelo inteiro, só a parte pedida. */
  const avulso = async (
    qual: 'conversa-md' | 'conversa-txt' | 'palavras-csv' | 'palavras-md' | 'novas-csv' | 'novas-md',
  ) => {
    const m = montar();
    if (!m) return;
    setGerando(qual);
    try {
      const md = await import('../../../lib/exportacao/paraMarkdown');
      const { baixarTexto } = await import('../../../lib/exportacao/baixar');
      const base = m.nomeDoArquivo;
      if (qual === 'conversa-md')
        baixarTexto(`# ${m.titulo}\n\n${md.conversaParaMd(m)}`, `${base}-conversa.md`, 'text/markdown');
      else if (qual === 'conversa-txt') baixarTexto(md.conversaParaTxt(m), `${base}-conversa.txt`, 'text/plain');
      else if (qual === 'palavras-csv')
        baixarTexto(md.palavrasParaCsv(m.palavras, false), `${base}-palavras.csv`, 'text/csv');
      else if (qual === 'palavras-md')
        baixarTexto(
          `# ${m.titulo}\n\n## ${t('Palavras')}\n\n${md.palavrasParaMd(m.palavras, false)}`,
          `${base}-palavras.md`,
          'text/markdown',
        );
      else if (qual === 'novas-csv')
        baixarTexto(md.palavrasParaCsv(m.palavrasNovas, true), `${base}-palavras-novas.csv`, 'text/csv');
      else
        baixarTexto(
          `# ${m.titulo}\n\n## ${t('Palavras novas')}\n\n${md.palavrasParaMd(m.palavrasNovas, true, m.palavrasNovasOmitidas)}`,
          `${base}-palavras-novas.md`,
          'text/markdown',
        );
      toast.ok(t('Download iniciado'));
    } catch (e) {
      toast.error(t('Não deu para gerar o arquivo.'), { detail: e });
    } finally {
      setGerando(null);
    }
  };

  const baixarAudio = async (el: HTMLElement) => {
    fecharDialogoDe(el);
    try {
      /* `apiFetch`, e não `fetch`: esta rota exige o Bearer no modo público, e o download
         silenciosamente virava um arquivo de erro de 401. */
      const r = await apiFetch(caminhoDoAudio(recording.id), { timeoutMs: 300_000 });
      if (!r.ok) throw new Error(`áudio indisponível (${r.status})`);
      const blob = await r.blob();
      const mime = blob.type || '';
      const ext = mime.includes('webm')
        ? 'webm'
        : mime.includes('mpeg') || mime.includes('mp3')
          ? 'mp3'
          : mime.includes('wav')
            ? 'wav'
            : mime.includes('ogg')
              ? 'ogg'
              : mime.includes('mp4')
                ? 'm4a'
                : 'audio';
      baixar(blob, `audio_sessao_${recording.id}.${ext}`);
      toast.ok(t('Áudio da sessão: download iniciado'));
    } catch (e) {
      toast.error(t('Não deu para baixar o áudio da sessão.'), { detail: e });
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
      toast.ok(t('Flashcards para Anki: download iniciado'));
    } catch (e) {
      toast.error(t('Não deu para gerar o baralho do Anki.'), { detail: e });
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
    toast.ok(t('Métricas e desempenho: download iniciado'));
    fecharDialogoDe(el);
  };

  const temAudio = !!recording.audioUrl;
  const nCaderno = vocabCards.length;
  const pronto = !!todo;
  const secoesVisiveis = (Object.keys(ROTULO_DA_SECAO) as SecaoId[]).filter(
    (id) => (id !== 'desenhos' || n.desenhos > 0) && (id !== 'notas' || n.notas > 0),
  );
  const algumaLigada = secoesVisiveis.some((id) => secoes[id]);
  const contagemDe = (id: SecaoId): number | null =>
    id === 'conversa'
      ? n.conversa
      : id === 'palavras'
        ? n.palavras
        : id === 'palavrasNovas'
          ? n.novas
          : id === 'notas'
            ? n.notas
            : id === 'desenhos'
              ? n.desenhos
              : null;

  return (
    <Dialogo
      icone={Download}
      titulo={t('Exportar dados da sessão')}
      sub={t('Escolha o que levar para fora do app.')}
      largura="medio"
      aoFechar={aoFechar}
    >
      <div className={questNovo ? 'dlg-corpo qs-miolo q-lista exp-corpo' : 'dlg-corpo pilha'}>
        {dados && (
          <section className="exp-bloco" aria-labelledby="exp-rel">
            <h3 id="exp-rel">{t('Relatório da sessão')}</h3>
            <p>{t('Um arquivo só, com as partes que você marcar.')}</p>
            <div className="exp-caixas" role="group" aria-label={t('Partes do relatório')}>
              {secoesVisiveis.map((id) => {
                const c = contagemDe(id);
                return (
                  <label key={id} className="exp-caixa">
                    <input
                      type="checkbox"
                      checked={secoes[id]}
                      onChange={(e) => setSecoes((s) => ({ ...s, [id]: e.target.checked }))}
                    />
                    <span>
                      {t(ROTULO_DA_SECAO[id])} {c != null && <small>({numero(c)})</small>}
                    </span>
                  </label>
                );
              })}
            </div>
            {n.desenhos > 0 && bytesDosDesenhos > 2 * MB && secoes.desenhos && (
              <p className="exp-aviso">
                {t('Os desenhos deixam o arquivo grande (cerca de {mb} MB no Markdown).', {
                  mb: numero(Math.round((bytesDosDesenhos / MB) * 10) / 10),
                })}
              </p>
            )}
            <div className="exp-acoes">
              <button
                type="button"
                className={questNovo ? 'q-ctl pri' : 'btn btn-solid'}
                disabled={!pronto || !algumaLigada || !!gerando}
                onClick={() => void gerar('pdf')}
              >
                <FileDown aria-hidden /> {gerando === 'pdf' ? t('Gerando…') : t('Baixar PDF')}
              </button>
              <button
                type="button"
                className={questNovo ? 'q-ctl' : 'btn btn-outline'}
                disabled={!pronto || !algumaLigada || !!gerando}
                onClick={() => void gerar('md')}
              >
                <Type aria-hidden /> {gerando === 'md' ? t('Gerando…') : t('Baixar Markdown (.md)')}
              </button>
            </div>
            <p>{t('O PDF abre a impressão do navegador: escolha “Salvar como PDF”.')}</p>
          </section>
        )}

        {dados && (
          <>
            <div className="exp-titulo">{t('Só uma parte')}</div>
            <LinhaComFormatos
              icone={MessagesSquare}
              titulo={t('Conversa')}
              desc={t('A transcrição fala a fala, com a hora, quem falou e a tradução.')}
              vazio={pronto && n.conversa === 0 ? t('Esta sessão não tem transcrição.') : undefined}
              ocupado={!pronto || !!gerando}
              formatos={[
                { rotulo: '.md', aoEscolher: () => void avulso('conversa-md') },
                { rotulo: '.txt', aoEscolher: () => void avulso('conversa-txt') },
              ]}
            />
            <LinhaComFormatos
              icone={FileText}
              titulo={t('Palavras')}
              desc={t('As palavras da sessão no seu caderno, com tradução, nível e onde ocorreram.')}
              vazio={pronto && n.palavras === 0 ? t('Nenhuma palavra desta sessão no caderno ainda.') : undefined}
              ocupado={!pronto || !!gerando}
              formatos={[
                { rotulo: 'CSV', aoEscolher: () => void avulso('palavras-csv') },
                { rotulo: '.md', aoEscolher: () => void avulso('palavras-md') },
              ]}
            />
            <LinhaComFormatos
              icone={Sparkles}
              titulo={t('Palavras novas')}
              desc={t('As que a sessão trouxe: as já adicionadas e as que ainda não estão no caderno.')}
              vazio={pronto && n.novas === 0 ? t('Nenhuma palavra nova nesta sessão.') : undefined}
              ocupado={!pronto || !!gerando}
              formatos={[
                { rotulo: 'CSV', aoEscolher: () => void avulso('novas-csv') },
                { rotulo: '.md', aoEscolher: () => void avulso('novas-md') },
              ]}
            />
            <div className="exp-titulo">{t('Arquivos da sessão')}</div>
          </>
        )}

        <Opcao
          icone={FileAudio}
          titulo={t('Áudio da sessão')}
          desc={
            temAudio
              ? `${t('O arquivo da gravação original')}${recording.durationStr ? `, ${recording.durationStr}` : ''}.`
              : t('Sem áudio gravado nesta sessão.')
          }
          trava={!temAudio}
          aoEscolher={(el) => void baixarAudio(el)}
          aoTravado={() => toast.info(t('Áudio: esta sessão não tem gravação'))}
        />
        <Opcao
          icone={Video}
          titulo={t('Vídeo da sessão')}
          desc={
            recording.type === 'video'
              ? t('Download bloqueado: direitos autorais da plataforma de origem.')
              : t('Download bloqueado: esta sessão é só de áudio.')
          }
          trava
          aoTravado={() =>
            toast.info(
              recording.type === 'video'
                ? t('Vídeo: download bloqueado pelos direitos da plataforma de origem')
                : t('Vídeo: download bloqueado, esta sessão é só de áudio'),
            )
          }
        />
        <Opcao
          icone={Layers}
          titulo={t('Flashcards para Anki')}
          desc={
            nCaderno
              ? tp(
                  nCaderno,
                  'A palavra desta sessão, com frase de exemplo.',
                  'As {n} palavras desta sessão, com frase de exemplo.',
                )
              : t('Nenhuma palavra desta sessão no caderno ainda.')
          }
          trava={nCaderno === 0}
          aoEscolher={(el) => void baixarAnki(el)}
          aoTravado={() => toast.info(t('Flashcards: guarde uma palavra desta sessão primeiro'))}
        />
        <Opcao
          icone={ChartColumn}
          titulo={t('Métricas e desempenho')}
          desc={t('CSV com ritmo, pausas e vocabulário.')}
          aoEscolher={baixarMetricas}
        />
      </div>
    </Dialogo>
  );
}
