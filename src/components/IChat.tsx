import React, { useState, useEffect, useRef, useMemo } from 'react';
import { apiFetch } from '../data/api';
import {
  Sparkles,
  X, 
  Send, 
  Plus, 
  Trash2, 
  RefreshCw, 
  BookOpen, BarChart2, 
  Mic, 
  LayoutDashboard, 
  Youtube, 
  History, 
  MessageSquare, 
  HelpCircle,
  FileText,
  ArrowRight,
  Activity,
  Edit2,
  Bookmark,
  GraduationCap,
  Pin,
  Maximize2,
  Minimize2,
  Paperclip
} from 'lucide-react';
import { toast, askConfirm } from './Toast';
import { Recording, ViewType } from '../types';
import { construirContextoDaTela, cercarContexto, clausulaDeContencao } from '../lib/ichatContext';
import { TUTOR_REGISTER, type AgeProfileType } from '../lib/profile';

interface ContextoFixado { view: ViewType; recordingId: string | null; label: string; }

export interface ChatSession {
  id: string;
  title: string;
  messages: { role: 'user' | 'assistant'; content: string; timestamp: string }[];
  navigationHistory: { timestamp: string; view: string; details?: string }[];
  createdAt: string;
}

interface IChatProps {
  activeView: ViewType;
  selectedRecording: Recording | null;
  liveTranscription: string;
  onChangeView: (view: ViewType, data?: any) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isDocked: boolean;
  setIsDocked: (isDocked: boolean) => void;
  isMaximized: boolean;
  setIsMaximized: (isMaximized: boolean) => void;
  practiceSeed?: string;
  recordings?: Recording[];
  /** Registro de linguagem do tutor. Sem isto ele responde igual a uma criança e a um executivo. */
  ageProfile?: AgeProfileType;
}

