import {
  ArrowRight,
  Check,
  Clock,
  Download,
  Eye,
  FileAudio,
  FileText,
  Filter,
  FolderOpen,
  Headphones,
  Image as ImageIcon,
  Info,
  Library as LibraryIcon,
  Link as LinkIcon,
  Loader2,
  Lock,
  Mic,
  MoreVertical,
  Package,
  Pencil,
  Pin,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  X,
  Youtube,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  createSession,
  deleteSession,
  fetchSessions,
  fetchSessionTranscript,
  type ImageResult,
  importDocument,
  importWeb,
  importYoutube,
  patchSessionMeta,
  searchImages,
  updateSession,
  uploadSessionAudio,
} from '../../data/api';
import { getEntitlements, onPlanChange } from '../../lib/entitlements';
import { numero } from '../../lib/i18n';
import { buildDocumentSession, transcribeImportedAudio } from '../../lib/import/buildSession';
import { fetchLangConfig } from '../../lib/langConfig';
import { usePosicaoFlutuante } from '../../lib/posicaoFlutuante';
import { Recording } from '../../types';
import BuscaDeCapa from '../BuscaDeCapa';
import EditablePanel from '../EditablePanel';
import { askConfirm, toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, TituloDeSecao } from '../ui';

type LibraryTab = 'collections' | 'vault';

