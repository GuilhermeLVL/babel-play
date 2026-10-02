import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Clock,
  Download,
  Eye,
  FileAudio,
  FileText,
  Filter,
  FolderOpen,
  Headphones,
  Info,
  Library as LibraryIcon,
  Link as LinkIcon,
  Loader,
  Loader2,
  Lock,
  Mic,
  MoreVertical,
  Package,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
  Youtube,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { createSession, deleteSession, fetchSessions, patchSessionMeta, updateSession } from '../../data/api';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { getEntitlements, onPlanChange } from '../../lib/entitlements';
import { numero } from '../../lib/i18n';
import {
  type Entrada,
  type FonteDeImportacao,
  importar,
  tentarDeNovo,
  useFilaDeImportacao,
} from '../../lib/import/filaDeImportacao';
import { fetchLangConfig } from '../../lib/langConfig';
import { usePosicaoFlutuante } from '../../lib/posicaoFlutuante';
import { Recording } from '../../types';
import EditablePanel from '../EditablePanel';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, TituloDeSecao } from '../ui';
import EditarSessao from './biblioteca/EditarSessao';
import ExportarTranscricao from './biblioteca/ExportarTranscricao';
import BibliotecaDoQuest from './biblioteca/quest/BibliotecaDoQuest';

type FaixaDeTamanho = 'all' | 'short' | 'medium' | 'long';
type Situacao = 'todos' | 'pronto' | 'processando';

// Balde de tamanho por wordCount, na MESMA régua de 250 palavras/minuto que a tela de
// Análise já usa para estimar tempo de leitura (ver Analysis.tsx, `wordCount / 250`) —
// reaproveitar essa conta em vez de inventar um limiar novo mantém os dois lugares coerentes.
function faixaDeTamanho(wordCount: number): 'short' | 'medium' | 'long' {
  if (wordCount <= 500) return 'short'; // ≤ 2 min de leitura
  if (wordCount <= 2000) return 'medium'; // 2–8 min
  return 'long'; // > 8 min
}

/** Idioma base de uma sessão ('en-US' → 'en'); sem idioma gravado = ''. */
const idiomaBase = (r: Recording) => (r.idioma ?? '').split('-')[0].toLowerCase();
function nomeDoIdioma(cod: string): string {
  try {
    const n = new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(cod) ?? cod;
    return n.charAt(0).toUpperCase() + n.slice(1);
  } catch {
    return cod;
  }
}

/** Quanto tempo a exclusão espera o "Desfazer" antes de ir ao servidor (que apaga o áudio junto). */
const JANELA_DE_DESFAZER_MS = 8000;

const FONTES: Array<{ key: FonteDeImportacao; Icone: typeof Youtube; label: string; sub: string; hint: string }> = [
  {
    key: 'youtube',
    Icone: Youtube,
    label: 'Link do YouTube',
    sub: 'Legenda ou transcrição local',
    hint: 'Usa a legenda do vídeo quando existe (rápido, com tempos reais). Sem legenda, transcreve o áudio no navegador.',
  },
  {
    key: 'doc',
    Icone: FileText,
    label: 'Documento de texto',
    sub: 'PDF, DOCX, TXT',
    hint: 'Extrai o texto e monta uma sessão de estudo. A leitura usa voz sintética.',
  },
  {
    key: 'web',
    Icone: LinkIcon,
    label: 'Link da web',
    sub: 'Artigos e blogs',
    hint: 'Baixa a página e extrai só o artigo principal, sem menus nem anúncios.',
  },
  {
    key: 'local',
    Icone: Upload,
    label: 'Áudio local',
    sub: 'MP3, WAV, M4A',
    hint: 'Transcreve no seu navegador com o modelo local, com tempos reais.',
  },
  {
    key: 'texto',
    Icone: ClipboardPaste,
    label: 'Colar texto',
    sub: 'Qualquer idioma',
    hint: 'Cole um texto: vira uma sessão com leitura narrada e vocabulário.',
  },
];
const ICONE_DA_FONTE = Object.fromEntries(FONTES.map((f) => [f.key, f.Icone])) as Record<
  FonteDeImportacao,
  typeof Youtube
>;

interface LibraryProps {
  onChangeView: (view: string, data?: any) => void;
  recordings: Recording[];
  /** Propaga pin/capa/exclusão para o App — a mesma lista alimenta Hub e Análise. */
  onRecordingsChange?: (next: Recording[]) => void;
  ageProfile?: 'kids' | 'pro' | 'senior';
}