export default function IChat({
  activeView,
  selectedRecording,
  liveTranscription,
  isOpen,
  setIsOpen,
  isDocked,
  setIsDocked,
  isMaximized,
  setIsMaximized,
  practiceSeed,
  recordings = [],
  ageProfile = 'pro'
}: IChatProps) {
  const [showSessionSelector, setShowSessionSelector] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('default');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [showContextSyncNotification, setShowContextSyncNotification] = useState<string | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [contextosFixados, setContextosFixados] = useState<ContextoFixado[]>(() => {
    try { return JSON.parse(localStorage.getItem('ichat_pinned_contexts') || '[]'); } catch { return []; }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const persistFixados = (lista: ContextoFixado[]) => {
    setContextosFixados(lista);
    try { localStorage.setItem('ichat_pinned_contexts', JSON.stringify(lista)); } catch { /* ignore */ }
  };

  // Initialize sessions from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ichat_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatSession[];
        if (parsed.length > 0) {
          setSessions(parsed);
          const lastActive = localStorage.getItem('ichat_active_session_id') || parsed[0].id;
          setActiveSessionId(lastActive);
          return;
        }
      } catch (e) {
        console.error('Error loading iChat sessions', e);
      }
    }

    // Default session creation if none exists
    const defaultSession: ChatSession = {
      id: 'default',
      title: 'Conversa Babel Principal',
      messages: [
        {
          role: 'assistant',
          content: "Olá! Sou seu Babel iChat, o assistente inteligente onipresente que te acompanha por toda a plataforma. Eu analiso o contexto de qual tela você está usando e te dou ferramentas sob medida! Como posso te ajudar hoje?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ],
      navigationHistory: [{ timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), view: 'hub', details: 'Sessão iniciada na Home' }],
      createdAt: new Date().toISOString()
    };
    setSessions([defaultSession]);
    setActiveSessionId('default');
    localStorage.setItem('ichat_sessions', JSON.stringify([defaultSession]));
    localStorage.setItem('ichat_active_session_id', 'default');
  }, []);

  // Sync to local storage whenever sessions change
  const saveSessions = (updatedSessions: ChatSession[]) => {
    setSessions(updatedSessions);
    localStorage.setItem('ichat_sessions', JSON.stringify(updatedSessions));
  };

  const getActiveSession = (): ChatSession | undefined => {
    return sessions.find(s => s.id === activeSessionId) || sessions[0];
  };

  /**
   * Espelho de `sessions` para o efeito de histórico de navegação.
   *
   * Aquele efeito monta a lista INTEIRA e a manda para `saveSessions`, que sobrescreve o
   * localStorage. Com um `sessions` capturado numa render antiga, uma mensagem recém-chegada seria
   * apagada pela gravação do histórico. O efeito não pode simplesmente depender de `sessions`: ele
   * grava `sessions`, então isso o faria disparar a si mesmo.
   */
  const sessionsRef = useRef<ChatSession[]>(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // Scroll to bottom when message or drawer state changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sessions, activeSessionId, isOpen]);

  /**
   * O TRECHO da transcrição ao vivo que aparece no histórico — e é ele, não a transcrição inteira,
   * que serve de dependência.
   *
   * O ramo que enriquece o histórico com a transcrição era CÓDIGO MORTO no fluxo normal: o efeito
   * abaixo só reagia a `activeView`, e quando alguém navega para a Captura a transcrição ainda está
   * vazia. Quando o texto finalmente chega, o efeito não roda de novo — então a mensagem com o
   * trecho nunca era gravada.
   *
   * Depender de `liveTranscription` cru resolveria isso e criaria outro problema: cada parcial do
   * reconhecimento dispararia o efeito, inundando `navigationHistory` e reescrevendo o localStorage
   * a cada palavra falada. O recorte de 40 caracteres é ESTÁVEL — para de mudar assim que os
   * primeiros 40 caracteres são transcritos —, então o efeito roda uma vez por gravação. E é
   * exatamente o valor exibido, o que faz a dependência e o conteúdo serem a mesma coisa.
   */
  const trechoAoVivo = useMemo(
    () => (liveTranscription ? liveTranscription.substring(0, 40) : ''),
    [liveTranscription]
  );

  // Track navigation changes and append to the active session history
  useEffect(() => {
    if (sessions.length === 0) return;

    const currentSession = getActiveSession();
    if (!currentSession) return;

    let viewLabel: string;
    let details = undefined;

    switch (activeView) {
      case 'hub':
        viewLabel = 'Painel Inicial (Dashboard)';
        break;
      case 'capture':
        viewLabel = 'Captura de Áudio em Tempo Real';
        if (trechoAoVivo) {
          details = `Sessão de gravação ativa. Transcrição capturada: "${trechoAoVivo}..."`;
        }
        break;
      case 'library':
        viewLabel = 'Biblioteca de Estudos';
        break;
      case 'analysis':
        if (selectedRecording) {
          const isVideo = selectedRecording.type === 'video';
          viewLabel = isVideo ? 'YouTube / Vídeo Aula' : selectedRecording.type === 'document' ? 'PDF / Documento' : 'Áudio Gravado';
          details = `Analisando: "${selectedRecording.title}"`;
        } else {
          viewLabel = 'Análise de Conteúdo';
        }
        break;
      case 'reading':
        viewLabel = 'Modo Leitura';
        if (selectedRecording) details = `Lendo documento: "${selectedRecording.title}"`;
        break;
      case 'study':
        viewLabel = 'Sessão de Exercícios (Treinamento)';
        if (selectedRecording) details = `Exercícios de: "${selectedRecording.title}"`;
        break;
      case 'metrics':
        viewLabel = 'Vocabulário & Métricas';
        break;
      case 'settings':
        viewLabel = 'Configurações do Usuário';
        break;
      default:
        viewLabel = activeView;
    }

    // Check if the last log in the navigation history is already this view to avoid redundant entries
    const history = currentSession.navigationHistory || [];
    const lastEntry = history[history.length - 1];
    
    if (!lastEntry || lastEntry.view !== activeView || (details && lastEntry.details !== details)) {
      const newEntry = {
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        view: activeView,
        details: details || `Aba aberta: ${viewLabel}`
      };

      /* `sessionsRef.current`, não `sessions`: ver o docstring do ref. Ler o estado capturado aqui
         faria a gravação do histórico apagar mensagens que chegaram depois desta render. */
      const updatedSessions = sessionsRef.current.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            navigationHistory: [...(s.navigationHistory || []), newEntry]
          };
        }
        return s;
      });

      saveSessions(updatedSessions);

      // Trigger user context notification
      setShowContextSyncNotification(viewLabel);
      const timer = setTimeout(() => {
        setShowContextSyncNotification(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
    /* `sessions` e `getActiveSession` ficam FORA de propósito: este efeito GRAVA `sessions`, então
       depender dele o faria disparar a si mesmo em laço. O valor atual chega por `sessionsRef`.
       `trechoAoVivo` está aqui porque sem ele o ramo da transcrição nunca rodava, ver o memo. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, selectedRecording, activeSessionId, trechoAoVivo]);

  // Handle creating a new chat session
  const handleCreateNewSession = () => {
    const newId = `session_${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: `Nova Conversa ${sessions.length + 1}`,
      messages: [
        {
          role: 'assistant',
          content: `Iniciei um novo contexto de conversação com você! Estou ciente de que você está na tela de **${getFriendlyViewName(activeView)}**. O que gostaria de praticar ou traduzir agora?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ],
      navigationHistory: [{ timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), view: activeView, details: 'Iniciada nova sessão' }],
      createdAt: new Date().toISOString()
    };

    const updated = [newSession, ...sessions];
    saveSessions(updated);
    setActiveSessionId(newId);
    localStorage.setItem('ichat_active_session_id', newId);
    setShowSessionSelector(false);
  };

  // Handle switching chat sessions
  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    localStorage.setItem('ichat_active_session_id', id);
    setShowSessionSelector(false);
  };

  // Delete chat session
  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      toast.warn('Você deve manter pelo menos uma sessão do iChat ativa.');
      return;
    }
    const ok = await askConfirm({
      title: 'Apagar esta sessão?',
      detail: 'A sessão e todo o histórico de mensagens dela serão removidos. Não há como desfazer.',
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;

    const updated = sessions.filter(s => s.id !== id);
    saveSessions(updated);
    if (activeSessionId === id) {
      const nextId = updated[0].id;
      setActiveSessionId(nextId);
      localStorage.setItem('ichat_active_session_id', nextId);
    }
  };

  // Rename session
  const startRenameSession = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(id);
    setRenameInput(currentTitle);
  };

  const handleSaveRename = (id: string) => {
    if (!renameInput.trim()) return;
    const updated = sessions.map(s => {
      if (s.id === id) {
        return { ...s, title: renameInput.trim() };
      }
      return s;
    });
    saveSessions(updated);
    setEditingSessionId(null);
  };

  // Get Friendly View Name
  const getFriendlyViewName = (view: ViewType): string => {
    switch (view) {
      case 'hub': return 'Início (Dashboard)';
      case 'capture': return 'Captura de Áudio';
      case 'library': return 'Biblioteca de Documentos';
      case 'analysis':
        if (selectedRecording) {
          return selectedRecording.type === 'video' ? 'YouTube / Vídeo Aula' : selectedRecording.type === 'document' ? 'Leitura de Documento' : 'Análise de Áudio';
        }
        return 'Análise de Sessão';
      case 'reading': return 'Modo Leitura';
      case 'study': return 'Prática & Treinos';
      case 'metrics': return 'Vocabulário & Métricas';
      case 'settings': return 'Configurações';
      default: return 'Painel Executivo';
    }
  };

  // ── Contextos fixados (pin) ────────────────────────────────────────────────
  const rotuloContextoAtual = () => {
    const base = getFriendlyViewName(activeView);
    return selectedRecording?.title ? `${base} · ${selectedRecording.title}` : base;
  };
  const estaFixado = contextosFixados.some(
    (c) => c.view === activeView && c.recordingId === (selectedRecording?.id ?? null)
  );
  const alternarFixarAtual = () => {
    if (estaFixado) {
      persistFixados(contextosFixados.filter(
        (c) => !(c.view === activeView && c.recordingId === (selectedRecording?.id ?? null))
      ));
    } else {
      if (contextosFixados.length >= 3) {
        toast.info('Máximo de 3 contextos fixados. Remova um para fixar outro.');
        return;
      }
      persistFixados([
        ...contextosFixados,
        { view: activeView, recordingId: selectedRecording?.id ?? null, label: rotuloContextoAtual() },
      ]);
    }
  };
  const removerFixado = (idx: number) =>
    persistFixados(contextosFixados.filter((_, i) => i !== idx));

  // Send Message to Gemini Endpoint
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || loading) return;

    const currentSession = getActiveSession();
    if (!currentSession) return;

    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = { role: 'user' as const, content: text, timestamp: userTimestamp };

    // Update state instantly for user message
    const updatedMessages = [...currentSession.messages, userMsg];
    const updatedSessions = sessions.map(s => {
      if (s.id === currentSession.id) {
        return { ...s, messages: updatedMessages };
      }
      return s;
    });
    saveSessions(updatedSessions);
    setChatInput('');
    setLoading(true);

    // Papel + tom (sucinto, objetivo, sem emojis) — as diretrizes de formatação antigas
    // (que exigiam emojis e headers em caixa alta) foram removidas de propósito.
    const tomBase = `Você é o Babel iChat, um tutor de comunicação e idiomas dentro do app Babel Play.
Ajude o usuário com base no que está na tela dele (o contexto real vem abaixo).

Estilo das respostas:
- Seja sucinto, objetivo e amigável. Responda exatamente o que foi pedido, sem enrolação.
- NÃO use emojis. Nada de títulos em CAIXA ALTA nem formatação decorativa.
- Prefira 1 a 4 frases ou uma lista curta. Markdown leve é opcional (negrito num termo-chave, bullets curtos), nunca obrigatório.
- Responda em português, mas mantenha termos e frases de negócio/idioma em inglês, destacados (ex.: **leverage**, **align**), para o usuário aprender.
- Baseie-se SOMENTE no contexto fornecido. Se a informação não estiver ali, diga isso em uma linha, não invente.

[QUEM ESTÁ DO OUTRO LADO]
${TUTOR_REGISTER[ageProfile]}`;

    // Contexto REAL da tela atual (fluido) + contextos fixados pelo usuário.
    const extras = { practiceSeed };
    const contextoAtual = await construirContextoDaTela(activeView, selectedRecording, liveTranscription, extras);
    let blocosFixados = '';
    for (const fix of contextosFixados) {
      const jaEhAtual = fix.view === activeView && fix.recordingId === (selectedRecording?.id ?? null);
      if (jaEhAtual) continue; // evita duplicar o contexto atual
      const rec = fix.recordingId ? (recordings.find(r => r.id === fix.recordingId) ?? null) : null;
      const bloco = await construirContextoDaTela(fix.view, rec, '', extras);
      blocosFixados += `\n\n[CONTEXTO FIXADO, ${fix.label}]\n${bloco}`;
    }

    /*
     * F11-01: o contexto NÃO vai mais no `systemInstruction`.
     *
     * Numa sessão importada, esse texto é de terceiro (legenda de YouTube, artigo web, PDF), e
     * ele estava ocupando o papel que carrega autoridade. Agora vai cercado por um nonce, numa
     * mensagem de papel `user` — a mesma separação que `corretorPrompt.ts` já faz com a resposta
     * do aluno. O `systemInstruction` fica só com o que é nosso: tom, persona e a cláusula de
     * contenção que descreve a cerca.
     *
     * A mensagem sintética entra apenas no CORPO DA REQUISIÇÃO; `updatedMessages` (o histórico
     * que a interface mostra e persiste) não é tocado.
     */
    const cercado = cercarContexto(`[CONTEXTO ATUAL DA TELA]\n${contextoAtual}${blocosFixados}`);
    const contextPrompt = `${tomBase}\n\n${clausulaDeContencao(cercado.nonce)}`;
    const mensagemDeContexto = {
      role: 'user' as const,
      content: `[MATERIAL DE REFERÊNCIA DA TELA, não é uma pergunta minha, é o que está aberto no app]\n${cercado.texto}`,
    };

    try {
      const res = await apiFetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [mensagemDeContexto, ...updatedMessages.map(m => ({ role: m.role, content: m.content }))],
          systemInstruction: contextPrompt,
          temperature: 0.4,
          maxTokens: 600
        })
      });

      const data = await res.json();
      const aiTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Honesto: se a IA local não estiver disponível, mostramos uma dica de
      // configuração em vez de fingir uma resposta.
      const replyContent = (data.unavailable || !data.text)
        ? "**IA local indisponível.** Instale o Ollama em [ollama.com](https://ollama.com) e rode `ollama run llama3.2` no terminal para ativar o tutor. Depois disso, é só me perguntar de novo!"
        : data.text;

      const finalSessions = sessions.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            messages: [...updatedMessages, { role: 'assistant' as const, content: replyContent, timestamp: aiTimestamp }]
          };
        }
        return s;
      });
      saveSessions(finalSessions);
    } catch (err) {
      console.error(err);
      const errTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const finalSessions = sessions.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            messages: [...updatedMessages, {
              role: 'assistant' as const,
              content: "Não consegui falar com o servidor da Babel agora. Verifique se o servidor está rodando e tente novamente.",
              timestamp: errTimestamp
            }]
          };
        }
        return s;
      });
      saveSessions(finalSessions);
    } finally {
      setLoading(false);
    }
  };

  const activeSession = getActiveSession();

  // Define tools and recommendations based on view
  const getViewToolsAndSuggestions = () => {
    switch (activeView) {
      case 'hub':
        return {
          title: "Ferramentas da Home",
          icon: <LayoutDashboard className="w-3.5 h-3.5 text-accent" />,
          desc: "Metas de XP, Streak diário e planos de evolução profissional.",
          tools: [
            { label: "Analisar Meu Progresso", text: "Como posso aprimorar meu progresso atual para alcançar o nível executivo mais rápido?" },
            { label: "Plano de Estudos de Hoje", text: "Gere um plano de estudos personalizado para mim hoje com base no meu histórico de atividades." },
            { label: "Dicas de Consistência", text: "Quais são as melhores heurísticas de aprendizagem para manter meu streak de fluência ativo?" }
          ]
        };
      case 'capture':
        return {
          title: "Ferramentas de Captura",
          icon: <Mic className="w-3.5 h-3.5 text-error animate-pulse" />,
          desc: "Suporte em tempo real durante suas chamadas e reuniões.",
          tools: [
            { label: "Resumir discussão atual", text: "Resuma em tópicos curtos a discussão capturada até agora." },
            { label: "Extrair action items", text: "Liste as decisões, atribuições e prazos implícitos na fala capturada." },
            { label: "Upgrades de vocabulário", text: "Aponte 5 termos da transcrição e dê uma versão mais executiva em inglês para cada." }
          ]
        };
      case 'library':
        return {
          title: "Ferramentas da Biblioteca",
          icon: <BookOpen className="w-3.5 h-3.5 text-rare" />,
          desc: "Gestão inteligente de livros, PDFs e termos corporativos.",
          tools: [
            { label: "Extrair Termos Executivos", text: "Quais os termos de Business English mais essenciais que eu deveria catalogar na minha biblioteca de vocabulário?" },
            { label: "Sugestões de Leitura", text: "Recomende 3 livros clássicos de negócios perfeitos para enriquecer o vocabulário de negociação e liderança." },
            { label: "Prática Ativa de Cloze", text: "Crie um exercício rápido de preenchimento de lacunas (Cloze) focado em termos de finanças e investimentos corporativos." }
          ]
        };
      case 'metrics':
        return {
          title: "Ferramentas de Métricas",
          icon: <BarChart2 className="w-3.5 h-3.5 text-accent" />,
          desc: "Análise profunda de dados de desempenho e insights.",
          tools: [
            { label: "Análise de Vícios", text: "Com base nas minhas métricas de vícios de linguagem, quais exercícios práticos de fala posso fazer para reduzi-los?" },
            { label: "Plano de Redução de Pausas", text: "Meus dados mostram muitas pausas de hesitação. Como posso treinar transições mais suaves no discurso?" },
            { label: "Interpretação do Radar", text: "Como devo interpretar meu Radar de Competências e o que ele diz sobre minha prontidão para reuniões em inglês?" }
          ]
        };
      case 'analysis':
      case 'reading':
      case 'study':
        if (selectedRecording) {
          if (selectedRecording.type === 'video') {
            return {
              title: "Ferramentas do YouTube",
              icon: <Youtube className="w-3.5 h-3.5 text-error" />,
              desc: "Análise técnica do vídeo, captions sincronizados e vocabulário.",
              tools: [
                { label: "Resumo do Vídeo Aula", text: `Gere um resumo estruturado em português das ideias ensinadas no vídeo "${selectedRecording.title}".` },
                { label: "5 Lições de Expressão", text: "Quais são 5 expressões nativas interessantes de negócios usadas no vídeo e como posso usá-las?" },
                { label: "Análise de Ritmo Vocálico", text: "O orador do vídeo fala com velocidade típica de negócios? Me dê dicas para imitar essa cadência." }
              ]
            };
          } else if (selectedRecording.type === 'document') {
            return {
              title: "Ferramentas de Documento",
              icon: <FileText className="w-3.5 h-3.5 text-good" />,
              desc: "Glossário avançado, gramática empresarial e sínteses.",
              tools: [
                { label: "Estruturas Gramaticais Úteis", text: `Extraia as 3 estruturas de gramática executiva mais avançadas encontradas no texto "${selectedRecording.title}" e ensine a usá-las.` },
                { label: "Sinônimos de Alto Impacto", text: "Sugira 5 verbos fortes para substituir expressões simples como 'make', 'do' ou 'show' presentes no documento." },
                { label: "Síntese em Parágrafo Único", text: "Escreva uma síntese em inglês de alto nível do texto para que eu possa mandar por e-mail para meu time." }
              ]
            };
          } else {
            return {
              title: "Ferramentas de Áudio",
              icon: <Activity className="w-3.5 h-3.5 text-accent" />,
              desc: "Métricas de voz, tom executivo e feedbacks de pronúncia.",
              tools: [
                { label: "Avaliação de Pronúncia", text: "Com base no áudio capturado, quais são os erros mais comuns de brasileiros na pronúncia de termos como 'milestones', 'executive' e 'heuristics'?" },
                { label: "Refinar Cadência e Tom", text: "Como falar com mais autoridade, reduzindo pausas como 'humm' ou 'eh' em apresentações?" },
                { label: "Frases de Boardroom", text: "Me dê 3 modelos de frases polidas para propor um redirecionamento de estratégia em um conselho executivo." }
              ]
            };
          }
        }
        return {
          title: "Ferramentas de Análise",
          icon: <GraduationCap className="w-3.5 h-3.5 text-accent" />,
          desc: "Prática focada no seu portfólio de gravações.",
          tools: [
            { label: "Gerar Simulação de Roleplay", text: "Crie um roteiro rápido de simulação de roleplay de negócios com base no meu portfólio de gravações." },
            { label: "Explicar Termos Gerais", text: "Explique a diferença corporativa entre 'milestones', 'timeframes' e 'roadmaps'." }
          ]
        };
      default:
        return {
          title: "Suporte de Comunicação",
          icon: <HelpCircle className="w-3.5 h-3.5 text-ink-muted" />,
          desc: "Tutor inteligente sempre ativo ao seu dispor.",
          tools: [
            { label: "Explicar Expressões Corporativas", text: "Quais expressões idiomáticas são indispensáveis no inglês de negócios hoje?" }
          ]
        };
    }
  };

  const contextTools = getViewToolsAndSuggestions();

  return (
    <>
      {/* Floating Status Bar Context Badge notification */}
      {showContextSyncNotification && (
        <div
          /* `--shell-inset-right` é publicado pelo App: vale a largura do rail quando o menu
             está à direita, e 0 nas outras posições. Sem isso, o balão e o botão flutuante
             caíam EM CIMA dos controles do rail.

             F9, O TOAST SUBIU PARA O TOPO.
             Ancorado embaixo, ele cobria justamente o rodapé dos painéis, e o rodapé é onde
             este produto põe as ressalvas. No inventário, ele estava por cima de "1753 de 1902
             cartões ficaram FORA do cálculo", que é a frase que menos pode ser escondida, e por
             cima do primeiro card de jogo no mobile.

             Entre um aviso transitório de sintonia e uma ressalva estatística, quem cede espaço
             é o aviso. */
          style={{ right: 'calc(1.5rem + var(--shell-inset-right, 0px))', top: 'calc(4.5rem + var(--shell-inset-top, 0px))' }}
          className="fixed z-40 bg-ink text-surface px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 border border-border-subtle text-xs font-semibold animate-in slide-in-from-top-5 duration-300"
        >
          <div className="w-2 h-2 rounded-full bg-rare animate-pulse" />
          <span>iChat sintonizado com: <strong className="text-rare">{showContextSyncNotification}</strong></span>
        </div>
      )}

      {/* Floating iChat Trigger Badge button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{ right: 'calc(1.5rem + var(--shell-inset-right, 0px))', bottom: 'calc(1.5rem + var(--shell-inset-bottom, 0px))' }}
          /* Compacto no celular: com o rótulo, este botão cobria o CTA principal do Hub numa
             tela de 390px. Vira um círculo de ícone, que é o que cabe. */
          className="fixed z-40 p-4 rounded-full shadow-2xl flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all cursor-pointer group border bg-rare-soft hover:brightness-95 text-rare-ink border-rare"
          title="iChat: Tutor Inteligente de Business English"
          aria-label="Abrir o iChat, tutor inteligente"
        >
          <Sparkles className="w-5 h-5 fill-rare-ink group-hover:rotate-12 transition-all duration-300 text-rare-ink" />
          <span className="hidden sm:inline text-xs font-bold font-display pr-1">iChat</span>
          {/* C10 — fundo OPACO em vez de `bg-rare/15`.
              Este pill empilhava 15% de `--rare` por cima de um botão que já é `bg-rare-soft`,
              também translúcido: duas camadas do mesmo matiz, e a cor final dependia do que
              estivesse atrás. Medido em 3,35:1 no mochi escuro, e o botão é FLUTUANTE, o mesmo
              defeito aparecia nas 11 telas.

              As três saídas foram medidas nos 12 pares de tema × modo: manter como está reprova
              em dois, tirar só o tom interno reprova em um (4,22 no mochi escuro), e fundo
              opaco passa em todos com folga (pior caso 4,86). Translucidez sobre translucidez
              não tem token que a conserte: a única correção é parar de empilhar. */}
          <span className="hidden sm:inline text-[10px] bg-surface px-1.5 py-0.5 rounded-full font-mono text-rare-ink">Context</span>
        </button>
      )}

      {/* Drawer Overlay Backdrop */}
      {isOpen && !isDocked && !isMaximized && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-out Sidebar Drawer Container */}
      <div 
        className={
          !isOpen 
            ? "hidden" 
            : isMaximized && !isDocked 
              ? "fixed inset-0 w-full h-full max-w-none bg-canvas z-50 flex flex-col transition-all duration-300 animate-in fade-in duration-300"
              : isDocked
                ? "relative h-full w-full max-w-md bg-canvas border-l border-border-subtle shrink-0 flex flex-col z-30 transition-all duration-300 animate-in slide-in-from-right duration-300"
                : "fixed top-0 right-0 h-full w-full max-w-md bg-canvas border-l border-border-subtle shadow-3xl flex flex-col z-50 transition-all duration-300 animate-in slide-in-from-right duration-300"
        }
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-border-subtle bg-surface flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rare-soft/20 flex items-center justify-center text-rare">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-display font-black text-sm text-ink leading-tight">Babel iChat</h3>
                <span className="text-[9px] font-mono bg-accent-soft text-accent-ink font-bold px-1 rounded uppercase tracking-tight">Active</span>
              </div>
              <p className="text-[10px] text-ink-muted font-mono flex items-center gap-1">
                <span>Contexto:</span>
                <span className="font-semibold text-rare truncate max-w-[180px]">{getFriendlyViewName(activeView)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Fixar CONTEXTO atual (mantém no papo mesmo trocando de aba) */}
            <button
              onClick={alternarFixarAtual}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                estaFixado ? 'bg-rare-soft/20 text-rare' : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
              }`}
              title={estaFixado ? 'Desafixar este contexto' : 'Fixar o contexto desta tela na conversa'}
            >
              <Bookmark className={`w-4 h-4 ${estaFixado ? 'fill-rare text-rare' : ''}`} />
            </button>

            {/* Dock/Pin Toggle button */}
            <button
              onClick={() => setIsDocked(!isDocked)}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isDocked 
                  ? 'bg-rare-soft/20 text-rare' 
                  : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
              }`}
              title={isDocked ? "Desafixar do lado (Modo Flutuante)" : "Fixar na lateral (Modo Lado a Lado)"}
            >
              <Pin className={`w-4 h-4 ${isDocked ? 'fill-rare rotate-45 text-rare' : ''}`} />
            </button>

            {/* Maximize Toggle button */}
            {!isDocked && (
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  isMaximized 
                    ? 'bg-rare-soft/20 text-rare' 
                    : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                }`}
                title={isMaximized ? "Restaurar tamanho do Chat" : "Maximizar Chat para Tela Inteira"}
              >
                {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}

            {/* Session Selector Toggle */}
            <button
              onClick={() => setShowSessionSelector(prev => !prev)}
              className={`p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer relative ${
                showSessionSelector ? 'bg-surface-hover text-ink' : ''
              }`}
              title="Histórico de Conversas (Sessões)"
            >
              <History className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-canvas"></span>
            </button>

            {/* Close button */}
            <button 
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-surface-hover rounded-lg text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Faixa de contextos fixados (pin) */}
        {contextosFixados.length > 0 && (
          <div className="px-4 py-2 border-b border-border-subtle bg-canvas shrink-0 flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-mono uppercase tracking-wider text-ink-faint flex items-center gap-1">
              <Bookmark className="w-3 h-3" /> Fixados:
            </span>
            {contextosFixados.map((c, i) => (
              <span key={`${c.view}:${c.recordingId}:${i}`} className="inline-flex items-center gap-1 bg-rare-soft/15 text-rare border border-rare/25 rounded-full pl-2 pr-1 py-0.5 text-[10px] font-semibold max-w-[180px]">
                <span className="truncate">{c.label}</span>
                <button onClick={() => removerFixado(i)} className="hover:bg-rare/20 rounded-full p-0.5 cursor-pointer" title="Remover contexto fixado">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Sessions & Conversational History Sub-Panel Overlay */}
        {showSessionSelector && (
          <div className="absolute inset-0 top-[65px] bg-canvas/95 backdrop-blur-sm z-30 flex flex-col p-5 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center justify-between mb-4 border-b border-border-subtle pb-2 shrink-0">
              <span className="text-xs font-display font-extrabold text-ink uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-rare" /> Suas Conversas (Sessões)
              </span>
              <button
                onClick={handleCreateNewSession}
                className="bg-rare-soft hover:brightness-95 active:scale-95 text-rare-ink px-3 py-1.5 rounded-lg flex items-center gap-1 text-[11px] font-bold cursor-pointer transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Nova Conversa
              </button>
            </div>

            {/* Session List Feed */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {sessions.map((sess) => {
                const isActive = sess.id === activeSessionId;
                const isEditing = sess.id === editingSessionId;

                return (
                  <div
                    key={sess.id}
                    onClick={() => !isEditing && handleSelectSession(sess.id)}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-2 group cursor-pointer ${
                      isActive 
                        ? 'bg-rare-soft/10 border-rare text-ink shadow-sm font-semibold' 
                        : 'bg-surface border-border-subtle text-ink-muted hover:text-ink hover:border-rare-soft/40'
                    }`}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-rare' : 'bg-ink-muted/30'}`} />
                      
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1" onClick={e => e.stopPropagation()}>
                          <input
                            id="ichat-rename-session"
                            name="ichat-rename-session"
                            type="text"
                            value={renameInput}
                            onChange={e => setRenameInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveRename(sess.id)}
                            className="bg-canvas border border-rare text-xs rounded px-2 py-1 outline-none text-ink w-full font-normal"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveRename(sess.id)}
                            className="text-[10px] font-bold text-rare hover:underline px-1 shrink-0"
                          >
                            Salvar
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <span className="text-xs truncate block font-display">{sess.title}</span>
                          <span className="text-[9.5px] text-ink-faint block font-mono">
                            {sess.messages.length} mensagens • Criado em {new Date(sess.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => startRenameSession(sess.id, sess.title, e)}
                          className="p-1 hover:bg-surface-hover rounded text-ink-muted hover:text-ink cursor-pointer"
                          title="Renomear conversa"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteSession(sess.id, e)}
                          className="p-1 hover:bg-surface-hover rounded text-ink-muted hover:text-error cursor-pointer"
                          title="Apagar conversa"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowSessionSelector(false)}
              className="mt-4 w-full text-center text-xs font-bold font-display p-2 bg-surface hover:bg-surface-hover text-ink-muted hover:text-ink border border-border-subtle rounded-xl cursor-pointer transition-colors"
            >
              Voltar para o Chat
            </button>
          </div>
        )}

        {/* Messages Feed panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-canvas/20">
          {activeSession && activeSession.messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div key={index} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-rare-soft text-rare-ink flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="max-w-[82%] flex flex-col space-y-1">
                  <div className={`p-3.5 rounded-2xl text-xs leading-relaxed border shadow-xs ${
                    isUser
                      ? 'bg-rare-soft text-rare-ink border-rare rounded-tr-none font-semibold'
                      : 'bg-surface text-ink border-border-subtle rounded-tl-none font-medium'
                  }`}>
                    {/* Preserve line breaks and output lists nicely */}
                    {msg.content.split('\n').map((para, pIdx) => {
                      // Basic markdown rendering helper for bold or bullet points
                      if (para.trim().startsWith('* ') || para.trim().startsWith('- ')) {
                        return (
                          <li key={pIdx} className="ml-3 list-disc mt-1 text-inherit">
                            {para.replace(/^[\s*-]+/, '')}
                          </li>
                        );
                      }
                      if (para.trim().startsWith('###')) {
                        return (
                          <h5 key={pIdx} className="font-display font-extrabold text-[12.5px] mt-2.5 mb-1 text-inherit first:mt-0">
                            {para.replace('###', '').trim()}
                          </h5>
                        );
                      }
                      if (para.trim().startsWith('**')) {
                        return (
                          <p key={pIdx} className="font-bold mt-1.5 text-inherit first:mt-0">
                            {para.replace(/\*\*/g, '').trim()}
                          </p>
                        );
                      }
                      return (
                        <p key={pIdx} className={pIdx > 0 ? 'mt-1.5' : ''}>
                          {para}
                        </p>
                      );
                    })}
                  </div>
                  <span className={`text-[8.5px] font-mono text-ink-faint ${isUser ? 'text-right' : 'text-left'}`}>
                    {msg.timestamp}
                  </span>
                </div>
                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold shrink-0 mt-1 shadow-sm">
                    U
                  </div>
                )}
              </div>
            );
          })}

          {/* AI Loader bubble */}
          {loading && (
            <div className="flex gap-3 justify-start animate-pulse">
              <div className="w-7 h-7 rounded-full bg-rare-soft text-rare-ink flex items-center justify-center shrink-0 mt-1">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="p-3 bg-surface text-ink-muted border border-border-subtle rounded-2xl rounded-tl-none text-xs flex items-center gap-1.5 shadow-sm font-semibold">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rare" />
                <span>Analisando contexto do Babel...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic Navigation History Log (registered navigation tracking) drawer footer expansion */}
        {activeSession && activeSession.navigationHistory && activeSession.navigationHistory.length > 1 && (
          <div className="px-4 py-2 border-t border-border-subtle bg-canvas shrink-0 flex items-center justify-between text-[10px]">
            <span className="text-ink-faint font-mono flex items-center gap-1">
              <History className="w-3 h-3" />
              <span>Log de Navegação:</span>
              <strong className="text-ink-muted truncate max-w-[150px]">{activeSession.navigationHistory[activeSession.navigationHistory.length - 1].view}</strong>
            </span>
            <span className="text-rare font-mono font-bold text-[9px] uppercase">
              {contextosFixados.length > 0 ? `${contextosFixados.length} contexto(s) fixado(s)` : 'Contexto fluido'}
            </span>
          </div>
        )}

        {/* Chat Input form bar with paperclip tool launcher */}
        <div className="p-4 border-t border-border-subtle bg-surface shrink-0 relative">
          
          {/* Popover/collapsed tools above input */}
          {showTools && (
            <div className="absolute bottom-18 left-4 right-4 bg-surface rounded-2xl border border-border-subtle p-3.5 shadow-2xl z-50 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  {contextTools.icon}
                  <span className="text-xs font-display font-extrabold text-ink uppercase tracking-wider">
                    {contextTools.title}
                  </span>
                </div>
                <button 
                  onClick={() => setShowTools(false)} 
                  className="p-1 hover:bg-canvas rounded-lg text-ink-muted hover:text-ink cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <p className="text-[10.5px] text-ink-muted mb-2.5 leading-relaxed font-semibold">
                {contextTools.desc}
              </p>
              
              {/* Context Tool Action pills */}
              <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
                {contextTools.tools.map((tool, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      handleSendMessage(tool.text);
                      setShowTools(false);
                    }}
                    className="w-full text-left bg-canvas hover:bg-rare-soft/5 border border-border-subtle hover:border-rare/30 px-3 py-2 rounded-lg text-[11px] text-ink hover:text-rare font-bold transition-all flex items-center justify-between group cursor-pointer shadow-btn"
                  >
                    <span className="truncate pr-2">{tool.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-rare" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 items-center">
            {/* Paperclip collapse action */}
            <button
              onClick={() => setShowTools(prev => !prev)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                showTools 
                  ? 'bg-rare-soft/20 border-rare/30 text-rare' 
                  : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink hover:bg-surface-hover'
              }`}
              title="Ferramentas de Contexto (Clipe)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              id="ichat-message"
              name="ichat-message"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder={`Sussurre uma dúvida sobre ${getFriendlyViewName(activeView)}...`}
              className="flex-1 px-4 py-2.5 bg-canvas text-xs border border-border-subtle rounded-xl outline-none focus:border-rare text-ink placeholder:text-ink-muted font-medium shadow-inner animate-in duration-200"
            />
            
            <button 
              onClick={() => handleSendMessage()}
              disabled={!chatInput.trim() || loading}
              className="px-4 py-2.5 bg-rare-soft hover:brightness-95 disabled:opacity-50 text-rare-ink rounded-xl flex items-center justify-center cursor-pointer transition-colors text-xs font-bold font-display shadow-btn self-stretch"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
