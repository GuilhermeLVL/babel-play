import {
  Search, Filter, Play, Clock, MoreVertical, Plus, Upload, Link as LinkIcon,
  FileAudio, Youtube, FileText, LayoutDashboard, Loader2, Lock, Shield, Pin,
  Trash2, Download, Image as ImageIcon, X, Mic, Pencil, Package, Eye
} from 'lucide-react';
import InfoHint from '../InfoHint';
import BuscaDeCapa from '../BuscaDeCapa';
import { createPortal } from 'react-dom';
import { usePosicaoFlutuante } from '../../lib/posicaoFlutuante';
import React, { useEffect, useRef, useState } from 'react';
import { Recording } from '../../types';
import EditablePanel from '../EditablePanel';
import {
  createSession, fetchSessions, fetchSessionTranscript, patchSessionMeta, deleteSession,
  updateSession, searchImages, uploadSessionAudio,
  importYoutube, importWeb, importDocument, type ImageResult,
} from '../../data/api';
import { toast, askConfirm } from '../Toast';
import { fetchLangConfig } from '../../lib/langConfig';
import { buildDocumentSession, transcribeImportedAudio } from '../../lib/import/buildSession';
import { getEntitlements, onPlanChange } from '../../lib/entitlements';

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
  if (wordCount <= 500) return 'short';   // ≤ 2 min de leitura
  if (wordCount <= 2000) return 'medium'; // 2–8 min
  return 'long';                          // > 8 min
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
  const [activeTab, setActiveTab] = useState<LibraryTab>('collections');
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
  const filtrosBtnRef = useRef<HTMLButtonElement>(null);
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
  useEffect(() => { setItemsRaw(recordings); }, [recordings]);

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

  const filteredRecordings = items.filter(rec => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      rec.title.toLowerCase().includes(q) ||
      rec.tags.some(tag => tag.toLowerCase().includes(q));
    const matchesCategory = filterCategory === 'all' || rec.type === filterCategory;
    const matchesPinned = !filterPinned || !!rec.pinned;
    // `audioUrl` só existe quando há arquivo de áudio real gravado/anexado (data/api.ts:80) —
    // vídeos importados do YouTube por legenda e documentos nunca têm.
    const matchesAudio = !filterHasAudio || !!rec.audioUrl;
    const matchesWordCount = filterWordCount === 'all' || faixaDeTamanho(rec.wordCount) === filterWordCount;
    return matchesSearch && matchesCategory && matchesPinned && matchesAudio && matchesWordCount;
  });

  // Fixadas primeiro; mantém a ordem original (mais recentes) dentro de cada grupo.
  const sortedRecordings = [...filteredRecordings].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned),
  );

  // Usado tanto no aviso "sem resultado" quanto na contagem "mostrando X de Y" — um único
  // critério do que conta como "algum filtro ativo", para as duas leituras não divergirem.
  const isFiltered =
    searchQuery.trim() !== '' || filterCategory !== 'all' || filterPinned || filterHasAudio || filterWordCount !== 'all';
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
        setImportMsg('Vídeo sem legenda — transcrevendo o áudio com o Whisper local…');
        await transcribeImportedAudio(r.id, r.sourceLang, (p) => {
          if (p.phase === 'model') setImportMsg(`Carregando modelo local… ${Math.round(p.progress * 100)}%`);
          else if (p.phase === 'segment') setImportMsg(p.label || 'Transcrevendo…');
          else if (p.phase === 'decode') setImportMsg('Decodificando o áudio…');
        });
      }
      toast.ok(r.needsClientStt ? 'Vídeo importado e transcrito (Whisper local).' : `Vídeo importado (legenda ${r.captionKind === 'manual' ? 'oficial' : 'automática'}).`);
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
      const { recording, sentences } = await buildDocumentSession({ title: art.title, text: art.text, langHint: art.lang });
      toast.ok(`Artigo importado — ${sentences} frase${sentences === 1 ? '' : 's'}.`);
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
      const { recording, sentences } = await buildDocumentSession({ title: doc.title, text: doc.text, langHint: doc.lang });
      toast.ok(`Documento importado — ${sentences} frase${sentences === 1 ? '' : 's'}.`);
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
    setItems(prev => prev.map(r => (r.id === rec.id ? { ...r, pinned: next } : r)));
    const updated = await patchSessionMeta(rec.id, { pinned: next });
    if (updated) setItems(prev => prev.map(r => (r.id === updated.id ? updated : r)));
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
    setItems(prev => prev.filter(r => r.id !== rec.id));
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
    if (!title) { setTitleError('O título não pode ficar vazio.'); return; }
    const value = editImage.trim();
    const id = editing.id;
    const titleChanged = title !== editing.title;
    // UI otimista: aplica título e capa na hora; o backend reconcilia em seguida.
    setItems(prev => prev.map(r => (r.id === id ? { ...r, title, imageUrl: value || undefined } : r)));
    setEditing(null);
    // Título vai por updateSession; a capa continua indo por patchSessionMeta.
    if (titleChanged) {
      const renamed = await updateSession(id, { title });
      if (renamed) setItems(prev => prev.map(r => (r.id === renamed.id ? renamed : r)));
    }
    const updated = await patchSessionMeta(id, { imageUrl: value || null });
    if (updated) setItems(prev => prev.map(r => (r.id === updated.id ? updated : r)));
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

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden">
      <EditablePanel
        viewKey="library"
        panelKey="filters"
        title="Filtros e Busca"
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
      {/* FAIXA DE AÇÕES — o que fica fixo agora é só a barra de ferramentas.
          Antes este bloco carregava também o título e o subtítulo e ocupava ~170px PERMANENTES
          da altura da tela, em todas as rolagens. O título desceu para dentro da área rolável
          (logo abaixo), onde é lido uma vez e sai do caminho; aqui sobrou o que precisa estar
          sempre ao alcance: abas, busca, filtro e importar. */}
      {/* `flex-wrap` — sem ele o campo de busca era o ÚNICO item encolhível da linha (as abas e os
          botões são `shrink-0`), então a 375px ele absorvia todo o excesso e chegava a menos de
          24px de largura. Medido: axe `target-size` em mobile__biblioteca. Envolver é preferível a
          esconder: a busca continua na primeira dobra, só desce uma linha. */}
      <div className="px-4 md:px-8 py-2.5 border-b border-border-subtle shrink-0 flex flex-wrap items-center gap-3">
        {/* F9 — as abas SOBREVIVEM ao mobile.
            Era `hidden md:flex`: abaixo de 768px o "Cofre de Memória" simplesmente deixava de
            existir, sem nenhuma indicação de que havia outra aba. Confirmado no inventário — o
            passo falhou APENAS no viewport mobile. Esconder uma função por largura de tela é
            diferente de não ter a função: o usuário de celular não descobre que ela existe. */}
        <div className="flex bg-surface-hover p-1 rounded-lg border border-border-subtle shrink-0">
          <button
            onClick={() => setActiveTab('collections')}
            aria-pressed={activeTab === 'collections'}
            className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors cursor-pointer ${activeTab === 'collections' ? 'bg-surface shadow-sm text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            {ageProfile === 'kids' ? 'Meus Vídeos & Áudios' : ageProfile === 'senior' ? 'Minhas Lições' : 'Coleções e Mídia'}
          </button>
          {/* "Cofre de Memória" (RAG) fora da interface: sem índice de embeddings real era uma
              vitrine vazia (decisão do dono, 2026-08-26). O componente fica no código. */}
          {false && <button
            onClick={() => setActiveTab('vault')}
            aria-pressed={activeTab === 'vault'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors cursor-pointer ${activeTab === 'vault' ? 'bg-surface shadow-sm text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            <Lock className="w-3.5 h-3.5" /> {ageProfile === 'kids' ? 'Cofre Secreto' : ageProfile === 'senior' ? 'Arquivos Seguros' : 'Cofre de Memória'}
          </button>}
        </div>

        {activeTab === 'collections' && (
          <>
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden />
              <input
                id="library-search"
                name="library-search"
                type="text"
                placeholder="Buscar por título ou tag…"
                aria-label="Buscar na biblioteca"
                className="w-full bg-surface border border-border-subtle rounded-xl py-2 pl-9 pr-4 text-[13px] outline-none focus:border-accent transition-colors"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="relative shrink-0">
              <button
                ref={filtrosBtnRef}
                type="button"
                title="Filtros"
                aria-label="Filtros"
                aria-haspopup="true"
                aria-expanded={showFilters}
                aria-controls="library-filters-panel"
                onClick={() => setShowFilters(v => !v)}
                className={`btn-outline py-2 min-h-[44px] ${activePanelFilterCount > 0 ? 'border-accent text-accent' : ''}`}
              >
                <Filter className="w-4 h-4" aria-hidden /> <span className="hidden lg:inline">Filtros</span>
                {activePanelFilterCount > 0 && (
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[9px] font-bold"
                  >
                    {activePanelFilterCount}
                  </span>
                )}
              </button>
              {showFilters && (
                <PainelDeFiltros
                  ancora={filtrosBtnRef}
                  filterPinned={filterPinned}
                  setFilterPinned={setFilterPinned}
                  filterHasAudio={filterHasAudio}
                  setFilterHasAudio={setFilterHasAudio}
                  filterWordCount={filterWordCount}
                  setFilterWordCount={setFilterWordCount}
                  onFechar={() => setShowFilters(false)}
                  onLimpar={() => { setFilterPinned(false); setFilterHasAudio(false); setFilterWordCount('all'); }}
                />
              )}
            </div>
          </>
        )}
        {activeTab !== 'collections' && <div className="flex-1" />}

        {/* C2 — o texto é `hidden sm:inline`, então abaixo de 640px sobra só o ícone e o botão
            fica sem nome nenhum (axe: `button-name`, WCAG 4.1.2). O `aria-label` vale nos dois
            casos e não muda o layout. */}
        <button aria-label="Importar mídia ou documento" className="btn-solid cursor-pointer shrink-0 py-2" data-sfx="open" onClick={() => setShowImport(true)}>
          <Plus className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">Importar mídia ou doc</span>
        </button>
      </div>
      </EditablePanel>

      <EditablePanel
        viewKey="library"
        panelKey="gridList"
        title="Grade de Mídia"
        className="flex-1 flex flex-col min-h-0"
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 bg-canvas h-full min-h-0">
        {/* Título dentro da área rolável: informa quando você chega, e sai do caminho depois. */}
        <header className="mb-6">
          <span className="label-mono text-accent flex items-center gap-1.5">
            {ageProfile === 'kids' ? (
              <><Package className="w-3.5 h-3.5" aria-hidden /><span>Seu baú de mídias</span></>
            ) : ageProfile === 'senior' ? (
              <><Eye className="w-3.5 h-3.5" aria-hidden /><span>Suas lições guardadas</span></>
            ) : (
              <span>Acervo de sessões</span>
            )}
          </span>
          <h1 className="font-display font-black text-2xl md:text-3xl text-ink tracking-tight mt-1 text-balance">
            {ageProfile === 'kids' ? 'Biblioteca de vídeos e cartas' : ageProfile === 'senior' ? 'Minha biblioteca de leitura' : 'Biblioteca'}
          </h1>
        </header>

        {activeTab === 'collections' ? (
        <div className="animate-in fade-in">
          {/* Category Segmented control */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1.5 scrollbar-thin">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterCategory === 'all'
                  ? 'bg-ink text-ink-contrast border-ink shadow-sm'
                  : 'bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
              }`}
            >
              <span>Tudo ({items.length})</span>
            </button>
            <button
              onClick={() => setFilterCategory('video')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterCategory === 'video'
                  ? 'bg-error-soft text-error-ink border-error/30'
                  : 'bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
              }`}
            >
              <Youtube className="w-3.5 h-3.5 text-error" />
              <span>YouTube ({items.filter(r => r.type === 'video').length})</span>
            </button>
            <button
              onClick={() => setFilterCategory('audio')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterCategory === 'audio'
                  ? 'bg-rare-soft text-rare-ink border-rare/30'
                  : 'bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
              }`}
            >
              <FileAudio className="w-3.5 h-3.5 text-rare" />
              <span>Áudio ({items.filter(r => r.type === 'audio').length})</span>
            </button>
            <button
              onClick={() => setFilterCategory('document')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterCategory === 'document'
                  ? 'bg-good-soft text-good-ink border-good/30'
                  : 'bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-good" />
              <span>Documentos ({items.filter(r => r.type === 'document').length})</span>
            </button>
          </div>

          {/* Só aparece com filtro ativo — sem isso, "Mostrando 12 de 12" seria ruído permanente. */}
          {isFiltered && (
            <div className="flex items-center gap-3 -mt-3 mb-5 text-[12px] text-ink-muted">
              <span>
                Mostrando <strong className="text-ink font-bold">{sortedRecordings.length}</strong> de {items.length}{' '}
                {items.length === 1 ? 'sessão' : 'sessões'}
              </span>
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-accent font-semibold hover:underline cursor-pointer inline-flex items-center min-h-[44px] px-1"
              >
                Limpar filtros
              </button>
            </div>
          )}

          {showImport && (
            <div className="mb-8 animate-in fade-in slide-in-from-top-4">
              <div className="card-panel p-6 border-accent/20 bg-accent-soft/30">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display font-bold text-[18px]">Importar para análise</h3>
                  <button className="text-ink-muted hover:text-ink text-[12px] font-bold bg-surface px-3 py-1.5 rounded border border-border-subtle disabled:opacity-50" disabled={importBusy} onClick={() => { setShowImport(false); setImportSource(null); setImportUrl(''); }}>Cancelar</button>
                </div>
                <p className="text-[12.5px] text-ink-muted mb-6">
                  Importe de um vídeo do YouTube, um documento (.pdf/.docx/.txt), um artigo da web ou um áudio local — vira uma sessão com transcrição e vocabulário. O idioma é <strong className="text-ink font-semibold">detectado do conteúdo</strong>, nunca inventado. Passe o mouse no ícone de informação de cada opção para ver como funciona.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {([
                    { key: 'youtube' as const, icon: <Youtube className="w-5 h-5" />, label: 'Link do YouTube', sub: 'Legenda ou Whisper local', hint: 'Usa a legenda do vídeo quando existe (rápido, com tempos reais). Sem legenda, transcreve o áudio no seu navegador com o Whisper local (mais lento). Precisa do yt-dlp instalado no servidor.' },
                    { key: 'document' as const, icon: <FileText className="w-5 h-5" />, label: 'Documento de Texto', sub: 'PDF, DOCX, TXT', hint: 'Extrai o texto do arquivo e monta uma sessão de estudo (sem áudio — a leitura usa voz sintética). PDF digitalizado, sem camada de texto, não é suportado.' },
                    { key: 'web' as const, icon: <LinkIcon className="w-5 h-5" />, label: 'Link da Web', sub: 'Artigos e Blogs', hint: 'Baixa a página e extrai só o artigo principal (sem menus nem anúncios), virando uma sessão de estudo com vocabulário.' },
                    { key: 'local' as const, icon: <Upload className="w-5 h-5" />, label: 'Áudio Local', sub: 'MP3, WAV, M4A', hint: 'Transcreve um arquivo de áudio no seu navegador com o Whisper local, com tempos reais. Só áudio por enquanto — vídeo ainda não.' },
                  ]).map((src, idx) => {
                    const active = importSource === src.key;
                    // GATE de plano (honesto: mostra com selo "Pro" e explica; nunca esconde).
                    const gated = src.key === 'youtube' && !entitlements.youtubeImport;
                    const pick = () => {
                      if (gated) {
                        toast.error('Importar do YouTube é um recurso Pro — o download roda no servidor (yt-dlp). No plano local/self-host ele é liberado.');
                        return;
                      }
                      selectSource(src.key);
                    };
                    return (
                      <div
                        key={src.key}
                        role="button"
                        tabIndex={importBusy ? -1 : 0}
                        aria-pressed={active}
                        onClick={pick}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
                        className={`relative flex flex-col items-center text-center gap-2 p-5 rounded-xl border outline-none transition-all
                          ${active
                            ? 'border-accent bg-accent-soft/40 ring-1 ring-accent/30 shadow-sm'
                            : 'border-border-subtle bg-surface-hover hover:border-accent/50 hover:-translate-y-0.5'}
                          ${importBusy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30'}`}
                      >
                        <span className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                          <InfoHint text={src.hint} align={idx < 2 ? 'left' : 'right'} />
                        </span>
                        {gated && (
                          <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wide bg-accent-soft text-accent border border-accent/30 rounded-full px-2 py-0.5">
                            Pro
                          </span>
                        )}
                        <span className={`flex items-center justify-center w-11 h-11 rounded-xl transition-colors ${active ? 'bg-accent-soft text-accent' : 'bg-canvas text-ink-muted'}`}>
                          {src.icon}
                        </span>
                        <span className="font-bold text-[13px] text-ink leading-tight">{src.label}</span>
                        <span className="text-[11px] text-ink-muted leading-snug">{src.sub}</span>
                      </div>
                    );
                  })}
                </div>

                {(importSource === 'youtube' || importSource === 'web') && (
                  <div className="flex gap-2 mb-4">
                    <input
                      id="library-import-url"
                      name="library-import-url"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { if (importSource === 'youtube') handleImportYoutube(); else handleImportWeb(); } }}
                      placeholder={importSource === 'youtube' ? 'Cole o link do vídeo do YouTube' : 'Cole a URL do artigo'}
                      disabled={importBusy}
                      className="flex-1 bg-surface border border-border-subtle rounded px-3 py-2 text-[13px] text-ink"
                    />
                    <button
                      className="btn-solid"
                      disabled={importBusy || !importUrl.trim()}
                      onClick={importSource === 'youtube' ? handleImportYoutube : handleImportWeb}
                    >
                      {importBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Importar
                    </button>
                  </div>
                )}

                {(importSource === 'document' || importSource === 'local') && (
                  <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                      className="btn-solid"
                      disabled={importBusy}
                      onClick={() => (importSource === 'document' ? docInputRef.current?.click() : localInputRef.current?.click())}
                    >
                      {importBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Escolher arquivo
                    </button>
                    <span className="text-[11.5px] text-ink-muted">
                      {importSource === 'document' ? 'Aceita PDF, DOCX ou TXT' : 'Aceita MP3, WAV ou M4A — só áudio'}
                    </span>
                  </div>
                )}

                {importMsg && (
                  <p className="text-[12px] text-ink-muted mb-4 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    {importMsg}
                  </p>
                )}

                <input id="library-doc-file" name="library-doc-file" ref={docInputRef} type="file" accept=".txt,.pdf,.docx" className="hidden" onChange={handleDocFile} />
                <input id="library-audio-file" name="library-audio-file" ref={localInputRef} type="file" accept="audio/*" className="hidden" onChange={handleLocalFile} />

                <div className="flex justify-end border-t border-border-subtle pt-4">
                  <button
                    className="text-ink-muted hover:text-ink text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                    onClick={createBlankSession}
                    disabled={creating || importBusy}
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    ou criar sessão em branco
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedRecordings.map((rec) => (
              <div key={rec.id} className={`card-panel group cursor-pointer hover:border-accent transition-colors flex flex-col ${rec.type === 'document' ? 'hover:border-rare' : ''}`} onClick={() => onChangeView('analysis', { id: rec.id })}>
                <div className={`aspect-video relative overflow-hidden flex items-center justify-center transition-colors shrink-0 ${rec.type === 'document' ? 'bg-rare-soft/30 group-hover:bg-rare-soft/50' : 'bg-ink/5 group-hover:bg-ink/10'}`}>
                  {rec.imageUrl ? (
                    <img src={rec.imageUrl} className="w-full h-full object-cover" alt={rec.title} />
                  ) : rec.type === 'video' ? (
                    <Youtube className="w-10 h-10 text-ink-muted opacity-50" />
                  ) : rec.type === 'document' ? (
                    <FileText className="w-10 h-10 text-rare/50" />
                  ) : (
                    <FileAudio className="w-10 h-10 text-ink-muted opacity-50" />
                  )}

                  <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px] z-20">
                    <button
                      onClick={(e) => { e.stopPropagation(); onChangeView('analysis', { id: rec.id }); }}
                      className="flex items-center gap-1.5 py-1.5 px-3 bg-surface hover:bg-surface-hover text-ink font-bold text-[11px] rounded-lg shadow-md cursor-pointer transform scale-95 group-hover:scale-100 transition-all border border-border-subtle"
                    >
                      {rec.type === 'document' ? <LayoutDashboard className="w-3.5 h-3.5 text-rare" /> : <Play className="w-3.5 h-3.5 text-accent fill-current" />}
                      <span>{rec.type === 'document' ? 'Visualizar' : 'Ver Análise'}</span>
                    </button>
                  </div>

                  {rec.type === 'document' && (
                    <div className="absolute top-2 left-2 bg-surface border border-border-subtle text-ink text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shadow-sm">
                      PDF / Documento
                    </div>
                  )}

                  {rec.pinned && (
                    <div className="absolute top-2 right-2 bg-accent text-white p-1.5 rounded-lg border border-accent/20 shadow-md z-10 flex items-center justify-center" title="Fixado no topo">
                      <Pin className="w-3.5 h-3.5 fill-current" />
                    </div>
                  )}

                  <div className="absolute bottom-2 right-2 bg-ink/80 text-ink-contrast text-[10px] font-mono font-bold px-1.5 py-0.5 rounded backdrop-blur-md">
                    {rec.durationStr}
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-display font-bold text-[14px] leading-tight line-clamp-2 pr-2">{rec.title}</h3>
                    <div className="relative">
                      <button
                        ref={el => { if (activeMenuId === rec.id) ancoraDoMenu.current = el; }}
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === rec.id ? null : rec.id); }}
                        /* Só "⋮" não diz nada a quem usa leitor de tela — o nome precisa dizer de
                           QUAL mídia é o menu, porque a tela tem um destes por card. */
                        aria-label={`Ações de "${rec.title}"`}
                        aria-haspopup="menu"
                        aria-expanded={activeMenuId === rec.id}
                        className="text-ink-muted hover:text-ink shrink-0 bg-surface-hover rounded p-1 cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
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
                  <div className="flex items-center gap-2 text-[11.5px] text-ink-muted mb-4 flex-wrap">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>{rec.date}</span>
                    <span>·</span>
                    <span>{rec.wordCount.toLocaleString('pt-BR')} palavras</span>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-auto">
                    {rec.type === 'document' ? (
                      <span className="badge-tag rare">Extraído</span>
                    ) : (
                      <span className="badge-tag ok">{rec.status}</span>
                    )}
                    {rec.tags.map(tag => (
                      <span key={tag} className={`badge-tag ${tag.includes('erros') ? 'warn' : tag === 'Vocabulário Business' ? 'border border-border-subtle bg-surface' : 'acc'}`}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {sortedRecordings.length === 0 && (
            // Distingue "biblioteca vazia" de "nada bate com a busca/filtro atual" (mesmo
            // `isFiltered` da contagem acima) — as ações oferecidas são diferentes (e todas reais).
            <div className="card-panel p-10 md:p-14 bg-surface border border-dashed border-border-subtle flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-canvas border border-border-subtle flex items-center justify-center mb-4 text-ink-faint">
                {isFiltered ? <Search className="w-7 h-7" /> : <FileAudio className="w-7 h-7" />}
              </div>
              <h3 className="font-display font-extrabold text-base text-ink">
                {isFiltered ? 'Nenhum resultado' : 'Sua biblioteca está vazia'}
              </h3>
              <p className="text-[12.5px] text-ink-muted mt-2 max-w-md">
                {isFiltered
                  ? 'Nenhuma mídia corresponde à busca ou aos filtros selecionados. Ajuste os termos ou limpe os filtros.'
                  : 'Capture uma sessão ao vivo ou importe uma mídia — tudo que você gravar aparece aqui, pronto para análise.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                {isFiltered ? (
                  <button className="btn-outline" onClick={clearAllFilters}>
                    Limpar busca e filtros
                  </button>
                ) : (
                  <>
                    <button className="btn-solid" onClick={() => onChangeView('capture')}>
                      <Mic className="w-4 h-4" /> Nova captura
                    </button>
                    <button className="btn-outline" data-sfx="open" onClick={() => setShowImport(true)}>
                      <Plus className="w-4 h-4" /> Importar mídia ou doc
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
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
                        consultado por enquanto"). Só o pill de data sai — a frase abaixo já diz a
                        causa real, e "Em breve" prometia um prazo que ninguém definiu. */}
                    <span className="kpi-pill text-[10px]">Não construído</span>
                  </div>
                  <p className="text-[13.5px] text-ink-muted mt-1 leading-relaxed">
                    A busca semântica sobre o histórico de sessões requer um índice de embeddings — ainda não construído.
                    Quando disponível, você poderá recuperar trechos por conceito (não só por palavra exata) e definir
                    políticas de retenção. Nada é indexado ou consultado por enquanto.
                  </p>
                </div>
              </div>

              <div className="p-5 bg-canvas border border-border-subtle rounded-xl opacity-60">
                <h3 className="font-bold text-[14px] text-ink mb-1 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Política de Retenção
                </h3>
                <p className="text-[12px] text-ink-muted mb-4">Disponível quando o índice de embeddings existir.</p>
                <div className="flex items-center gap-3">
                  <input id="library-retention-days" name="library-retention-days" type="range" min="1" max="90" defaultValue={30} disabled className="flex-1 accent-ink cursor-not-allowed" />
                  <span className="font-mono text-[13px] font-bold text-ink-muted w-16">— dias</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="font-display font-bold text-[18px] text-ink flex items-center gap-2">
                <Search className="w-5 h-5 text-ink-muted" /> Busca Estruturada de Memória
              </h3>
              <div className="card-panel p-12 bg-surface border border-dashed border-border-subtle flex flex-col items-center justify-center text-center gap-2">
                <Lock className="w-8 h-8 text-ink-faint" />
                <p className="text-[13.5px] font-bold text-ink">Busca semântica requer um índice de embeddings, que não existe</p>
                <p className="text-[12px] text-ink-muted max-w-md">
                  Nenhuma sessão sua foi indexada, e nada é consultado por enquanto. Se o índice for
                  construído algum dia, os resultados aparecem aqui.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      </EditablePanel>

      {/* Modal: editar capa da sessão (persistido em meta.imageUrl via PATCH /api/sessions/:id/meta) */}
      {editing && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-border-subtle p-6 max-w-lg w-full flex flex-col space-y-5 animate-in zoom-in-95 duration-200 rounded-3xl shadow-card text-ink">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display font-extrabold text-[17px] text-ink">Editar sessão</h3>
                <p className="text-xs text-ink-muted mt-1 line-clamp-1">{editing.title}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-ink-muted hover:text-ink p-1 rounded-lg hover:bg-surface-hover cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Título da sessão (persistido via PATCH /api/sessions/:id) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted" htmlFor="library-edit-title">Título da sessão</label>
              <input
                id="library-edit-title"
                name="library-edit-title"
                type="text"
                value={editTitle}
                onChange={e => { setEditTitle(e.target.value); if (titleError) setTitleError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); }}
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
                <span className="text-[12px] text-ink-muted flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Sem capa (ícone padrão)</span>
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
              dica={!imgLoading && imgResults.length === 0 && imgQuery.trim() !== '' && (
                <p className="text-[11px] text-ink-muted">Digite um termo e clique em Buscar para ver sugestões de capa.</p>
              )}
            />

            {/* URL manual + upload + colar */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted" htmlFor="library-cover-url">Ou cole a URL de uma imagem</label>
              <input
                id="library-cover-url"
                name="library-cover-url"
                type="text"
                value={editImage}
                onChange={e => setEditImage(e.target.value)}
                placeholder="https://... ou data:image/..."
                className="w-full px-3 py-2 bg-canvas text-xs border border-border-subtle rounded-xl outline-none text-ink font-medium focus:border-accent"
              />
              <input id="library-cover-file" name="library-cover-file" type="file" ref={editFileInputRef} onChange={handleEditImageUpload} accept="image/*" className="hidden" />
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
  ancora, rec, onFechar, onFixar, onEditar, onRetomar, onExportar, onExcluir,
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

  const item = 'w-full text-left px-3.5 py-2 text-xs font-semibold hover:bg-surface-hover text-ink flex items-center gap-2 cursor-pointer border-none bg-transparent';
  const agir = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); onFechar(); fn(); };

  return createPortal(
    <>
      {/* Camada invisível: clicar fora fecha. Fica no portal junto do menu para cobrir a tela
          inteira — dentro do card ela só cobriria o card. */}
      <div className="fixed inset-0 z-[69]" onClick={(e) => { e.stopPropagation(); onFechar(); }} />
      <div
        style={{ top: caixa.top, left: caixa.left, width: caixa.largura }}
        className="fixed z-[70] bg-surface border border-border-subtle shadow-2xl rounded-xl py-1 animate-in fade-in duration-100"
      >
        <button onClick={agir(onFixar)} className={item}>
          <Pin className="w-3.5 h-3.5 text-accent" />
          <span>{rec.pinned ? 'Desafixar do topo' : 'Fixar no topo'}</span>
        </button>
        <button onClick={agir(onEditar)} className={item}>
          <Pencil className="w-3.5 h-3.5 text-good" />
          <span>Editar título e capa</span>
        </button>
        {/* Retomar captura: só faz sentido para áudio/vídeo (documentos não têm gravação). */}
        {rec.type !== 'document' && (
          <button onClick={agir(onRetomar)} className={item}>
            <Mic className="w-3.5 h-3.5 text-accent" />
            <span>Retomar captura</span>
          </button>
        )}
        <button onClick={agir(onExportar)} className={item}>
          <Download className="w-3.5 h-3.5 text-accent" />
          <span>Exportar transcrição</span>
        </button>
        <div className="border-t border-border-subtle my-1" />
        <button
          onClick={agir(onExcluir)}
          className="w-full text-left px-3.5 py-2 text-xs font-semibold hover:bg-error-soft text-error flex items-center gap-2 cursor-pointer border-none bg-transparent"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Excluir</span>
        </button>
      </div>
    </>,
    document.body,
  );
}

/**
 * PAINEL DE FILTROS — mesmo padrão de portal + `usePosicaoFlutuante` do `MenuDaMidia` acima:
 * um popup dentro do `.card-panel`/da faixa de ferramentas seria recortado (é exatamente o
 * defeito que o menu "..." tinha antes do conserto). Fica em `position: fixed`, ancorado no
 * botão "Filtros".
 *
 * Os 3 controles são deliberadamente os únicos campos de `Recording` que variam de item para
 * item e são estáveis o bastante para filtrar: `pinned`, `audioUrl` e `wordCount`. `type` já
 * tem o segmented control acima — repeti-lo aqui seria o mesmo filtro em dois lugares.
 */
function PainelDeFiltros({
  ancora, filterPinned, setFilterPinned, filterHasAudio, setFilterHasAudio,
  filterWordCount, setFilterWordCount, onFechar, onLimpar,
}: {
  ancora: { current: HTMLElement | null };
  filterPinned: boolean;
  setFilterPinned: (v: boolean) => void;
  filterHasAudio: boolean;
  setFilterHasAudio: (v: boolean) => void;
  filterWordCount: 'all' | 'short' | 'medium' | 'long';
  setFilterWordCount: (v: 'all' | 'short' | 'medium' | 'long') => void;
  onFechar: () => void;
  onLimpar: () => void;
}) {
  // Cabeçalho + 2 checkboxes + separador + legenda + 4 rádios + rodapé, cada linha com o
  // alvo de toque mínimo de 44px — a estimativa de altura evita que o painel nasça para cima
  // quando o botão "Filtros" está perto do topo da tela.
  const caixa = usePosicaoFlutuante(true, ancora, { largura: 260, alturaEstimada: 470 });

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onFechar]);

  if (!caixa) return null;

  const linhaCheckbox = 'flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-lg hover:bg-surface-hover cursor-pointer text-[13px] font-semibold text-ink';
  const linhaRadio = 'flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-lg hover:bg-surface-hover cursor-pointer text-[12.5px] text-ink';

  const opcoesTamanho: { key: 'all' | 'short' | 'medium' | 'long'; label: string }[] = [
    { key: 'all', label: 'Qualquer tamanho' },
    { key: 'short', label: 'Curta — até 2 min de leitura' },
    { key: 'medium', label: 'Média — 2 a 8 min' },
    { key: 'long', label: 'Longa — mais de 8 min' },
  ];

  return createPortal(
    <>
      <div className="fixed inset-0 z-[69]" onClick={(e) => { e.stopPropagation(); onFechar(); }} />
      <div
        id="library-filters-panel"
        role="region"
        aria-label="Filtros da biblioteca"
        style={{ top: caixa.top, left: caixa.left, width: caixa.largura }}
        className="fixed z-[70] bg-surface border border-border-subtle shadow-2xl rounded-xl py-2 animate-in fade-in duration-100"
      >
        <div className="flex items-center justify-between px-3.5 pb-1.5 mb-1 border-b border-border-subtle">
          <span className="font-display font-bold text-[12.5px] text-ink">Filtros</span>
          <button
            onClick={onFechar}
            aria-label="Fechar filtros"
            className="text-ink-muted hover:text-ink p-1 rounded cursor-pointer min-h-[28px] min-w-[28px] flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <label className={linhaCheckbox}>
          <input
            type="checkbox"
            checked={filterPinned}
            onChange={(e) => setFilterPinned(e.target.checked)}
            className="w-4 h-4 accent-accent cursor-pointer"
          />
          <span>Somente fixadas</span>
        </label>
        <label className={linhaCheckbox}>
          <input
            type="checkbox"
            checked={filterHasAudio}
            onChange={(e) => setFilterHasAudio(e.target.checked)}
            className="w-4 h-4 accent-accent cursor-pointer"
          />
          <span>Com áudio gravado</span>
        </label>

        <div className="border-t border-border-subtle my-1.5" />

        <fieldset>
          <legend className="px-3.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-ink-muted">
            Tamanho (por palavras)
          </legend>
          {opcoesTamanho.map((op) => (
            <label key={op.key} className={linhaRadio}>
              <input
                type="radio"
                name="library-filter-wordcount"
                checked={filterWordCount === op.key}
                onChange={() => setFilterWordCount(op.key)}
                className="w-3.5 h-3.5 accent-accent cursor-pointer"
              />
              <span>{op.label}</span>
            </label>
          ))}
        </fieldset>

        <div className="border-t border-border-subtle mt-1.5 pt-1.5 px-1.5">
          <button
            onClick={onLimpar}
            className="w-full text-center text-[11.5px] font-bold text-ink-muted hover:text-ink py-2 min-h-[36px] rounded-lg hover:bg-surface-hover cursor-pointer"
          >
            Limpar estes filtros
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
