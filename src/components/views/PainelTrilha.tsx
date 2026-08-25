import React, { useMemo } from 'react';
import { GraduationCap, Check } from 'lucide-react';
import {
  progressoDaTrilha, nivelSugerido, chaveDaPalavra,
  etapasDoNivel, progressoDasEtapas, etapaAtual, posicaoNaTrilha,
  type DadoTrilha, type CefrLevel,
} from '@core';
import type { VocabCard } from '../../types';
import type { AgeProfileType } from '../../lib/profile';

/**
 * A TRILHA — trazer vocabulário curado para o baralho, por nível.
 *
 * O VAZIO QUE ELA PREENCHE. Tudo neste app nasce do que a pessoa grava, e isso é a maior
 * qualidade dele — mas quem acabou de instalar não tem baralho, e sem baralho não há jogo. Além
 * disso, um vocabulário feito só de captura é enviesado pelo que se assistiu: sobra jargão do
 * vídeo e faltam palavras básicas que nunca apareceram nele.
 *
 * O QUE ACONTECE AO TRAZER. As palavras entram como cartões NORMAIS, com `session_id` do baralho
 * da trilha. Ou seja: ganham agendamento, XP, e todos os seis jogos de graça — e continuam
 * separáveis do que foi capturado, que é o que o seletor de fonte usa.
 *
 * A TRADUÇÃO É O PONTO DELICADO. A lista curada traz palavra e nível, não tradução — e a pista
 * dos jogos É a tradução. Ela vem do MESMO motor que traduz as capturas. Se o motor não estiver
 * disponível, a tela DIZ isso e não traz nada: um cartão sem tradução entra no baralho como lixo,
 * e acabamos de passar um ciclo inteiro tirando lixo de lá.
 */

interface PainelTrilhaProps {
  dado: DadoTrilha;
  deck: VocabCard[];
  ageProfile: AgeProfileType;
  nivel: CefrLevel | undefined;
  onEscolherNivel: (n: CefrLevel) => void;
}

