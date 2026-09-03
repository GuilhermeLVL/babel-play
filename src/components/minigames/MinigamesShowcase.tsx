import React, { useState } from 'react';
import { Gamepad2, Volume2, Briefcase, Zap, ShieldAlert, Sparkles, ArrowLeft, Trophy, CheckCircle2 } from 'lucide-react';
import KarutaGame from './KarutaGame';
import KofferGame from './KofferGame';
import ChoseongGame from './ChoseongGame';
import TabooGame from './TabooGame';
import type { MinigameItem, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';

/**
 * SHOWCASE & LABORATÓRIO DOS NOVOS MINIGAMES CULTURAIS
 *
 * Permite testar, jogar e validar isoladamente cada um dos 4 protótipos funcionais
 * mapeados no currículo de SLA e especificados em docs/minigames_spec.md:
 *
 * 1. Karuta (Audio-Slap Reflex) — Japão
 * 2. Ich packe meinen Koffer (Mala Infinita Gramatical) — Alemanha
 * 3. Choseong Game (Decifrador de Consoantes) — Coreia do Sul
 * 4. Taboo Arena (Forja da Circunlocução) — Global / ESL
 */

interface MinigamesShowcaseProps {
  ageProfile?: AgeProfileType;
  items?: MinigameItem[];
  onBack?: () => void;
}

type JogoAtivo = 'karuta' | 'koffer' | 'choseong' | 'taboo' | null;

export default function MinigamesShowcase({
  ageProfile = 'pro',
  items,
  onBack,
}: MinigamesShowcaseProps) {
  const [jogoAtivo, setJogoAtivo] = useState<JogoAtivo>(null);
  const [ultimoRelatorio, setUltimoRelatorio] = useState<RoundReport | null>(null);

  const handleFinalizarJogo = (report: RoundReport) => {
    setUltimoRelatorio(report);
    setJogoAtivo(null);
  };

  const handleSairDoJogo = () => {
    setJogoAtivo(null);
  };

  // Se um jogo estiver ativo, renderiza em tela cheia com seu container isolado
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

  return (
    <div className="w-full max-w-6xl mx-auto p-6 md:p-10 space-y-8 animate-fadeIn">
      {/* Cabeçalho do Showcase */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-accent text-accent-contrast shadow-sm">
              <Gamepad2 className="w-5 h-5" />
            </span>
            <span className="text-xs font-mono uppercase tracking-widest text-accent font-bold">Laboratório de Protótipos</span>
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl text-ink">Novos Minigames Culturais</h1>
          <p className="text-sm text-ink-muted mt-1">
            Protótipos funcionais da branch <code className="px-2 py-0.5 rounded bg-surface border border-border-subtle font-mono text-accent">feature/minigames-prototypes</code>
          </p>
        </div>

        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover font-bold text-sm text-ink transition-colors self-start sm:self-auto shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
        )}
      </div>

      {/* Cartão de Último Resultado (se acabou de jogar) */}
      {ultimoRelatorio && (
        <div className="p-6 rounded-2xl bg-good-soft/50 border-2 border-good/30 text-good-ink flex items-center justify-between gap-4 animate-fadeIn">
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
            className="text-xs font-bold text-ink-muted hover:text-ink underline"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Grid com os 4 Novos Minigames */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Karuta */}
        <div className="flex flex-col justify-between p-6 sm:p-8 rounded-3xl border-2 border-border-subtle bg-surface shadow-card hover:border-accent transition-all group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                <Volume2 className="w-6 h-6" />
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-accent-soft text-accent-ink font-bold uppercase tracking-wider">
                🇯🇵 Japão · A1/A2
              </span>
            </div>

            <h3 className="font-display font-black text-2xl text-ink group-hover:text-accent transition-colors">
              Karuta (Audio-Slap Reflex)
            </h3>
            <p className="text-xs font-mono uppercase text-ink-faint mt-0.5 mb-3">競技かるた · Percepção Auditiva Rápida</p>

            <p className="text-sm text-ink-muted leading-relaxed mb-4">
              Ouça o chamado por áudio nativo e golpeie a carta correta na arena. Acerte nas primeiras sílabas para ativar o lendário multiplicador de <strong>Kimariji (3x)</strong>.
            </p>

            <ul className="text-xs text-ink-muted space-y-1.5 mb-6 list-disc list-inside">
              <li>Mapeamento áudio-visual sem subvocalização</li>
              <li>TTS multilíngue nativo e offline</li>
              <li>Física de toque e cartas dinâmicas</li>
            </ul>
          </div>

          <button
            onClick={() => setJogoAtivo('karuta')}
            className="w-full py-3.5 rounded-xl bg-accent text-accent-contrast font-bold text-sm shadow-card hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <span>Jogar Protótipo</span>
            <Sparkles className="w-4 h-4" />
          </button>
        </div>

        {/* Card 2: Ich packe meinen Koffer */}
        <div className="flex flex-col justify-between p-6 sm:p-8 rounded-3xl border-2 border-border-subtle bg-surface shadow-card hover:border-accent transition-all group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                <Briefcase className="w-6 h-6" />
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-blue-500/20 text-blue-700 font-bold uppercase tracking-wider">
                🇩🇪 Alemanha · B1
              </span>
            </div>

            <h3 className="font-display font-black text-2xl text-ink group-hover:text-accent transition-colors">
              Ich packe meinen Koffer
            </h3>
            <p className="text-xs font-mono uppercase text-ink-faint mt-0.5 mb-3">Mala Infinita · Memória & Casos Gramaticais</p>

            <p className="text-sm text-ink-muted leading-relaxed mb-4">
              A clássica dinâmica alemã de salão: repita a sequência inteira dos itens da mala e decline corretamente o artigo no caso <strong>Acusativo</strong> (<em>einen, eine, ein</em>) a cada novo objeto!
            </p>

            <ul className="text-xs text-ink-muted space-y-1.5 mb-6 list-disc list-inside">
              <li>Proceduralização automática de gênero e caso</li>
              <li>Memória de trabalho cumulativa (Simon Says)</li>
              <li>3 vidas com animações de mala tátil</li>
            </ul>
          </div>

          <button
            onClick={() => setJogoAtivo('koffer')}
            className="w-full py-3.5 rounded-xl bg-accent text-accent-contrast font-bold text-sm shadow-card hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <span>Jogar Protótipo</span>
            <Sparkles className="w-4 h-4" />
          </button>
        </div>

        {/* Card 3: Choseong Game */}
        <div className="flex flex-col justify-between p-6 sm:p-8 rounded-3xl border-2 border-border-subtle bg-surface shadow-card hover:border-accent transition-all group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-purple-500/20 text-purple-700 font-bold uppercase tracking-wider">
                🇰🇷 Coreia · A2/B1
              </span>
            </div>

            <h3 className="font-display font-black text-2xl text-ink group-hover:text-accent transition-colors">
              Choseong Quiz
            </h3>
            <p className="text-xs font-mono uppercase text-ink-faint mt-0.5 mb-3">초성게임 · Decifrador de Consoantes</p>

            <p className="text-sm text-ink-muted leading-relaxed mb-4">
              O fenômeno da TV e escolas coreanas: descubra a palavra completa recebendo apenas suas consoantes-âncora e a pista de categoria antes do cronômetro zerar.
            </p>

            <ul className="text-xs text-ink-muted space-y-1.5 mb-6 list-disc list-inside">
              <li>Resgate lexical ativo de alto envolvimento</li>
              <li>Suporte a teclado físico e botões virtuais</li>
              <li>Combo de streak e fever multiplicador</li>
            </ul>
          </div>

          <button
            onClick={() => setJogoAtivo('choseong')}
            className="w-full py-3.5 rounded-xl bg-accent text-accent-contrast font-bold text-sm shadow-card hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <span>Jogar Protótipo</span>
            <Sparkles className="w-4 h-4" />
          </button>
        </div>

        {/* Card 4: Taboo Arena */}
        <div className="flex flex-col justify-between p-6 sm:p-8 rounded-3xl border-2 border-border-subtle bg-surface shadow-card hover:border-accent transition-all group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-600 group-hover:scale-110 transition-transform">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-rose-500/20 text-rose-700 font-bold uppercase tracking-wider">
                🌐 Global · B2/C1
              </span>
            </div>

            <h3 className="font-display font-black text-2xl text-ink group-hover:text-accent transition-colors">
              Taboo Arena
            </h3>
            <p className="text-xs font-mono uppercase text-ink-faint mt-0.5 mb-3">Circunlocução & Paráfrase Avançada</p>

            <p className="text-sm text-ink-muted leading-relaxed mb-4">
              A chave para quebrar o platô intermediário: identifique a melhor circunlocução conceitual para a palavra-alvo sem jamais cair nas 4 palavras tabu proibidas!
            </p>

            <ul className="text-xs text-ink-muted space-y-1.5 mb-6 list-disc list-inside">
              <li>Destrói o vício de tradução mental literal</li>
              <li>Detector de infrações e alarme de tabu</li>
              <li>Raciocínio periférico e descrições funcionais</li>
            </ul>
          </div>

          <button
            onClick={() => setJogoAtivo('taboo')}
            className="w-full py-3.5 rounded-xl bg-accent text-accent-contrast font-bold text-sm shadow-card hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <span>Jogar Protótipo</span>
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
