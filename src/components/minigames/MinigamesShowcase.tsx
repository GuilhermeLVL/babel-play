import React, { useState } from 'react';
import { Gamepad2, Volume2, Briefcase, Zap, ShieldAlert, Sparkles, ArrowLeft, CheckCircle2, Train, Theater, Gem, Compass, Target, Flame } from 'lucide-react';
import KarutaGame from './KarutaGame';
import KofferGame from './KofferGame';
import ChoseongGame from './ChoseongGame';
import TabooGame from './TabooGame';
import ShiritoriGame from './ShiritoriGame';
import CadavreExquisGame from './CadavreExquisGame';
import BaoGame from './BaoGame';
import TenseTennisGame from './TenseTennisGame';
import VitendawiliGame from './VitendawiliGame';
import type { MinigameItem, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';

/**
 * SHOWCASE & LABORATÓRIO DOS 9 MINIGAMES CULTURAIS
 *
 * Mapeados no currículo de SLA e desenvolvidos de forma 100% jogável:
 *
 * 1. 🇯🇵 Karuta (Audio-Slap Reflex) — Japão (Fase 1 - A1)
 * 2. 🇯🇵/🇰🇷 Shiritori Express (Cadeia Fonológica & Digitação Livre) — Japão / Coreia (Fase 2 - A2)
 * 3. 🇰🇷 Choseong Quiz (초성 퀴ズ) — Coreia do Sul (Fase 2 - A2)
 * 4. 🇩🇪 Ich packe meinen Koffer (Mala de Viagem & Acusativo) — Alemanha (Fase 3 - B1)
 * 5. 🇪🇸/🇲🇽 Tense Tennis (Pelota Gramatical & Tempos Verbais) — Espanha / LatAm (Fase 3 - B1)
 * 6. 🌍 Bao Mancala (Semeadura de Morfemas) — África Oriental / Swahili (Fase 3 - B1)
 * 7. 🇫🇷 Cadavre Exquis (Laboratório Surrealista) — França (Fase 4 - B2)
 * 8. 🌐 Taboo Arena (Forja da Circunlocução & Taboo Radar) — Global / ESL (Fase 5 - C1)
 * 9. 🔥 Vitendawili Enigmas (Metáforas Culturais Swahili) — Quênia / Tanzânia (Fase 5 - C2)
 */

interface MinigamesShowcaseProps {
  ageProfile?: AgeProfileType;
  items?: MinigameItem[];
  onBack?: () => void;
}

type JogoAtivo = 'karuta' | 'koffer' | 'choseong' | 'taboo' | 'shiritori' | 'cadavre' | 'bao' | 'tennis' | 'vitendawili' | null;

export default function MinigamesShowcase({
  ageProfile = 'pro',
  items,
  onBack,
}: MinigamesShowcaseProps) {
  const [jogoAtivo, setJogoAtivo] = useState<JogoAtivo>(null);
  const [filtroRegiao, setFiltroRegiao] = useState<'todas' | 'asia' | 'europa' | 'africa' | 'global'>('todas');
  const [ultimoRelatorio, setUltimoRelatorio] = useState<RoundReport | null>(null);

  const handleFinalizarJogo = (report: RoundReport) => {
    setUltimoRelatorio(report);
    setJogoAtivo(null);
  };

  const handleSairDoJogo = () => {
    setJogoAtivo(null);
  };

  // Renderização isolada em tela cheia do jogo selecionado
  if (jogoAtivo === 'karuta') {
    return <KarutaGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }
  if (jogoAtivo === 'koffer') {
    return <KofferGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }
  if (jogoAtivo === 'choseong') {
    return <ChoseongGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }
  if (jogoAtivo === 'taboo') {
    return <TabooGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }
  if (jogoAtivo === 'shiritori') {
    return <ShiritoriGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }
  if (jogoAtivo === 'cadavre') {
    return <CadavreExquisGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }
  if (jogoAtivo === 'bao') {
    return <BaoGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }
  if (jogoAtivo === 'tennis') {
    return <TenseTennisGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }
  if (jogoAtivo === 'vitendawili') {
    return <VitendawiliGame items={items} ageProfile={ageProfile} onFinish={handleFinalizarJogo} onExit={handleSairDoJogo} />;
  }

  const jogos = [
    {
      id: 'karuta' as const,
      regiao: 'asia' as const,
      titulo: 'Karuta (Audio-Slap Reflex)',
      origem: '🇯🇵 Japão · Fase 1 (A1/A2)',
      descricao: 'Varredura visual no tatame com cartas espalhadas organicamente e decoys. Ouça o áudio nativo e golpeie antes que o tempo esgote para bônus Kimariji (3x)!',
      icone: <Volume2 className="w-6 h-6 text-amber-500" />,
      badges: ['Reconhecimento Imediato', 'Física de Slap', 'Áudio Nativo'],
    },
    {
      id: 'shiritori' as const,
      regiao: 'asia' as const,
      titulo: 'Shiritori Express',
      origem: '🇯🇵/🇰🇷 Japão & Coreia · Fase 2 (A2/B1)',
      descricao: 'Cadeia fonológica sem repetições! Conecte o último fonema ao primeiro escolhendo cartas rápidas OU digitando livremente sua própria palavra.',
      icone: <Train className="w-6 h-6 text-indigo-500" />,
      badges: ['Dicionário 100+', 'Digitação Livre', 'Combo Express'],
    },
    {
      id: 'choseong' as const,
      regiao: 'asia' as const,
      titulo: 'Choseong Arena',
      origem: '🇰🇷 Coreia do Sul · Fase 2 (A2/B1)',
      descricao: 'Decifre palavras completas através de blocos 3D e pistas consonantais, com digitação física híbrida e Modo Febre em sequências perfeitas!',
      icone: <Zap className="w-6 h-6 text-purple-500" />,
      badges: ['Slots 3D', 'Fever Mode', 'Teclado Híbrido'],
    },
    {
      id: 'koffer' as const,
      regiao: 'europa' as const,
      titulo: 'Ich packe meinen Koffer',
      origem: '🇩🇪 Alemanha · Fase 3 (B1)',
      descricao: 'Mala de viagem tátil que fecha com zíper no recall! Puxe da memória os itens anteriores e decline o caso acusativo correto (einen / eine / ein).',
      icone: <Briefcase className="w-6 h-6 text-blue-500" />,
      badges: ['Temas de Viagem', 'Caso Acusativo', 'Memória de Trabalho'],
    },
    {
      id: 'tennis' as const,
      regiao: 'europa' as const,
      titulo: 'Tense Tennis (Pelota Gramatical)',
      origem: '🇪🇸/🇲🇽 Espanha & LatAm · Fase 3 (B1)',
      descricao: 'O tênis retrô dos tempos verbais! Rebata a bola com a conjugação exigida pelo placar (Pretérito, Futuro, Subjuntivo) antes da linha de fundo.',
      icone: <Target className="w-6 h-6 text-red-500" />,
      badges: ['Conjugação Ágil', 'Rallies Contínuos', 'Foco na Forma'],
    },
    {
      id: 'bao' as const,
      regiao: 'africa' as const,
      titulo: 'Bao Mancala dos Morfemas',
      origem: '🌍 África Oriental · Fase 3 (B1)',
      descricao: 'Tabuleiro tradicional entalhado em madeira. Espalhe a raiz lexical e capture as covas com os afixos morfológicos corretos para formar palavras!',
      icone: <Gem className="w-6 h-6 text-amber-600" />,
      badges: ['Mancala de Madeira', 'Semeadura Tátil', 'Morfologia Swahili'],
    },
    {
      id: 'cadavre' as const,
      regiao: 'europa' as const,
      titulo: 'Cadavre Exquis',
      origem: '🇫🇷 França · Fase 4 (B2)',
      descricao: 'Laboratório surrealista parisiense! Monte frases absurdas combinando cartas sintáticas ou escreva palavras livres, com narração de voz teatral.',
      icone: <Theater className="w-6 h-6 text-emerald-500" />,
      badges: ['Palavras Livres', 'Temas Surrealistas', 'Voz Teatral'],
    },
    {
      id: 'taboo' as const,
      regiao: 'global' as const,
      titulo: 'Taboo Arena',
      origem: '🌐 Global / ESL · Fase 5 (B2/C1)',
      descricao: 'A forja da circunlocução! Escolha paráfrases legais OU digite sua própria definição com o Taboo Radar analisando termos proibidos em tempo real.',
      icone: <ShieldAlert className="w-6 h-6 text-rose-500" />,
      badges: ['Taboo Radar', 'Forja Livre', 'Power-ups de Festa'],
    },
    {
      id: 'vitendawili' as const,
      regiao: 'africa' as const,
      titulo: 'Vitendawili Enigmas (Tega!)',
      origem: '🌍 Quênia & Tanzânia · Fase 5 (C1/C2)',
      descricao: 'O ritual noturno dos enigmas ao redor do fogo em Swahili! Responda ao chamado "Kitendawili!" e decifre metáforas da sabedoria comunitária.',
      icone: <Flame className="w-6 h-6 text-orange-500" />,
      badges: ['Metáforas Culturais', 'Sabedoria Ancestral', 'Pragmática C2'],
    },
  ];

  const jogosFiltrados = jogos.filter((j) => filtroRegiao === 'todas' || j.regiao === filtroRegiao);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 md:p-10 space-y-8 animate-fadeIn">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-accent text-accent-contrast shadow-sm">
              <Gamepad2 className="w-5 h-5" />
            </span>
            <span className="text-xs font-mono uppercase tracking-widest text-accent font-bold">
              Laboratório Cultural de SLA · 9 Minigames
            </span>
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl text-ink">Catálogo de Jogos Culturais</h1>
          <p className="text-sm text-ink-muted mt-1">
            Protótipos funcionais com mecânicas lúdicas avançadas na branch <code className="px-2 py-0.5 rounded bg-surface border border-border-subtle font-mono text-accent">feature/minigames-prototypes</code>
          </p>
        </div>

        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover font-bold text-sm text-ink transition-colors self-start sm:self-auto shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
        )}
      </div>

      {/* Notificação de Último Resultado */}
      {ultimoRelatorio && (
        <div className="p-6 rounded-2xl bg-good-soft/60 border-2 border-good/40 text-good-ink flex items-center justify-between gap-4 animate-fadeIn shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-good shrink-0" />
            <div>
              <p className="font-display font-black text-lg">Rodada Concluída com Sucesso!</p>
              <p className="text-xs text-ink-muted">
                Pontuação: <span className="font-mono font-bold text-ink">{ultimoRelatorio.score} pts</span> · 
                Duração: <span className="font-mono font-bold text-ink">{(ultimoRelatorio.durationMs / 1000).toFixed(1)}s</span> · 
                Itens: <span className="font-mono font-bold text-ink">{ultimoRelatorio.items.length} avaliados</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setUltimoRelatorio(null)}
            className="text-xs font-bold text-ink-muted hover:text-ink underline cursor-pointer"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Filtros Regionais */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-ink-muted mr-1 flex items-center gap-1">
          <Compass className="w-4 h-4" />
          <span>Região Cultural:</span>
        </span>
        {[
          { id: 'todas', label: 'Todos os Jogos (9)' },
          { id: 'asia', label: '🇯🇵 🇰🇷 Ásia (3)' },
          { id: 'europa', label: '🇩🇪 🇪🇸 🇫🇷 Europa (3)' },
          { id: 'africa', label: '🌍 África (2)' },
          { id: 'global', label: '🌐 Global (1)' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltroRegiao(f.id as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filtroRegiao === f.id
                ? 'bg-accent text-accent-contrast shadow-sm scale-105'
                : 'border border-border-subtle bg-surface hover:bg-surface-hover text-ink-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid com os 9 Jogos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jogosFiltrados.map((jogo) => (
          <div
            key={jogo.id}
            className="flex flex-col justify-between p-6 rounded-3xl border-2 border-border-subtle bg-surface shadow-card hover:border-accent hover:-translate-y-1 transition-all group"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-surface-hover border border-border-subtle flex items-center justify-center group-hover:scale-110 transition-transform">
                  {jogo.icone}
                </div>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-accent-soft text-accent-ink font-bold">
                  {jogo.origem}
                </span>
              </div>

              <h3 className="font-display font-black text-xl text-ink group-hover:text-accent transition-colors">
                {jogo.titulo}
              </h3>

              <p className="text-xs text-ink-muted leading-relaxed my-3">
                {jogo.descricao}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-6">
                {jogo.badges.map((b) => (
                  <span key={b} className="text-[10px] px-2 py-0.5 rounded-md bg-surface-hover border border-border-subtle font-mono text-ink-muted">
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => setJogoAtivo(jogo.id)}
              className="w-full py-3 rounded-xl bg-accent text-accent-contrast font-bold text-xs shadow-card hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Jogar Protótipo</span>
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