export default function PainelTrilha({
  dado, deck, ageProfile, nivel, onEscolherNivel,
}: PainelTrilhaProps) {

  /**
   * QUANTAS DESTE NÍVEL JÁ ESTÃO NA SUA REVISÃO.
   *
   * Conta só o que veio da trilha e está gravado no banco — ou seja, as palavras que você ERROU e
   * que por isso viraram cartão de revisão espaçada. Antes este número era medido sobre o baralho
   * INTEIRO e dizia "206 de 923 do A1 (22%)" enquanto a rodada entregava 28 cartas: a tela e o
   * jogo falavam de coisas diferentes.
   */
  const jogaveisDaTrilha = useMemo(
    () => new Set(
      /* `daTrilha` — o filtro por `sourceSessionId` nunca casava e este painel anunciava 0% para
         sempre, mesmo para quem já tinha errado dezenas de palavras da trilha. */
      deck.filter(c => c.daTrilha).map(c => chaveDaPalavra(c.word)),
    ),
    [deck],
  );

  const progresso = useMemo(() => progressoDaTrilha(dado, jogaveisDaTrilha), [dado, jogaveisDaTrilha]);
  const sugerido = useMemo(() => nivelSugerido(progresso), [progresso]);
  const nivelAtivo = nivel ?? sugerido;

  const doNivel = progresso.find(p => p.nivel === nivelAtivo);

  /* As etapas do nível ativo. Derivadas do MESMO dado embutido — nenhuma ida à rede, e o mesmo
     conjunto `jogaveisDaTrilha` que já responde "o que deste nível está no meu caderno". */
  const etapas = useMemo(
    () => (nivelAtivo ? progressoDasEtapas(etapasDoNivel(dado, nivelAtivo), jogaveisDaTrilha) : []),
    [dado, nivelAtivo, jogaveisDaTrilha],
  );
  const posicao = useMemo(() => posicaoNaTrilha(etapas), [etapas]);
  const etapa = useMemo(() => etapaAtual(etapas) ?? etapas[etapas.length - 1]?.etapa ?? null, [etapas]);

  return (
    <section className="card-panel bg-surface p-4 mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 label-mono">
          <GraduationCap className="w-4 h-4 text-accent" aria-hidden />
          {ageProfile === 'kids' ? 'Palavras para aprender' : 'Trilha de vocabulário'}
        </span>
        <span className="text-[12px] text-ink-muted">
          {ageProfile === 'senior'
            ? 'Palavras escolhidas por nível, para você não depender só do que gravou.'
            : 'Vocabulário curado por nível — o que falta no que você captura.'}
        </span>
      </div>

      {/* OS NÍVEIS, com o quanto de cada um já está no baralho. Sem esse número a escolha de
          nível é chute; com ele, a trilha vira trilha. */}
      <div className="flex flex-wrap gap-1.5">
        {progresso.map(p => {
          const ativo = p.nivel === nivelAtivo;
          const completo = p.pct >= 80;
          return (
            <button
              key={p.nivel}
              onClick={() => onEscolherNivel(p.nivel)}
              className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                ativo ? 'border-accent bg-accent-soft' : 'border-border-subtle hover:border-accent'
              }`}
              title={`${p.jaTem} de ${p.total} palavras do ${p.nivel} prontas para jogar na trilha`}
            >
              <span className="flex items-center gap-1.5 font-display font-black text-[13px] text-ink">
                {p.nivel}
                {completo && <Check className="w-3.5 h-3.5 text-good-ink" aria-hidden />}
                {p.nivel === sugerido && !ativo && (
                  <span className="text-[9px] font-mono font-bold text-accent-ink">AQUI</span>
                )}
              </span>
              <span className="block text-[10px] text-ink-muted font-mono">{p.pct}%</span>
              <span className="block h-1 w-12 bg-canvas rounded-full mt-1 overflow-hidden">
                <span className={`block h-full rounded-full ${completo ? 'bg-good' : 'bg-accent'}`} style={{ width: `${p.pct}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      {doNivel && (
        <p className="text-[12.5px] text-ink">
          <b className="text-accent">{doNivel.total}</b> palavras do {nivelAtivo} prontas para jogar
          {doNivel.jaTem > 0 && <span className="text-ink-muted"> · {doNivel.jaTem} já na sua revisão</span>}
        </p>
      )}

      {/* ── O CAMINHO DENTRO DO NÍVEL ──────────────────────────────────────────────────────────
          "581 palavras do A2" é verdade e não convida ninguém a começar: não há onde parar, nem
          como saber que se avançou. As etapas quebram o nível em passos de 28 — o suficiente para
          fechar um em poucas rodadas de 8, que é o que transforma progresso em algo que acontece.

          O nome de cada etapa é o nível e o número, não um tema. O dado é uma lista alfabética de
          frequência CEFR: não há tema lá dentro, e batizar a fatia de "Na escola" seria um rótulo
          plausível e falso. O subtítulo diz o que ela realmente é ("de education a fashion"). */}
      {posicao && etapa && (
        <div className="border-t border-border-subtle pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
            <span className="label-mono">
              Etapa {posicao.atual} de {posicao.total}
            </span>
            <span className="text-[11.5px] text-ink-muted">{etapa.subtitulo}</span>
          </div>

          {/* Um traço por etapa: feitas em verde, a atual em destaque, as futuras apagadas. A
              contagem exata está escrita acima — a régua serve para ver a distância de relance. */}
          <ol className="flex flex-wrap gap-1" aria-label={`Progresso do ${nivelAtivo}: etapa ${posicao.atual} de ${posicao.total}`}>
            {etapas.map(p => (
              <li
                key={p.etapa.id}
                title={`${p.etapa.nome} — ${p.jaTem} de ${p.total} no seu caderno`}
                aria-current={p.estado === 'atual' ? 'step' : undefined}
                className={`h-1.5 rounded-full ${
                  p.estado === 'feita' ? 'w-5 bg-good'
                    : p.estado === 'atual' ? 'w-8 bg-accent'
                      : 'w-5 bg-surface-hover'
                }`}
              />
            ))}
          </ol>
        </div>
      )}

      {/* PROCEDÊNCIA, dita em voz alta — e agora ela mudou de natureza.
          Antes esta linha avisava que a tradução era feita por MÁQUINA na hora ("describe" saiu
          como "desenhar" num teste) e pedia para o usuário conferir. Agora nível e tradução vêm
          ambos de listas públicas escritas por gente, embutidas no app: nada é traduzido na hora,
          nada depende de rede, e a trilha funciona no perfil Privado/Local. O que continua honesto
          dizer é que a cobertura NÃO é total — as palavras sem tradução conferida ficaram de fora
          em vez de entrarem adivinhadas, e por isso os níveis altos têm menos. */}
      <p className="text-[11px] text-ink-faint leading-relaxed">
        Nível e tradução vêm de listas públicas curadas, embutidas no app — nada é traduzido na
        hora. Palavra sem tradução conferida ficou de fora, então os níveis avançados têm menos.
      </p>

    </section>
  );
}