export default function Library({ onChangeView, recordings, onRecordingsChange, ageProfile = 'pro' }: LibraryProps) {
  // No Quest (telas novas ligadas) a lista é paginada; "Tela completa" devolve esta tela, nesta visita.
  const questNovo = useQuestNovo();
  const [telaCompleta, setTelaCompleta] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Entitlements do plano ativo (self-host = tudo liberado). Reage à troca em Configurações.
  const [entitlements, setEntitlements] = useState(() => getEntitlements());
  useEffect(() => onPlanChange(() => setEntitlements(getEntitlements())), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'video' | 'audio' | 'document'>('all');
  // Painel "Filtros": só sobre campos que existem de verdade em `Recording`. Tags não entram:
  // `sessionToRecording` sempre grava `tags: []`, então filtrar por tag não teria o que mostrar.
  const [showFilters, setShowFilters] = useState(false);
  const [filterPinned, setFilterPinned] = useState(false);
  const [filterHasAudio, setFilterHasAudio] = useState(false);
  const [filterWordCount, setFilterWordCount] = useState<FaixaDeTamanho>('all');
  const [filterIdioma, setFilterIdioma] = useState('todos');
  const [filterSituacao, setFilterSituacao] = useState<Situacao>('todos');
  const [creating, setCreating] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  /** Botão "..." do card cujo menu está aberto — é a âncora da posição do popup. */
  const ancoraDoMenu = useRef<HTMLButtonElement | null>(null);
  const [editando, setEditando] = useState<Recording | null>(null);
  const [exportando, setExportando] = useState<Recording | null>(null);
  const fila = useFilaDeImportacao();

  // Cópia local para UI otimista: as mutações (pin/capa/excluir) aparecem na hora e
  // depois são reconciliadas com o que o backend devolve. O `onRecordingsChange`
  // sobe a lista para o App — sem ele, excluir aqui deixaria a sessão viva no Hub.
  const [items, setItemsRaw] = useState<Recording[]>(recordings);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    setItemsRaw(recordings);
  }, [recordings]);

  const setItems = (updater: (prev: Recording[]) => Recording[]) => {
    // Calculado fora do setter do React: `onRecordingsChange` atualiza o App e não
    // pode rodar durante a fase de render deste componente.
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItemsRaw(next);
    onRecordingsChange?.(next);
  };

  // Os idiomas das sessões e o que você estuda (esse aparece mesmo com zero, como no protótipo).
  const [estudando, setEstudando] = useState('');
  useEffect(() => {
    let vivo = true;
    fetchLangConfig()
      .then((c) => vivo && setEstudando(c.studying.split('-')[0].toLowerCase()))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  const idiomas = [...new Set([...items.map(idiomaBase), estudando].filter(Boolean))].sort();

  const filteredRecordings = items.filter((rec) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = rec.title.toLowerCase().includes(q) || rec.tags.some((tag) => tag.toLowerCase().includes(q));
    const matchesCategory = filterCategory === 'all' || rec.type === filterCategory;
    const matchesPinned = !filterPinned || !!rec.pinned;
    // `audioUrl` só existe quando há arquivo de áudio real gravado/anexado (data/api.ts:80) —
    // vídeos importados do YouTube por legenda e documentos nunca têm.
    const matchesAudio = !filterHasAudio || !!rec.audioUrl;
    const matchesWordCount = filterWordCount === 'all' || faixaDeTamanho(rec.wordCount) === filterWordCount;
    const matchesIdioma = filterIdioma === 'todos' || idiomaBase(rec) === filterIdioma;
    const matchesSituacao = filterSituacao === 'todos' || !!rec.pronta === (filterSituacao === 'pronto');
    return (
      matchesSearch &&
      matchesCategory &&
      matchesPinned &&
      matchesAudio &&
      matchesWordCount &&
      matchesIdioma &&
      matchesSituacao
    );
  });

  // Fixadas primeiro; mantém a ordem original (mais recentes) dentro de cada grupo.
  const [ordem, setOrdem] = useState<'recentes' | 'palavras' | 'az'>('recentes');
  const sortedRecordings = [...filteredRecordings]
    .sort((a, b) =>
      ordem === 'palavras' ? b.wordCount - a.wordCount : ordem === 'az' ? a.title.localeCompare(b.title) : 0,
    )
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  // Filtros do PAINEL (o número no botão "Filtros"); a busca e a aba de tipo contam à parte.
  const activePanelFilterCount = [
    filterPinned,
    filterHasAudio,
    filterWordCount !== 'all',
    filterIdioma !== 'todos',
    filterSituacao !== 'todos',
  ].filter(Boolean).length;
  const isFiltered = activePanelFilterCount > 0 || searchQuery.trim() !== '' || filterCategory !== 'all';

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterCategory('all');
    setFilterPinned(false);
    setFilterHasAudio(false);
    setFilterWordCount('all');
    setFilterIdioma('todos');
    setFilterSituacao('todos');
  };

  // "criar uma sessão em branco": nasce vazia e abre na Análise, para escrever ou colar depois.
  const createBlankSession = async () => {
    setCreating(true);
    try {
      const rec = await createSession({ title: 'Sessão em branco', kind: 'document', status: 'draft' });
      setShowImport(false);
      onChangeView('analysis', { id: rec.id });
      toast.ok('Sessão em branco criada: escreva ou cole o texto na aba Leitura');
    } catch (e) {
      toast.error('Não deu para criar a sessão em branco.', { detail: e });
    } finally {
      setCreating(false);
    }
  };

  // ── Importação (YouTube · Documento · Link web · Áudio local · Colar texto) ──
  // Toda importação vira uma SESSÃO no formato canônico e passa pela fila "Importando".
  const [importSource, setImportSource] = useState<FonteDeImportacao | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importTexto, setImportTexto] = useState('');
  const [importArquivo, setImportArquivo] = useState<File | null>(null);
  const youtubeTravado = !entitlements.youtubeImport;

  const fecharImportar = () => {
    setShowImport(false);
    setImportSource(null);
    setImportUrl('');
    setImportTexto('');
    setImportArquivo(null);
  };

  // Ao terminar: a lista autoritativa volta do servidor (a sessão nova aparece na grade, no Início
  // e na Análise) e o aviso leva direto a ela. Roda mesmo com a tela desmontada — a fila vive fora.
  const aoConcluirImportacao = async (id: string) => {
    let titulo = 'A sessão';
    try {
      const list = await fetchSessions();
      titulo = `“${list.find((r) => r.id === id)?.title ?? 'Sessão'}”`;
      setItems(() => list);
    } catch {
      /* a sessão existe; só a lista não recarregou */
    }
    toast.ok(`${titulo} pronta para estudar.`, {
      action: { label: 'Abrir', onClick: () => onChangeView('analysis', { id }) },
    });
  };

  const entradaAtual = (): Entrada | null => {
    if (importSource === 'youtube' || importSource === 'web') {
      const url = importUrl.trim();
      if (!url) return null;
      return importSource === 'youtube' ? { fonte: 'youtube', url } : { fonte: 'web', url };
    }
    if (importSource === 'doc' || importSource === 'local') {
      if (!importArquivo) return null;
      return importSource === 'doc'
        ? { fonte: 'doc', arquivo: importArquivo }
        : { fonte: 'local', arquivo: importArquivo };
    }
    if (importSource === 'texto') return importTexto.trim() ? { fonte: 'texto', texto: importTexto } : null;
    return null;
  };
  const iniciarImportacao = () => {
    const entrada = entradaAtual();
    if (!entrada) return;
    importar(entrada, (id) => void aoConcluirImportacao(id));
    fecharImportar();
  };

  // ── Mutações (otimistas + persistência no backend) ──
  const togglePin = async (rec: Recording) => {
    const next = !rec.pinned;
    setItems((prev) => prev.map((r) => (r.id === rec.id ? { ...r, pinned: next } : r)));
    toast.ok(next ? 'Fixada no topo' : 'Desafixada');
    const updated = await patchSessionMeta(rec.id, { pinned: next });
    if (updated) setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  /* EXCLUIR COM DESFAZER, como no protótipo. O servidor apaga a sessão E o arquivo de áudio, sem
     volta; por isso o pedido só sai depois da janela do "Desfazer". Sair da página antes disso
     manda o pedido na hora (`pagehide`), para a exclusão não ficar pela metade. */
  const exclusoes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pendentes = exclusoes.current;
    const agora = () => {
      pendentes.forEach((t, id) => {
        clearTimeout(t);
        void deleteSession(id);
      });
      pendentes.clear();
    };
    window.addEventListener('pagehide', agora);
    return () => window.removeEventListener('pagehide', agora);
  }, []);
  const handleDelete = (rec: Recording) => {
    const pos = itemsRef.current.findIndex((r) => r.id === rec.id);
    setItems((prev) => prev.filter((r) => r.id !== rec.id));
    const t = setTimeout(() => {
      exclusoes.current.delete(rec.id);
      void deleteSession(rec.id);
    }, JANELA_DE_DESFAZER_MS);
    exclusoes.current.set(rec.id, t);
    toast.ok(`“${rec.title}” excluída.`, {
      duration: JANELA_DE_DESFAZER_MS,
      action: {
        label: 'Desfazer',
        onClick: () => {
          clearTimeout(exclusoes.current.get(rec.id));
          exclusoes.current.delete(rec.id);
          setItems((prev) => [...prev.slice(0, pos), rec, ...prev.slice(pos)]);
        },
      },
    });
  };

  const salvarEdicao = async (rec: Recording, title: string, capa: string) => {
    const id = rec.id;
    // UI otimista: aplica título e capa na hora; o backend reconcilia em seguida.
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, title, imageUrl: capa || undefined } : r)));
    toast.ok('Sessão atualizada');
    if (title !== rec.title) {
      const renamed = await updateSession(id, { title });
      if (renamed) setItems((prev) => prev.map((r) => (r.id === renamed.id ? renamed : r)));
    }
    if (capa !== (rec.imageUrl ?? '')) {
      const updated = await patchSessionMeta(id, { imageUrl: capa || null });
      if (updated) setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  };

  /* Marcação do protótipo aprovado (`T.biblioteca`), o "Figma" do app. */
  const minutosDeAudio = Math.round(
    items.reduce((soma, r) => {
      // `durationStr` chega formatado ("m:ss" ou "h:mm:ss"); desmontá-lo é seguro nesse formato só.
      const partes = r.durationStr.split(':').map(Number);
      if (partes.some((n) => !Number.isFinite(n))) return soma;
      const seg = partes.reduce((acc, n) => acc * 60 + n, 0);
      return soma + seg / 60;
    }, 0),
  );
  const tipoDaCapa = (t: Recording['type']) => (t === 'video' ? 'youtube' : t === 'document' ? 'docs' : 'audio');
  const IconeDaMidia = (t: Recording['type']) => (t === 'video' ? Youtube : t === 'document' ? FileText : FileAudio);
  const podeImportar = !!entradaAtual() && !(importSource === 'youtube' && youtubeTravado);

  const escolherArquivo = (f: File | undefined | null) => {
    if (f) setImportArquivo(f);
  };

  /* QUEST (maquete de 01/10/2026, tela 9): páginas de linhas grandes e as ações da gravação
     selecionada na faixa. Importar, renomear, excluir e filtrar continuam abaixo, em "Tela completa". */
  if (questNovo && !telaCompleta) {
    return (
      <BibliotecaDoQuest
        gravacoes={sortedRecordings}
        ordem={ordem}
        aoTrocarOrdem={setOrdem}
        aoAbrir={(rec) => onChangeView('analysis', { id: rec.id })}
        aoJogar={(rec) => onChangeView('play', { id: rec.id })}
        aoRevisar={(rec) => onChangeView('study', { id: rec.id })}
        aoCapturar={() => onChangeView('capture')}
        aoTelaCompleta={() => setTelaCompleta(true)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="rolagem flex-1">
        <div className="tela larga entra">
          <CabecalhoDeTela
            icone={ageProfile === 'kids' ? Package : ageProfile === 'senior' ? Eye : LibraryIcon}
            sobrancelha={
              ageProfile === 'kids'
                ? 'Seu baú de mídias'
                : ageProfile === 'senior'
                  ? 'Suas lições guardadas'
                  : 'Suas mídias'
            }
            titulo={
              ageProfile === 'kids'
                ? 'Biblioteca de vídeos e cartas'
                : ageProfile === 'senior'
                  ? 'Minha biblioteca de leitura'
                  : 'Biblioteca'
            }
            sub="Tudo o que você gravou ou importou vira estudo: transcrição, vocabulário e exercícios."
            acoes={
              <>
                <label className="busca" style={{ minWidth: 220 }}>
                  <Search aria-hidden />
                  <span className="sr">Buscar na biblioteca</span>
                  <input
                    id="library-search"
                    name="library-search"
                    className="campo"
                    placeholder="Buscar por título ou tag"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-outline"
                  aria-expanded={showFilters}
                  aria-controls="library-filters-panel"
                  onClick={() => setShowFilters((v) => !v)}
                >
                  <Filter aria-hidden /> Filtros
                  {activePanelFilterCount > 0 ? (
                    <>
                      {' '}
                      <span className="n-filtro" aria-label={`${activePanelFilterCount} filtros ativos`}>
                        {activePanelFilterCount}
                      </span>
                    </>
                  ) : (
                    isFiltered && (
                      <>
                        {' '}
                        <span className="ponto-filtro" aria-label="filtros ativos" />
                      </>
                    )
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-solid"
                  data-sfx="open"
                  aria-expanded={showImport}
                  onClick={() => (showImport ? fecharImportar() : setShowImport(true))}
                >
                  <Plus aria-hidden /> Importar
                </button>
              </>
            }
          />

          <div className="ladrilhos">
            <div className="cartao ladrilho">
              <span className="label-mono">Sessões</span>
              <span className="v">{numero(items.length)}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">Palavras extraídas</span>
              <span className="v acc">{numero(items.reduce((sum, r) => sum + r.wordCount, 0))}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">Minutos de áudio</span>
              <span className="v">{numero(minutosDeAudio)}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">Fixadas</span>
              <span className="v">{numero(items.filter((r) => r.pinned).length)}</span>
            </div>
          </div>

          {showImport && (
            <section className="cartao p6 importar entra" aria-label="Importar para análise">
              <div className="entre">
                <div className="tsec-t">
                  <Plus aria-hidden />
                  <h2 style={{ fontSize: 18, fontWeight: 700 }}>Importar para análise</h2>
                </div>
                <button type="button" className="btn btn-outline peq" onClick={fecharImportar}>
                  Cancelar
                </button>
              </div>
              <p className="mut" style={{ fontSize: 13, margin: '6px 0 16px', maxWidth: '72ch' }}>
                Vídeo do YouTube, documento, artigo da web ou áudio local: vira uma sessão com transcrição e
                vocabulário. O idioma é <b style={{ color: 'var(--ink)' }}>detectado do conteúdo</b>, nunca inventado.
              </p>
              <div className="fontes">
                {FONTES.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`cartao fonte-imp ${importSource === f.key ? 'sel' : ''}`}
                    aria-pressed={importSource === f.key}
                    onClick={() => {
                      setImportSource(f.key);
                      setImportUrl('');
                      setImportArquivo(null);
                    }}
                  >
                    <IconeEmBloco icone={f.Icone} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>
                        {f.label}
                        {f.key === 'youtube' && youtubeTravado && (
                          <>
                            {' '}
                            <span className="badge warn" style={{ marginLeft: 4 }}>
                              Self-host
                            </span>
                          </>
                        )}
                      </b>
                      <small>{f.sub}</small>
                    </span>
                    <span
                      className="dica"
                      title={f.hint}
                      aria-label={`Como funciona: ${f.hint}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.info(f.hint);
                      }}
                    >
                      <Info aria-hidden />
                    </span>
                  </button>
                ))}
              </div>

              {importSource && (
                <div className="linha entra" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  {importSource === 'youtube' && youtubeTravado ? (
                    <div className="aviso-info" style={{ flex: 1 }}>
                      <Lock aria-hidden />
                      <span>
                        Importar do YouTube só existe no <b style={{ color: 'var(--ink)' }}>self-host</b>: o download
                        roda no servidor de quem hospeda. Aqui, toque o vídeo e use Capturar com o áudio do sistema.
                      </span>
                    </div>
                  ) : importSource === 'youtube' || importSource === 'web' ? (
                    <>
                      <label className="busca">
                        <LinkIcon aria-hidden />
                        <span className="sr">Endereço</span>
                        <input
                          id="library-import-url"
                          name="library-import-url"
                          className="campo"
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') iniciarImportacao();
                          }}
                          placeholder="https://…"
                          inputMode="url"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-solid"
                        disabled={!podeImportar}
                        onClick={iniciarImportacao}
                      >
                        <ArrowRight aria-hidden /> Importar
                      </button>
                    </>
                  ) : importSource === 'texto' ? (
                    <>
                      <label className="sr" htmlFor="colar-txt">
                        Texto
                      </label>
                      <textarea
                        className="campo"
                        id="colar-txt"
                        rows={4}
                        style={{ flex: 1, minWidth: 240, padding: '10px 14px' }}
                        placeholder="Cole aqui um texto em qualquer idioma…"
                        value={importTexto}
                        onChange={(e) => setImportTexto(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-solid"
                        disabled={!podeImportar}
                        onClick={iniciarImportacao}
                      >
                        <ArrowRight aria-hidden /> Importar
                      </button>
                    </>
                  ) : (
                    <>
                      <label
                        className="soltar"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          escolherArquivo(e.dataTransfer.files?.[0]);
                        }}
                      >
                        <Upload aria-hidden />
                        <span>
                          {importArquivo ? (
                            <>
                              <b>{importArquivo.name}</b> · clique para trocar
                            </>
                          ) : (
                            <>
                              <b>Solte o arquivo aqui</b> ou clique para escolher
                            </>
                          )}
                        </span>
                        <input
                          type="file"
                          className="sr"
                          accept={importSource === 'doc' ? '.txt,.pdf,.docx' : 'audio/*'}
                          onChange={(e) => {
                            escolherArquivo(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-solid"
                        disabled={!podeImportar}
                        onClick={iniciarImportacao}
                      >
                        <ArrowRight aria-hidden /> Importar
                      </button>
                    </>
                  )}
                </div>
              )}

              <p className="mut" style={{ fontSize: 12.5, marginTop: 14 }}>
                ou{' '}
                <button type="button" className="link" onClick={createBlankSession} disabled={creating}>
                  criar uma sessão em branco
                </button>{' '}
                para escrever ou colar depois.
              </p>
            </section>
          )}

          {showFilters && (
            <section id="library-filters-panel" className="cartao p5 filtros entra" aria-label="Filtros da biblioteca">
              <div className="entre" style={{ marginBottom: 14 }}>
                <b style={{ fontFamily: 'var(--font-display)' }}>
                  Filtros {activePanelFilterCount > 0 && <span className="n-sec">{activePanelFilterCount}</span>}
                </b>
                <button
                  type="button"
                  className="btn btn-outline peq icone"
                  onClick={() => setShowFilters(false)}
                  aria-label="Fechar filtros"
                >
                  <X aria-hidden />
                </button>
              </div>
              <div className="g-filtros">
                <fieldset>
                  <legend className="label-mono">Mostrar só</legend>
                  <label className="check">
                    <input type="checkbox" checked={filterPinned} onChange={(e) => setFilterPinned(e.target.checked)} />{' '}
                    Fixadas no topo
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={filterHasAudio}
                      onChange={(e) => setFilterHasAudio(e.target.checked)}
                    />{' '}
                    Com áudio gravado
                  </label>
                </fieldset>
                <fieldset>
                  <legend className="label-mono">Tamanho (por palavras)</legend>
                  {(
                    [
                      ['all', 'Qualquer tamanho', ''],
                      ['short', 'Curta', 'até 2 min de leitura'],
                      ['medium', 'Média', '2 a 8 min'],
                      ['long', 'Longa', 'mais de 8 min'],
                    ] as const
                  ).map(([v, r, d]) => (
                    <label key={v} className="op-radio">
                      <input
                        type="radio"
                        name="tam-bib"
                        value={v}
                        checked={filterWordCount === v}
                        onChange={() => setFilterWordCount(v)}
                      />{' '}
                      {r}
                      {d && <small className="mut"> {d}</small>}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend className="label-mono">Idioma</legend>
                  {[['todos', 'Todos'] as const, ...idiomas.map((c) => [c, nomeDoIdioma(c)] as const)].map(([v, r]) => (
                    <label key={v} className="op-radio">
                      <input
                        type="radio"
                        name="idi-bib"
                        value={v}
                        checked={filterIdioma === v}
                        onChange={() => setFilterIdioma(v)}
                      />{' '}
                      {v === 'todos' ? r : `${r} · ${numero(items.filter((x) => idiomaBase(x) === v).length)}`}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend className="label-mono">Situação</legend>
                  {(
                    [
                      ['todos', 'Todas'],
                      ['pronto', 'Prontas para estudar'],
                      ['processando', 'Processando ou com erro'],
                    ] as const
                  ).map(([v, r]) => (
                    <label key={v} className="op-radio">
                      <input
                        type="radio"
                        name="st-bib"
                        value={v}
                        checked={filterSituacao === v}
                        onChange={() => setFilterSituacao(v)}
                      />{' '}
                      {r}
                    </label>
                  ))}
                </fieldset>
              </div>
              <div
                className="entre"
                style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}
              >
                <span className="mut tn" style={{ fontSize: 12.5 }} aria-live="polite">
                  Mostrando {sortedRecordings.length} de {items.length}
                </span>
                {isFiltered && (
                  <button type="button" className="link" onClick={clearAllFilters}>
                    Limpar filtros
                  </button>
                )}
              </div>
            </section>
          )}

          {fila.length > 0 && (
            <section className="cartao p5 fila" aria-label="Importações em andamento" style={{ marginTop: 18 }}>
              <TituloDeSecao
                icone={Loader}
                titulo="Importando"
                direita={
                  <span className="mut" style={{ fontSize: 12.5 }}>
                    continua mesmo se você sair da tela
                  </span>
                }
              />
              <ul className="lista-fila">
                {fila.map((f) => (
                  <li key={f.id}>
                    <IconeEmBloco icone={ICONE_DA_FONTE[f.fonte]} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{f.titulo}</b>
                      <small className="mut">
                        {f.erro ? `Não deu para importar: ${f.erro}` : f.p >= 100 ? 'Pronto' : f.etapa}
                      </small>
                      {!f.erro && (
                        <div
                          className="barra"
                          style={{ marginTop: 6 }}
                          role="progressbar"
                          aria-label={`Progresso de ${f.titulo}`}
                          aria-valuenow={f.p}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${f.p}%` }} />
                        </div>
                      )}
                    </div>
                    {f.erro ? (
                      <button
                        type="button"
                        className="btn btn-outline peq"
                        onClick={() => tentarDeNovo(f.id, (id) => void aoConcluirImportacao(id))}
                      >
                        <RotateCcw aria-hidden /> Tentar de novo
                      </button>
                    ) : (
                      <span className="tn mut" style={{ fontSize: 12 }}>
                        {f.p}%
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <EditablePanel
            viewKey="library"
            panelKey="gridList"
            title="Grade de Mídia"
            canResizeWidth={false}
            canResizeHeight={false}
            defaultHeight={0}
          >
            <section className="secao" style={{ marginTop: 36 }}>
              <TituloDeSecao
                icone={FolderOpen}
                titulo="Suas sessões"
                direita={
                  <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Abas
                      variante="pilula"
                      rotuloDoGrupo="Tipo de mídia"
                      ativo={filterCategory}
                      aoTrocar={(id) => setFilterCategory(id as typeof filterCategory)}
                      itens={[
                        { id: 'all', rotulo: 'Tudo', contagem: items.length },
                        {
                          id: 'video',
                          rotulo: 'YouTube',
                          icone: <Youtube aria-hidden />,
                          contagem: items.filter((r) => r.type === 'video').length,
                        },
                        {
                          id: 'audio',
                          rotulo: 'Áudio',
                          icone: <Headphones aria-hidden />,
                          contagem: items.filter((r) => r.type === 'audio').length,
                        },
                        {
                          id: 'document',
                          rotulo: 'Documentos',
                          icone: <FileText aria-hidden />,
                          contagem: items.filter((r) => r.type === 'document').length,
                        },
                      ]}
                    />
                    <select
                      className="campo"
                      style={{ width: 'auto', minHeight: 34, fontSize: 12.5 }}
                      aria-label="Ordenar"
                      value={ordem}
                      onChange={(e) => setOrdem(e.target.value as typeof ordem)}
                    >
                      <option value="recentes">Mais recentes</option>
                      <option value="palavras">Mais palavras</option>
                      <option value="az">A–Z</option>
                    </select>
                  </div>
                }
              />
              <div role="tabpanel" id={`painel-${filterCategory}`} aria-labelledby={`aba-${filterCategory}`}>
                {sortedRecordings.length ? (
                  <div className="gauto">
                    {sortedRecordings.map((rec) => {
                      const Icone = IconeDaMidia(rec.type);
                      const documento = rec.type === 'document';
                      return (
                        <article
                          key={rec.id}
                          className="cartao clicavel midia"
                          tabIndex={0}
                          aria-label={`Abrir ${rec.title}`}
                          onClick={() => onChangeView('analysis', { id: rec.id })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget)
                              onChangeView('analysis', { id: rec.id });
                          }}
                        >
                          <div className={`capa ${tipoDaCapa(rec.type)}`}>
                            {rec.imageUrl ? (
                              <img
                                src={rec.imageUrl}
                                alt=""
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  borderRadius: 'inherit',
                                }}
                              />
                            ) : (
                              <Icone aria-hidden />
                            )}
                            {rec.durationStr && rec.durationStr !== '-' && (
                              <span className="dur">{rec.durationStr}</span>
                            )}
                            {rec.pinned && (
                              <span className="pino" title="Fixado no topo">
                                <Pin aria-hidden />
                              </span>
                            )}
                          </div>
                          <div className="corpo">
                            <div className="entre" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                              <h3>{rec.title}</h3>
                              <div style={{ position: 'relative' }}>
                                <button
                                  type="button"
                                  className="btn btn-outline peq icone"
                                  ref={(el) => {
                                    if (activeMenuId === rec.id) ancoraDoMenu.current = el;
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === rec.id ? null : rec.id);
                                  }}
                                  aria-label={`Mais ações: ${rec.title}`}
                                  aria-haspopup="menu"
                                  aria-expanded={activeMenuId === rec.id}
                                >
                                  <MoreVertical aria-hidden />
                                </button>
                                {activeMenuId === rec.id && (
                                  <MenuDaMidia
                                    ancora={ancoraDoMenu}
                                    rec={rec}
                                    onFechar={() => setActiveMenuId(null)}
                                    onFixar={() => void togglePin(rec)}
                                    onEditar={() => setEditando(rec)}
                                    onRetomar={() => onChangeView('capture', { resumeId: rec.id })}
                                    onExportar={() => setExportando(rec)}
                                    onExcluir={() => handleDelete(rec)}
                                  />
                                )}
                              </div>
                            </div>
                            <div className="meta">
                              <Clock aria-hidden /> {rec.date} · {numero(rec.wordCount)} palavras
                            </div>
                            <div className="linha" style={{ gap: 6, flexWrap: 'wrap' }}>
                              {rec.pronta === false ? (
                                <span className="badge warn">
                                  <Loader2 aria-hidden /> {rec.wordCount ? 'Processando' : 'Sem texto ainda'}
                                </span>
                              ) : (
                                <span className={`badge ${documento ? 'rare' : 'ok'}`}>
                                  <Check aria-hidden /> {documento ? 'Extraído' : rec.status}
                                </span>
                              )}
                              {rec.tags.map((tag) => (
                                <span key={tag} className="badge acc">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="cartao">
                    <div className="vazio">
                      <IconeEmBloco icone={isFiltered ? Search : FileAudio} />
                      <h3>{isFiltered ? 'Nenhum resultado' : 'Sua biblioteca está vazia'}</h3>
                      <p>
                        {isFiltered
                          ? 'Nenhuma mídia corresponde à busca ou aos filtros. Ajuste os termos ou limpe os filtros.'
                          : 'Capture uma sessão ao vivo ou importe uma mídia: tudo aparece aqui, pronto para análise.'}
                      </p>
                      {isFiltered ? (
                        <button type="button" className="btn btn-outline" onClick={clearAllFilters}>
                          Limpar busca e filtros
                        </button>
                      ) : (
                        <div className="linha" style={{ gap: 8 }}>
                          <button type="button" className="btn btn-solid" onClick={() => onChangeView('capture')}>
                            <Mic aria-hidden /> Nova captura
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            data-sfx="open"
                            onClick={() => setShowImport(true)}
                          >
                            <Plus aria-hidden /> Importar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </EditablePanel>
        </div>
      </div>

      {editando && (
        <EditarSessao
          rec={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(t, capa) => void salvarEdicao(editando, t, capa)}
        />
      )}
      {exportando && <ExportarTranscricao rec={exportando} aoFechar={() => setExportando(null)} />}
    </div>
  );
}

/**
 * MENU DE UMA MÍDIA — em portal, e não dentro do card.
 *
 * O card é um `.card-panel`, que tem `overflow: hidden`. Com o menu posicionado dentro dele,
 * ele vazava 101px para baixo e METADE DOS ITENS ficava invisível e inclicável — "Retomar
 * captura", "Exportar transcrição" e "Excluir" simplesmente não existiam para quem usasse o app.
 * Medido antes do conserto; é o mesmo defeito que a lista de idiomas tinha, em outra tela.
 *
 * A correção é a mesma dos outros popups do app: renderizar no `body`, com posição de viewport
 * calculada por `lib/posicaoFlutuante` — que também decide abrir para cima quando o card está no
 * pé da tela.
 */
function MenuDaMidia({
  ancora,
  rec,
  onFechar,
  onFixar,
  onEditar,
  onRetomar,
  onExportar,
  onExcluir,
}: {
  ancora: { current: HTMLButtonElement | null };
  rec: Recording;
  onFechar: () => void;
  onFixar: () => void;
  onEditar: () => void;
  onRetomar: () => void;
  onExportar: () => void;
  onExcluir: () => void;
}) {
  // ~5 itens de 33px + separador: o suficiente para decidir se abre para baixo ou para cima.
  const caixa = usePosicaoFlutuante(true, ancora, { largura: 220, alturaEstimada: 202 });
  const primeiro = useRef<HTMLButtonElement>(null);
  const posicionado = !!caixa;
  useEffect(() => {
    if (posicionado) primeiro.current?.focus();
  }, [posicionado]);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onFechar();
        ancora.current?.focus();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar, ancora]);
  if (!caixa) return null;

  const agir = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onFechar();
    fn();
  };

  return createPortal(
    <>
      {/* Camada invisível: clicar fora fecha. Fica no portal junto do menu para cobrir a tela
          inteira, dentro do card ela só cobriria o card. */}
      <div
        className="fixed inset-0 z-[69]"
        onClick={(e) => {
          e.stopPropagation();
          onFechar();
        }}
      />
      <div
        style={{ position: 'fixed', top: caixa.top, left: caixa.left, right: 'auto', width: caixa.largura, zIndex: 70 }}
        role="menu"
        className="menu-midia cartao"
      >
        <button ref={primeiro} role="menuitem" onClick={agir(onFixar)}>
          {rec.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          {rec.pinned ? 'Desafixar' : 'Fixar no topo'}
        </button>
        <button role="menuitem" onClick={agir(onEditar)}>
          <Pencil aria-hidden />
          Editar título e capa
        </button>
        {/* Retomar captura: só sessões de áudio (documento e vídeo importado não têm captura). */}
        {rec.type === 'audio' && (
          <button role="menuitem" onClick={agir(onRetomar)}>
            <Mic aria-hidden />
            Retomar captura
          </button>
        )}
        <button role="menuitem" onClick={agir(onExportar)}>
          <Download aria-hidden />
          Exportar transcrição
        </button>
        <button role="menuitem" className="perigo" onClick={agir(onExcluir)}>
          <Trash2 aria-hidden />
          Excluir
        </button>
      </div>
    </>,
    document.body,
  );
}