// Formata ms → "m:ss" só para o cabeçalho da transcrição exportada.
function fmtClock(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type FaixaDeTamanho = 'all' | 'short' | 'medium' | 'long';

// Balde de tamanho por wordCount, na MESMA régua de 250 palavras/minuto que a tela de
// Análise já usa para estimar tempo de leitura (ver Analysis.tsx, `wordCount / 250`) —
// reaproveitar essa conta em vez de inventar um limiar novo mantém os dois lugares coerentes.
function faixaDeTamanho(wordCount: number): 'short' | 'medium' | 'long' {
  if (wordCount <= 500) return 'short'; // ≤ 2 min de leitura
  if (wordCount <= 2000) return 'medium'; // 2–8 min
  return 'long'; // > 8 min
}

interface LibraryProps {
  onChangeView: (view: string, data?: any) => void;
  recordings: Recording[];
  /** Propaga pin/capa/exclusão para o App — a mesma lista alimenta Hub e Análise. */
  onRecordingsChange?: (next: Recording[]) => void;
  ageProfile?: 'kids' | 'pro' | 'senior';
}


export default function Library({ onChangeView, recordings, onRecordingsChange, ageProfile = 'pro' }: LibraryProps) {
  const [showImport, setShowImport] = useState(false);
  // Entitlements do plano ativo (self-host = tudo liberado). Reage à troca em Configurações.
  const [entitlements, setEntitlements] = useState(() => getEntitlements());
  useEffect(() => onPlanChange(() => setEntitlements(getEntitlements())), []);
  const [searchQuery, setSearchQuery] = useState('');
  // A aba do Cofre (RAG) está desligada (decisão do dono, 26/08): sem índice de embeddings, só a
  // coleção existe. O estado fica para o dia em que o Cofre voltar com as duas abas.
  const [activeTab] = useState<LibraryTab>('collections');
  const [filterCategory, setFilterCategory] = useState<'all' | 'video' | 'audio' | 'document'>('all');
  // Painel "Filtros": só sobre campos que existem de verdade em `Recording`.
  // Descartados por falta de dado real:
  //  · tags     — `sessionToRecording` (data/api.ts) sempre grava `tags: []`; nunca é populado,
  //                então filtrar por tag não teria o que mostrar.
  //  · status   — sempre 'Processado' no código atual ('Processando' nunca é atribuído a uma
  //                sessão vinda da API); um filtro sobre isso seria decorativo.
  //  · data     — `rec.date` já chega FORMATADA ("Hoje"/"Há 3 dias"/"12/01/2026"), sem o timestamp
  //                por trás; um filtro de período teria que reanalisar texto em pt-BR — frágil.
  const [showFilters, setShowFilters] = useState(false);
  const [filterPinned, setFilterPinned] = useState(false);
  const [filterHasAudio, setFilterHasAudio] = useState(false);
  const [filterWordCount, setFilterWordCount] = useState<FaixaDeTamanho>('all');
  const [creating, setCreating] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  /** Botão "..." do card cujo menu está aberto — é a âncora da posição do popup. */
  const ancoraDoMenu = useRef<HTMLButtonElement | null>(null);

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

  // Estado do modal de edição (título + capa).
  const [editing, setEditing] = useState<Recording | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [editImage, setEditImage] = useState('');
  const [imgQuery, setImgQuery] = useState('');
  const [imgResults, setImgResults] = useState<ImageResult[]>([]);
  const [imgLoading, setImgLoading] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const filteredRecordings = items.filter((rec) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = rec.title.toLowerCase().includes(q) || rec.tags.some((tag) => tag.toLowerCase().includes(q));
    const matchesCategory = filterCategory === 'all' || rec.type === filterCategory;
    const matchesPinned = !filterPinned || !!rec.pinned;
    // `audioUrl` só existe quando há arquivo de áudio real gravado/anexado (data/api.ts:80) —
    // vídeos importados do YouTube por legenda e documentos nunca têm.
    const matchesAudio = !filterHasAudio || !!rec.audioUrl;
    const matchesWordCount = filterWordCount === 'all' || faixaDeTamanho(rec.wordCount) === filterWordCount;
    return matchesSearch && matchesCategory && matchesPinned && matchesAudio && matchesWordCount;
  });

  // Fixadas primeiro; mantém a ordem original (mais recentes) dentro de cada grupo.
  const [ordem, setOrdem] = useState<'recentes' | 'palavras' | 'az'>('recentes');
  const sortedRecordings = [...filteredRecordings]
    .sort((a, b) =>
      ordem === 'palavras' ? b.wordCount - a.wordCount : ordem === 'az' ? a.title.localeCompare(b.title) : 0,
    )
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  // Usado tanto no aviso "sem resultado" quanto na contagem "mostrando X de Y" — um único
  // critério do que conta como "algum filtro ativo", para as duas leituras não divergirem.
  const isFiltered =
    searchQuery.trim() !== '' ||
    filterCategory !== 'all' ||
    filterPinned ||
    filterHasAudio ||
    filterWordCount !== 'all';
  const activePanelFilterCount = [filterPinned, filterHasAudio, filterWordCount !== 'all'].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterCategory('all');
    setFilterPinned(false);
    setFilterHasAudio(false);
    setFilterWordCount('all');
  };

  // Import real e honesto: cria uma sessão em branco (manual) e abre sua análise.
  const createBlankSession = async () => {
    setCreating(true);
    try {
      const rec = await createSession({ title: 'Sessão manual', kind: 'audio', status: 'draft' });
      setShowImport(false);
      onChangeView('analysis', { id: rec.id });
    } catch {
      /* falha silenciosa — mantém o modal aberto */
    } finally {
      setCreating(false);
    }
  };

  // ── Importação (YouTube · Documento · Link web · Áudio local) ──
  // Toda importação vira uma SESSÃO no formato canônico; o downstream (Análise/vocab) é reusado.
  type ImportSource = 'youtube' | 'document' | 'web' | 'local';
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const docInputRef = useRef<HTMLInputElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);

  const selectSource = (key: ImportSource) => {
    if (importBusy) return;
    setImportSource(key);
    setImportUrl('');
  };

  // Recarrega a lista autoritativa (garante que a nova sessão exista em App.recordings antes de
  // navegar — senão a Análise cai na sessão errada) e abre a Análise da sessão importada.
  const refreshAndOpen = async (id: string) => {
    try {
      const list = await fetchSessions();
      setItems(() => list);
    } catch {
      /* se o refetch falhar, ainda navegamos pelo id */
    }
    setShowImport(false);
    setImportSource(null);
    setImportUrl('');
    onChangeView('analysis', { id });
  };

  const handleImportYoutube = async () => {
    const url = importUrl.trim();
    if (!url || importBusy) return;
    setImportBusy(true);
    setImportMsg('Buscando o vídeo e a legenda…');
    try {
      const r = await importYoutube(url);
      if (r.needsClientStt) {
        setImportMsg('Vídeo sem legenda, transcrevendo o áudio com o Whisper local…');
        await transcribeImportedAudio(r.id, r.sourceLang, (p) => {
          if (p.phase === 'model') setImportMsg(`Carregando modelo local… ${Math.round(p.progress * 100)}%`);
          else if (p.phase === 'segment') setImportMsg(p.label || 'Transcrevendo…');
          else if (p.phase === 'decode') setImportMsg('Decodificando o áudio…');
        });
      }
      toast.ok(
        r.needsClientStt
          ? 'Vídeo importado e transcrito (Whisper local).'
          : `Vídeo importado (legenda ${r.captionKind === 'manual' ? 'oficial' : 'automática'}).`,
      );
      await refreshAndOpen(r.id);
    } catch (e) {
      toast.error(String((e as Error)?.message || e), { detail: e });
    } finally {
      setImportBusy(false);
      setImportMsg('');
    }
  };

  const handleImportWeb = async () => {
    const url = importUrl.trim();
    if (!url || importBusy) return;
    setImportBusy(true);
    setImportMsg('Buscando e extraindo o artigo…');
    try {
      const art = await importWeb(url);
      const { recording, sentences } = await buildDocumentSession({
        title: art.title,
        text: art.text,
        langHint: art.lang,
      });
      toast.ok(`Artigo importado, ${sentences} frase${sentences === 1 ? '' : 's'}.`);
      await refreshAndOpen(recording.id);
    } catch (e) {
      toast.error(String((e as Error)?.message || e), { detail: e });
    } finally {
      setImportBusy(false);
      setImportMsg('');
    }
  };

  const handleDocFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || importBusy) return;
    setImportBusy(true);
    setImportMsg('Lendo o documento…');
    try {
      const doc = await importDocument(file);
      const { recording, sentences } = await buildDocumentSession({
        title: doc.title,
        text: doc.text,
        langHint: doc.lang,
      });
      toast.ok(`Documento importado, ${sentences} frase${sentences === 1 ? '' : 's'}.`);
      await refreshAndOpen(recording.id);
    } catch (err) {
      toast.error(String((err as Error)?.message || err), { detail: err });
    } finally {
      setImportBusy(false);
      setImportMsg('');
    }
  };

  const handleLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || importBusy) return;
    setImportBusy(true);
    setImportMsg('Preparando o áudio…');
    try {
      const cfg = await fetchLangConfig();
      const rec = await createSession({
        kind: 'audio',
        title: file.name.replace(/\.[^.]+$/, ''),
        sourceLang: cfg.studying,
        targetLang: cfg.mine,
        status: 'ready',
      });
      await uploadSessionAudio(rec.id, file);
      setImportMsg('Transcrevendo com o Whisper local…');
      await transcribeImportedAudio(rec.id, cfg.studying, (p) => {
        if (p.phase === 'model') setImportMsg(`Carregando modelo local… ${Math.round(p.progress * 100)}%`);
        else if (p.phase === 'segment') setImportMsg(p.label || 'Transcrevendo…');
        else if (p.phase === 'decode') setImportMsg('Decodificando o áudio…');
      });
      toast.ok('Áudio importado e transcrito (Whisper local).');
      await refreshAndOpen(rec.id);
    } catch (err) {
      toast.error(String((err as Error)?.message || err), { detail: err });
    } finally {
      setImportBusy(false);
      setImportMsg('');
    }
  };

  // ── Mutações (otimistas + persistência no backend) ──
  const togglePin = async (rec: Recording) => {
    const next = !rec.pinned;
    setItems((prev) => prev.map((r) => (r.id === rec.id ? { ...r, pinned: next } : r)));
    const updated = await patchSessionMeta(rec.id, { pinned: next });
    if (updated) setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleDelete = async (rec: Recording) => {
    // Confirmação obrigatória: o servidor faz soft delete E apaga o arquivo de áudio real.
    const ok = await askConfirm({
      title: `Excluir "${rec.title}"?`,
      detail: 'Esta ação remove a sessão e o áudio gravado.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    setItems((prev) => prev.filter((r) => r.id !== rec.id));
    await deleteSession(rec.id);
  };

  const openEditModal = (rec: Recording) => {
    setEditing(rec);
    setEditTitle(rec.title);
    setTitleError('');
    setEditImage(rec.imageUrl ?? '');
    setImgQuery(rec.title);
    setImgResults([]);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const title = editTitle.trim();
    // Título vazio: bloqueia o save e mostra validação inline (sem alert).
    if (!title) {
      setTitleError('O título não pode ficar vazio.');
      return;
    }
    const value = editImage.trim();
    const id = editing.id;
    const titleChanged = title !== editing.title;
    // UI otimista: aplica título e capa na hora; o backend reconcilia em seguida.
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, title, imageUrl: value || undefined } : r)));
    setEditing(null);
    // Título vai por updateSession; a capa continua indo por patchSessionMeta.
    if (titleChanged) {
      const renamed = await updateSession(id, { title });
      if (renamed) setItems((prev) => prev.map((r) => (r.id === renamed.id ? renamed : r)));
    }
    const updated = await patchSessionMeta(id, { imageUrl: value || null });
    if (updated) setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const searchCovers = async () => {
    const q = imgQuery.trim();
    if (!q) return;
    setImgLoading(true);
    try {
      setImgResults(await searchImages(q));
    } finally {
      setImgLoading(false);
    }
  };

  const handleEditImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setEditImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Colar imagem (Ctrl+V) enquanto o modal de capa está aberto.
  useEffect(() => {
    if (!editing) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setEditImage(reader.result as string);
            reader.readAsDataURL(file);
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editing]);

  // Exporta a transcrição REAL da sessão (utterances do backend) como .md. Sem lastro → aviso honesto.
  const exportTranscript = async (rec: Recording) => {
    try {
      const { utterances } = await fetchSessionTranscript(rec.id);
      if (!utterances.length) {
        toast.warn('Esta sessão ainda não tem transcrição para exportar.');
        return;
      }
      const body = utterances
        .map((u) => {
          const clock = fmtClock(u.tStartMs);
          const who = u.speakerName || 'Fala';
          const head = clock ? `## ${who} · ${clock}` : `## ${who}`;
          const src = u.sourceText || '';
          const tgt = u.translatedText ? `\n\n> ${u.translatedText}` : '';
          return `${head}\n\n${src}${tgt}\n`;
        })
        .join('\n');
      const md = `# ${rec.title}\n\n_${utterances.length} enunciados · ${rec.date}_\n\n${body}`;
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${rec.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_transcricao.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Falha ao exportar a transcrição:', err);
      toast.error('Não foi possível carregar a transcrição desta sessão.', { detail: err });
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
  const FONTES = [
    {
      key: 'youtube' as const,
      Icone: Youtube,
      label: 'Link do YouTube',
      sub: 'Legenda ou Whisper local',
      hint: 'Usa a legenda do vídeo quando existe (rápido, com tempos reais). Sem legenda, transcreve o áudio no seu navegador com o Whisper local (mais lento). Precisa do yt-dlp instalado no servidor.',
    },
    {
      key: 'document' as const,
      Icone: FileText,
      label: 'Documento de texto',
      sub: 'PDF, DOCX, TXT',
      hint: 'Extrai o texto do arquivo e monta uma sessão de estudo (sem áudio, a leitura usa voz sintética). PDF digitalizado, sem camada de texto, não é suportado.',
    },
    {
      key: 'web' as const,
      Icone: LinkIcon,
      label: 'Link da web',
      sub: 'Artigos e blogs',
      hint: 'Baixa a página e extrai só o artigo principal (sem menus nem anúncios), virando uma sessão de estudo com vocabulário.',
    },
    {
      key: 'local' as const,
      Icone: Upload,
      label: 'Áudio local',
      sub: 'MP3, WAV, M4A',
      hint: 'Transcreve um arquivo de áudio no seu navegador com o Whisper local, com tempos reais. Só áudio por enquanto, vídeo ainda não.',
    },
  ];

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
              activeTab === 'collections' ? (
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
                    {activePanelFilterCount > 0 && <span className="ponto-filtro" aria-label="filtros ativos" />}
                  </button>
                  <button
                    type="button"
                    className="btn btn-solid"
                    data-sfx="open"
                    aria-expanded={showImport}
                    onClick={() => setShowImport((v) => !v)}
                  >
                    <Plus aria-hidden /> Importar
                  </button>
                </>
              ) : undefined
            }
          />

          {activeTab === 'collections' ? (
            <>
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
                <section
                  className="cartao p6 importar entra"
                  aria-label="Importar para análise"
                  style={{ marginTop: 18 }}
                >
                  <div className="entre">
                    <div className="tsec-t">
                      <Plus aria-hidden />
                      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Importar para análise</h2>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline peq"
                      disabled={importBusy}
                      onClick={() => {
                        setShowImport(false);
                        setImportSource(null);
                        setImportUrl('');
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                  <p className="mut" style={{ fontSize: 13, margin: '6px 0 16px', maxWidth: '72ch' }}>
                    Vídeo do YouTube, documento, artigo da web ou áudio local: vira uma sessão com transcrição e
                    vocabulário. O idioma é <b style={{ color: 'var(--ink)' }}>detectado do conteúdo</b>, nunca
                    inventado.
                  </p>
                  <div className="fontes">
                    {FONTES.map((f) => {
                      // GATE de plano (honesto: mostra com selo "Pro" e explica; nunca esconde).
                      const gated = f.key === 'youtube' && !entitlements.youtubeImport;
                      return (
                        <button
                          key={f.key}
                          type="button"
                          className={`cartao fonte-imp ${importSource === f.key ? 'sel' : ''}`}
                          aria-pressed={importSource === f.key}
                          disabled={importBusy}
                          onClick={() => {
                            if (gated) {
                              toast.error(
                                'Importar do YouTube é um recurso Pro, o download roda no servidor (yt-dlp). No plano local/self-host ele é liberado.',
                              );
                              return;
                            }
                            selectSource(f.key);
                          }}
                        >
                          <IconeEmBloco icone={f.Icone} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b>
                              {f.label}
                              {gated && (
                                <span className="badge warn" style={{ marginLeft: 4 }}>
                                  Pro
                                </span>
                              )}
                            </b>
                            <small>{f.sub}</small>
                          </span>
                          <span className="dica" title={f.hint} aria-label={`Como funciona: ${f.hint}`}>
                            <Info aria-hidden />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {(importSource === 'youtube' || importSource === 'web') && (
                    <div className="linha entra" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                      <label className="busca" style={{ flex: 1 }}>
                        <LinkIcon aria-hidden />
                        <span className="sr">Endereço</span>
                        <input
                          id="library-import-url"
                          name="library-import-url"
                          className="campo"
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (importSource === 'youtube') handleImportYoutube();
                              else handleImportWeb();
                            }
                          }}
                          placeholder={importSource === 'youtube' ? 'Cole o link do vídeo do YouTube' : 'https://…'}
                          disabled={importBusy}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-solid"
                        disabled={importBusy || !importUrl.trim()}
                        onClick={importSource === 'youtube' ? handleImportYoutube : handleImportWeb}
                      >
                        {importBusy ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowRight aria-hidden />}{' '}
                        Importar
                      </button>
                    </div>
                  )}

                  {(importSource === 'document' || importSource === 'local') && (
                    <div className="linha entra" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="soltar"
                        disabled={importBusy}
                        onClick={() =>
                          importSource === 'document' ? docInputRef.current?.click() : localInputRef.current?.click()
                        }
                      >
                        {importBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
                        <span>
                          <b>Escolher o arquivo</b>{' '}
                          {importSource === 'document' ? '· PDF, DOCX ou TXT' : '· MP3, WAV ou M4A, só áudio'}
                        </span>
                      </button>
                    </div>
                  )}

                  {importMsg && (
                    <p className="mut linha" style={{ fontSize: 12.5, marginTop: 12, gap: 8 }}>
                      <Loader2 className="animate-spin" aria-hidden style={{ width: 14, height: 14 }} />
                      {importMsg}
                    </p>
                  )}

                  <input
                    id="library-doc-file"
                    name="library-doc-file"
                    ref={docInputRef}
                    type="file"
                    accept=".txt,.pdf,.docx"
                    className="hidden"
                    onChange={handleDocFile}
                  />
                  <input
                    id="library-audio-file"
                    name="library-audio-file"
                    ref={localInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleLocalFile}
                  />

                  <p className="mut" style={{ fontSize: 12.5, marginTop: 14 }}>
                    ou{' '}
                    <button
                      type="button"
                      className="link"
                      onClick={createBlankSession}
                      disabled={creating || importBusy}
                    >
                      criar uma sessão em branco
                    </button>{' '}
                    para escrever ou colar depois.
                  </p>
                </section>
              )}

              {showFilters && (
                <section
                  id="library-filters-panel"
                  className="cartao p5 filtros entra"
                  aria-label="Filtros da biblioteca"
                  style={{ marginTop: 18 }}
                >
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
                        <input
                          type="checkbox"
                          checked={filterPinned}
                          onChange={(e) => setFilterPinned(e.target.checked)}
                        />{' '}
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
                                {rec.durationStr && <span className="dur">{rec.durationStr}</span>}
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
                                        onFixar={() => togglePin(rec)}
                                        onEditar={() => openEditModal(rec)}
                                        onRetomar={() => onChangeView('capture', { resumeId: rec.id })}
                                        onExportar={() => exportTranscript(rec)}
                                        onExcluir={() => handleDelete(rec)}
                                      />
                                    )}
                                  </div>
                                </div>
                                <div className="meta">
                                  <Clock aria-hidden /> {rec.date} · {numero(rec.wordCount)} palavras
                                </div>
                                <div className="linha" style={{ gap: 6, flexWrap: 'wrap' }}>
                                  <span
                                    className={`badge ${documento ? 'rare' : rec.status === 'Processado' ? 'ok' : 'warn'}`}
                                  >
                                    <Check aria-hidden /> {documento ? 'Extraído' : rec.status}
                                  </span>
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
            </>
          ) : (
            /* Cofre de Memória (RAG) — sem índice de embeddings real, então tudo aqui é "Em breve". */
            <div className="animate-in fade-in flex flex-col gap-8 max-w-4xl mx-auto">
              <div className="card-panel p-8 bg-surface border-border-subtle flex flex-col gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center shrink-0">
                    <Shield className="w-6 h-6 text-ink-muted" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display font-bold text-xl text-ink">Cofre de Memória (RAG)</h2>
                      {/* O bloco todo fica: é o aviso mais honesto do app ("Nada é indexado ou
                        consultado por enquanto"). Só o pill de data sai, a frase abaixo já diz a
                        causa real, e "Em breve" prometia um prazo que ninguém definiu. */}
                      <span className="kpi-pill text-[10px]">Não construído</span>
                    </div>
                    <p className="text-[13.5px] text-ink-muted mt-1 leading-relaxed">
                      A busca semântica sobre o histórico de sessões requer um índice de embeddings, ainda não
                      construído. Quando disponível, você poderá recuperar trechos por conceito (não só por palavra
                      exata) e definir políticas de retenção. Nada é indexado ou consultado por enquanto.
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-canvas border border-border-subtle rounded-xl opacity-60">
                  <h3 className="font-bold text-[14px] text-ink mb-1 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Política de Retenção
                  </h3>
                  <p className="text-[12px] text-ink-muted mb-4">Disponível quando o índice de embeddings existir.</p>
                  <div className="flex items-center gap-3">
                    <input
                      id="library-retention-days"
                      name="library-retention-days"
                      type="range"
                      min="1"
                      max="90"
                      defaultValue={30}
                      disabled
                      className="flex-1 accent-ink cursor-not-allowed"
                    />
                    <span className="font-mono text-[13px] font-bold text-ink-muted w-16">dias</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="font-display font-bold text-[18px] text-ink flex items-center gap-2">
                  <Search className="w-5 h-5 text-ink-muted" /> Busca Estruturada de Memória
                </h3>
                <div className="card-panel p-12 bg-surface border border-dashed border-border-subtle flex flex-col items-center justify-center text-center gap-2">
                  <Lock className="w-8 h-8 text-ink-faint" />
                  <p className="text-[13.5px] font-bold text-ink">
                    Busca semântica requer um índice de embeddings, que não existe
                  </p>
                  <p className="text-[12px] text-ink-muted max-w-md">
                    Nenhuma sessão sua foi indexada, e nada é consultado por enquanto. Se o índice for construído algum
                    dia, os resultados aparecem aqui.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: editar capa da sessão (persistido em meta.imageUrl via PATCH /api/sessions/:id/meta) */}
      {editing && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-border-subtle p-6 max-w-lg w-full flex flex-col space-y-5 animate-in zoom-in-95 duration-200 rounded-3xl shadow-card text-ink">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display font-extrabold text-[17px] text-ink">Editar sessão</h3>
                <p className="text-xs text-ink-muted mt-1 line-clamp-1">{editing.title}</p>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="text-ink-muted hover:text-ink p-1 rounded-lg hover:bg-surface-hover cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Título da sessão (persistido via PATCH /api/sessions/:id) */}
            <div className="space-y-1.5">
              <label
                className="text-[10px] font-mono uppercase tracking-wider text-ink-muted"
                htmlFor="library-edit-title"
              >
                Título da sessão
              </label>
              <input
                id="library-edit-title"
                name="library-edit-title"
                type="text"
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  if (titleError) setTitleError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                }}
                placeholder="Nome da sessão"
                className={`w-full px-3 py-2 bg-canvas text-sm border rounded-xl outline-none text-ink font-medium focus:border-accent ${titleError ? 'border-error' : 'border-border-subtle'}`}
              />
              {titleError && <p className="text-[11px] text-error font-semibold">{titleError}</p>}
            </div>

            {/* Preview */}
            <div className="aspect-video w-full rounded-xl overflow-hidden border border-border-subtle bg-ink/5 flex items-center justify-center">
              {editImage ? (
                <img src={editImage} className="w-full h-full object-cover" alt="Prévia da capa" />
              ) : (
                <span className="text-[12px] text-ink-muted flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Sem capa (ícone padrão)
                </span>
              )}
            </div>

            {/* Buscar imagens de capa (Openverse, sem chave) — mesmo bloco da Captura, em `BuscaDeCapa`. */}
            <BuscaDeCapa
              idCampo="library-cover-search"
              query={imgQuery}
              onQueryChange={setImgQuery}
              onBuscar={searchCovers}
              carregando={imgLoading}
              resultados={imgResults}
              selecionada={editImage}
              onSelecionar={setEditImage}
              dica={
                !imgLoading &&
                imgResults.length === 0 &&
                imgQuery.trim() !== '' && (
                  <p className="text-[11px] text-ink-muted">
                    Digite um termo e clique em Buscar para ver sugestões de capa.
                  </p>
                )
              }
            />

            {/* URL manual + upload + colar */}
            <div className="space-y-1.5">
              <label
                className="text-[10px] font-mono uppercase tracking-wider text-ink-muted"
                htmlFor="library-cover-url"
              >
                Ou cole a URL de uma imagem
              </label>
              <input
                id="library-cover-url"
                name="library-cover-url"
                type="text"
                value={editImage}
                onChange={(e) => setEditImage(e.target.value)}
                placeholder="https://... ou data:image/..."
                className="w-full px-3 py-2 bg-canvas text-xs border border-border-subtle rounded-xl outline-none text-ink font-medium focus:border-accent"
              />
              <input
                id="library-cover-file"
                name="library-cover-file"
                type="file"
                ref={editFileInputRef}
                onChange={handleEditImageUpload}
                accept="image/*"
                className="hidden"
              />
              <div className="flex items-center justify-between text-[10px] text-ink-muted px-1">
                <button
                  type="button"
                  onClick={() => editFileInputRef.current?.click()}
                  className="text-accent hover:underline font-semibold cursor-pointer border-none bg-transparent p-0"
                >
                  Selecionar imagem local...
                </button>
                <span>Ou cole uma imagem com Ctrl+V</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 border border-border-subtle bg-surface text-ink hover:bg-surface-hover rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-accent text-white hover:bg-accent-ink rounded-xl text-xs font-bold shadow-sm cursor-pointer border-none"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
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
  const caixa = usePosicaoFlutuante(true, ancora, { largura: 192, alturaEstimada: 190 });
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
        <button role="menuitem" onClick={agir(onFixar)}>
          <Pin aria-hidden />
          <span>{rec.pinned ? 'Desafixar do topo' : 'Fixar no topo'}</span>
        </button>
        <button role="menuitem" onClick={agir(onEditar)}>
          <Pencil aria-hidden />
          <span>Editar título e capa</span>
        </button>
        {/* Retomar captura: só faz sentido para áudio/vídeo (documentos não têm gravação). */}
        {rec.type !== 'document' && (
          <button role="menuitem" onClick={agir(onRetomar)}>
            <Mic aria-hidden />
            <span>Retomar captura</span>
          </button>
        )}
        <button role="menuitem" onClick={agir(onExportar)}>
          <Download aria-hidden />
          <span>Exportar transcrição</span>
        </button>
        <button role="menuitem" className="perigo" onClick={agir(onExcluir)}>
          <Trash2 aria-hidden />
          <span>Excluir</span>
        </button>
      </div>
    </>,
    document.body,
  );
}
