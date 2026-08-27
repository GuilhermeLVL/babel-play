import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Play, RotateCcw, Flame, Trophy, Sprout } from 'lucide-react';
import type { RoundReport, ResumoDaSequencia } from '@core';
import { summarize } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, pontosDoElemento } from '../../lib/juice';
import { burstFromElement } from '../../lib/effects';

/**
 * RASPADINHA — e, agora, a EMENDA para a próxima rodada.
 *
 * Ela NÃO avalia nada, e isso é uma decisão, não uma limitação: o resultado já foi decidido pelo
 * jogo. A raspadinha só revela o que a pessoa ganhou. Colocar a recompensa atrás de um gesto
 * físico (raspar) é o que transforma um número que aparece na tela em algo que se conquista —
 * e por isso ela vem DEPOIS da resposta, nunca no lugar dela.
 *
 * Implementada em canvas com `destination-out`: a camada de cima é apagada onde o dedo passa.
 * Ao descobrir ~45% da área, o resto é revelado sozinho — ninguém quer raspar cada pixel.
 *
 * O QUE MUDOU AQUI. Esta tela tinha UM botão, e ele voltava para a grade de jogos. No perfil
 * infantil ele dizia "Jogar de novo" e mentia: devolvia à grade igual aos outros, e para jogar
 * outra vez era preciso reencontrar a carta e passar pela antessala de novo. Agora ela é o ponto
 * onde a corrente continua — placar somado, combo ainda vivo, recorde à vista, e as duas ações
 * que já existiam na antessala ("outras" e "estas mesmas") ao alcance do polegar.
 */

interface ScratchRewardProps {
  report: RoundReport;
  ageProfile: AgeProfileType;
  /** A corrente em curso — `null` na primeira rodada. */
  sequencia: ResumoDaSequencia | null;
  /** O recorde deste jogo nesta fonte, para virar alvo (ou ser quebrado). */
  recorde: number | null;
  /** Mais uma rodada, com itens novos. */
  onContinuar: () => void;
  /** Estas mesmas de novo. `null` quando a rodada não deixou `itemRef` para remontar. */
  onRepetir: (() => void) | null;
  onDone: () => void;
  /** Acabou o material elegível: não há "mais uma" honesta a oferecer. */
  semMaterial?: boolean;
  /**
   * O SINK DAS SEEDS: re-sorteia a rodada SEM quebrar o combo.
   *
   * Emendar normalmente já dá palavras novas — o que se compra aqui é sair de um lote que não
   * agradou (difícil demais, ou repetido) mantendo a sequência viva. É a decisão que dá tensão à
   * moeda: guardar seeds ou pagar para não perder o ×4. `null` quando não há saldo.
   */
  onPularVez: (() => void) | null;
  custoPular: number;
  saldoSeeds: number;
}

/** Fração da área raspada a partir da qual revelamos o resto automaticamente. */
const LIMIAR_REVELACAO = 0.45;

export default function ScratchReward({
  report, ageProfile, sequencia, recorde, onContinuar, onRepetir, onDone, semMaterial,
  onPularVez, custoPular, saldoSeeds,
}: ScratchRewardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const placarRef = useRef<HTMLDivElement | null>(null);
  const [revelado, setRevelado] = useState(false);
  const raspandoRef = useRef(false);
  const resumo = summarize(report);
  /* Recorde batido = a corrente inteira passou do melhor anterior. Compara com `>` e não `>=`
     para empatar não disparar a festa toda vez que alguém repete a mesma pontuação. */
  const bateuRecorde = !!sequencia && recorde !== null && sequencia.pontos > recorde;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || revelado) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A camada que esconde usa os tokens do tema — a raspadinha não pode ser cinza fixo num app
    // com seis temas (foi exatamente esse tipo de cor fixa que quebrava os efeitos antes).
    const css = getComputedStyle(document.documentElement);
    const tinta = css.getPropertyValue('--accent-soft').trim() || '#DDD';
    const opaca = css.getPropertyValue('--surface').trim() || '#DDD';
    const borda = css.getPropertyValue('--accent').trim() || '#888';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* DUAS DEMÃOS, e a primeira é o conserto de um defeito real.
       `--accent-soft` é `color-mix(… 15%, transparent)`, ou seja, 85% TRANSPARENTE. Pintar a
       tampa só com ele deixava o prêmio aparecer por baixo: o "+12 XP" e o "RASPE AQUI" ficavam
       um em cima do outro e a raspadinha não escondia nada. A demão opaca de `--surface` vem
       primeiro e a tinta do acento por cima, para a tampa tapar de verdade e ainda ter cor. */
    ctx.fillStyle = opaca;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = tinta;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = borda;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ageProfile === 'kids' ? 'RASPE AQUI' : 'Raspe para ver', rect.width / 2, rect.height / 2);
    // Uma pista do gesto: três riscos, como o metal já arranhado de uma raspadinha de verdade.
    ctx.strokeStyle = borda;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const y = rect.height * (0.28 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(rect.width * 0.18, y);
      ctx.lineTo(rect.width * 0.82, y - 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [revelado, ageProfile]);

  /** Apaga a camada no ponto e mede o quanto já foi descoberto. */
  const raspar = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || revelado) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 22, 0, Math.PI * 2);
    ctx.fill();

    // Amostragem esparsa (1 em cada 32 pixels): medir todos a cada movimento travaria o dedo.
    const dados = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentes = 0;
    let amostras = 0;
    for (let i = 3; i < dados.length; i += 4 * 32) {
      amostras++;
      if (dados[i] === 0) transparentes++;
    }
    if (amostras && transparentes / amostras >= LIMIAR_REVELACAO) revelar();
  };

  const revelar = () => {
    if (revelado) return;
    setRevelado(true);
    // O clímax da rodada, e o único lugar do app onde o exagero é justificado — mas ainda
    // escalado pelo resultado: 100% ganha a chuva de confete, um resultado bom ganha confete
    // pontual, e um resultado fraco ganha o mínimo. Festa igual para todo resultado ensinaria
    // que o resultado não importa.
    // Dentro de uma corrente, a rodada perfeita é mais rara e vale a festa maior: fechar 3
    // rodadas seguidas sem erro não pode comemorar igual a fechar a primeira.
    const perfeita = resumo.precisao === 100;
    const emCorrente = (sequencia?.rodadas ?? 0) >= 3;
    const tipo = perfeita && emCorrente ? 'rodadaPerfeita'
      : perfeita || resumo.precisao >= 60 ? 'rodadaBoa'
      : 'acerto';
    comemorar(tipo, canvasRef.current, { tremer: perfeita });
    // O número da recompensa sobe de onde ela foi raspada — o gesto e o ganho no mesmo lugar.
    pontosDoElemento('+' + resumo.xp + ' XP', canvasRef.current, 'bom');
    // O recorde é o único acontecimento aqui que não é sobre ESTA rodada — ganha o próprio
    // estouro, no placar (onde está o número que ele quebrou), e não no cartão raspado.
    if (bateuRecorde) burstFromElement(placarRef.current, 'record');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 animate-in fade-in duration-200">
      <div className="text-center">
        <p className="label-mono">{ageProfile === 'senior' ? 'Fim da rodada' : 'Rodada concluída'}</p>
        <h2 className="font-display font-black text-2xl text-ink mt-1">
          {resumo.acertos} de {resumo.total}
        </h2>
        <p className="text-[13px] text-ink-muted mt-0.5">{resumo.precisao}% de acerto</p>
      </div>

      {/* A recompensa fica embaixo; o canvas por cima é a camada que se raspa.
          O cartão é generoso (320×144) porque é raspado com o DEDO: num alvo de 256×112 o dedo
          cobre metade da área e a pessoa não vê o que está descobrindo. */}
      <div className="relative w-80 h-36 rounded-2xl overflow-hidden border border-border-subtle shadow-card">
        <div className="absolute inset-0 bg-surface flex flex-col items-center justify-center gap-1">
          <span className="flex items-center gap-1.5 font-display font-black text-2xl text-accent-ink">
            <Sparkles className="w-5 h-5" aria-hidden /> +{resumo.xp} XP
          </span>
          <span className="text-[11px] text-ink-muted">
            {ageProfile === 'kids' ? 'foi pro seu nível!' : 'somados ao seu perfil'}
          </span>
        </div>
        {!revelado && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-pointer touch-none"
            aria-label="Raspe para revelar a recompensa"
            onPointerDown={(e) => { raspandoRef.current = true; raspar(e.clientX, e.clientY); }}
            onPointerMove={(e) => { if (raspandoRef.current) raspar(e.clientX, e.clientY); }}
            onPointerUp={() => { raspandoRef.current = false; }}
            onPointerLeave={() => { raspandoRef.current = false; }}
          />
        )}
      </div>

      {/* Saída por teclado / para quem não quer raspar — acessibilidade antes de espetáculo. */}
      {!revelado && (
        <button onClick={revelar} className="text-[11px] text-ink-faint hover:text-accent underline cursor-pointer">
          revelar sem raspar
        </button>
      )}

      {revelado && (
        <div className="flex flex-col items-center gap-4 animate-in fade-in w-full max-w-md">

          {/* O PLACAR DA CORRENTE — só a partir da segunda rodada. Na primeira ele diria
              "1 rodada · 60 pts", que é a mesma informação de cima com outra roupa. */}
          {sequencia && sequencia.rodadas > 1 && (
            <div ref={placarRef} className="card-panel bg-surface w-full p-3.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]">
              <span className="text-ink-muted">
                <b className="text-ink font-display">{sequencia.rodadas}</b> rodadas seguidas
              </span>
              <span className="text-ink-muted">
                <b className="text-ink font-display">{sequencia.pontos}</b> pontos
              </span>
              <span className="text-ink-muted">{sequencia.precisao}% no total</span>
              {bateuRecorde ? (
                <span className="badge-tag acc shrink-0 flex items-center gap-1">
                  <Trophy className="w-3 h-3" aria-hidden /> RECORDE
                </span>
              ) : recorde !== null && recorde > 0 && (
                <span className="text-[11px] text-ink-faint">seu recorde: {recorde}</span>
              )}
            </div>
          )}

          {/* O COMBO VIVO é o gancho: ele diz o que se PERDE ao sair agora, e é a única coisa
              nesta tela que fala sobre a próxima rodada em vez da que acabou. */}
          {sequencia && sequencia.combo >= 3 && (
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-accent-ink">
              <Flame className="w-4 h-4" aria-hidden />
              combo ×{sequencia.combo} continua na próxima
            </p>
          )}

          <div className="flex flex-col items-center gap-2 w-full">
            {/* Emendar é a ação principal e tem o peso visual disso. Quando não há mais material
                elegível, o botão SOME em vez de ficar inerte, botão que não faz nada ensina que
                a tela está quebrada (foi o que aconteceu com a dica que cobria os controles). */}
            {!semMaterial && (
              <button
                onClick={onContinuar}
                className="w-full py-3 px-6 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[14px] shadow-btn transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" aria-hidden />
                {ageProfile === 'kids' ? 'Bora de novo!' : 'Mais uma'}
                <span className="font-semibold opacity-80">· palavras novas</span>
              </button>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              {onRepetir && (
                <button onClick={onRepetir} className="btn-outline">
                  <RotateCcw className="w-4 h-4" aria-hidden />
                  {ageProfile === 'senior' ? 'Repetir as mesmas palavras' : 'De novo, estas'}
                </button>
              )}
              <button
                onClick={onDone}
                className="py-2 px-4 text-[12px] font-semibold text-ink-muted hover:text-ink rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
              >
                Voltar aos jogos
              </button>
            </div>

            {/* O SINK — e ele só existe quando há combo a proteger.
                Sem sequência viva não há nada a comprar: "mais uma" já traz palavras novas de
                graça. O que se paga aqui é sair de um lote ruim SEM zerar o ×N. Oferecer isto com
                combo 1 seria vender o que já é gratuito. */}
            {sequencia && sequencia.combo >= 3 && (
              onPularVez ? (
                <button
                  onClick={onPularVez}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted hover:text-accent-ink transition-colors cursor-pointer border border-border-subtle hover:border-accent rounded-lg px-3 py-1.5"
                  title={`Troca as palavras e mantém o combo ×${sequencia.combo}. Custa ${custoPular} seeds.`}
                >
                  <Sprout className="w-3.5 h-3.5" aria-hidden />
                  Trocar mantendo o combo · {custoPular} seeds
                </button>
              ) : (
                /* Saldo curto: o botão não some, fica DESLIGADO com o motivo. Sumir esconderia
                   que a opção existe, e é ela que dá sentido a juntar seeds. */
                <p className="text-[11px] text-ink-faint">
                  trocar mantendo o combo custa {custoPular} seeds, você tem {saldoSeeds}
                </p>
              )
            )}
          </div>

          {semMaterial && (
            <p className="text-[12px] text-ink-muted text-center max-w-[42ch] leading-snug">
              Acabaram as palavras elegíveis desta fonte por agora. Volte aos jogos para trocar de
              fonte, ou repita estas mesmas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
