import type { MinigameId, ResumoDaSequencia, RoundReport } from '@core';
import { estrelasDaRodada, ganhoDaRodada, multiplicador, pontuarRodada, summarize } from '@core';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  List,
  PartyPopper,
  RotateCcw,
  Sparkles,
  Sprout,
  Trophy,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { burstFromElement } from '../../lib/effects';
import { proximaRecompensa } from '../../lib/galeria/progressao';
import { comemorar, contarAte, flashDeTela, pontosDoElemento, tremor } from '../../lib/juice';
import type { AgeProfileType } from '../../lib/profile';
import type { DerivedProgress } from '../../lib/progress';
import { play } from '../../lib/soundFx';
import { Tela, TituloDeSecao } from '../ui';
import { IconePixel } from '../views/play/IconesPixel';
import { unidadeDaRodada } from './casca/regras';

/**
 * FIM DA RODADA — estrelas, raspadinha e o que escapou, num cartão só (`T.resultado` do protótipo
 * aprovado, com as camadas das rodadas 10 e 11).
 *
 * Eram duas telas: a raspadinha (`ScratchReward`) e, atrás de um botão, o resumo dos erros
 * (`ResumoDaRodada`). O protótipo junta as duas: o cartão `.fim` com as estrelas que caem, os
 * quatro números (pontos que sobem, precisão, tempo, melhor sequência), o carimbo de recorde, a
 * raspadinha (revela sozinha a 45% raspado) e, depois de revelar, o nível com a barra de XP, as
 * ações ("Mais uma", "De novo", "Ver o que escapou", "Voltar aos jogos"); "Ver o que escapou" abre
 * o resumo logo abaixo, na mesma tela.
 *
 * TUDO AQUI É DADO REAL. Os pontos são o `score` que o jogo mandou; a precisão, o XP e as estrelas
 * saem da mesma régua do mapa de fases (`summarize`, `estrelasDaRodada`); a melhor sequência é a
 * de `pontuarRodada`; o XP e as Seeds são os que o servidor vai creditar por esta rodada
 * (`ganhoDaRodada`); o nível e a barra vêm do perfil. O que a raspadinha do app tinha e o
 * protótipo não mostra continua: a corrente de rodadas, o combo que atravessa, "trocar mantendo o
 * combo" (o gasto de Seeds), o aviso de material esgotado e a próxima recompensa.
 */

/** Um item da rodada com o que o baralho sabe dele — o que o resumo lista. */
export interface ItemDaRodada {
  itemRef?: string;
  cardId?: string | null;
  correct: boolean;
  attempts: number;
  hinted?: boolean;
  /** Tradução, quando o item é uma palavra do baralho. */
  back?: string | null;
  cefrLevel?: string | null;
  cefrSource?: string | null;
  /** Quantas vezes o usuário já encontrou esta palavra. */
  occurrences?: number | null;
}

interface ResultadoDaRodadaProps {
  report: RoundReport;
  /** O nome do jogo (já no perfil da pessoa). */
  jogo: string;
  ageProfile: AgeProfileType;
  /** A corrente em curso — `null` na primeira rodada. */
  sequencia: ResumoDaSequencia | null;
  /** O recorde deste jogo nesta fonte, para virar alvo (ou ser quebrado). */
  recorde: number | null;
  /** Os itens da rodada com tradução e nível — o resumo "o que aconteceu". */
  itens: ItemDaRodada[];
  progress?: DerivedProgress;
  /** Mais uma rodada, com itens novos. */
  onContinuar: () => void;
  /** Estas mesmas de novo. `null` quando a rodada não deixou `itemRef` para remontar. */
  onRepetir: (() => void) | null;
  /** Refaz só as erradas (volta pela antessala). */
  onRefazerErradas: (erradas: ItemDaRodada[]) => void;
  onDone: () => void;
  /** Acabou o material elegível: não há "mais uma" honesta a oferecer. */
  semMaterial?: boolean;
  /** O gasto das Seeds: trocar as palavras sem quebrar o combo. `null` quando não há saldo. */
  onPularVez: (() => void) | null;
  custoPular: number;
  saldoSeeds: number;
  /** Abre Personalizar › Progressão. */
  onVerProgressao?: () => void;
}

/** Fração raspada a partir da qual o resto é revelado sozinho (a do protótipo). */
const LIMIAR_REVELACAO = 0.45;

export default function ResultadoDaRodada({
  report,
  jogo,
  ageProfile,
  sequencia,
  recorde,
  itens,
  progress,
  onContinuar,
  onRepetir,
  onRefazerErradas,
  onDone,
  semMaterial,
  onPularVez,
  custoPular,
  saldoSeeds,
  onVerProgressao,
}: ResultadoDaRodadaProps) {
  const resumo = summarize(report);
  const estrelas = estrelasDaRodada(resumo.precisao);
  const segundos = Math.max(0, Math.round((report.durationMs ?? 0) / 1000));
  const melhorSequencia = pontuarRodada(report.gameId, report.items).melhorSequencia;
  /* XP (`resumo.xp`) e Seeds saem de `ganhoDaRodada`: a mesma conta que o perfil dos dois servidores
     faz com as linhas gravadas (`tests/contratos/ganho-da-rodada`). */
  const seeds = ganhoDaRodada(report).seeds;
  const unidade =
    report.gameId === 'memory' ? 'pares' : report.gameId === 'blitz' ? 'certas' : unidadeDaRodada(report.gameId);
  /* Recorde batido = a corrente inteira passou do melhor anterior (`>`: empatar não é festa). */
  const pontosDaCorrente = sequencia?.pontos ?? report.score;
  const bateuRecorde = recorde !== null && recorde > 0 && pontosDaCorrente > recorde;
  const proxima = progress?.available ? proximaRecompensa(progress.level) : null;

  const [revelado, setRevelado] = useState(false);
  const [resumoAberto, setResumoAberto] = useState(false);
  const [acertosAbertos, setAcertosAbertos] = useState(false);
  const fimRef = useRef<HTMLElement | null>(null);
  const pontosRef = useRef<HTMLElement | null>(null);
  const carimboRef = useRef<HTMLSpanElement | null>(null);
  const raspaRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raspouRef = useRef(false);

  /* A SEQUÊNCIA DO PÓS-JOGO, uma vez (`posResultado`): as estrelas caem com um toque e um tranco
     cada, os pontos sobem e o recorde ganha o flash. Com movimento reduzido, `lib/juice` zera tudo. */
  useEffect(() => {
    const timers: number[] = [];
    const on = fimRef.current?.querySelectorAll<HTMLElement>('.estrelas-fim span.on') ?? [];
    on.forEach((s, i) =>
      timers.push(
        window.setTimeout(
          () => {
            play('success', { transpose: i * 4 });
            burstFromElement(s, 'xp');
            tremor(fimRef.current, 3 + i * 2);
          },
          650 + i * 320,
        ),
      ),
    );
    timers.push(window.setTimeout(() => void contarAte(pontosRef.current, report.score, { dur: 900 }), 1200));
    if (bateuRecorde)
      timers.push(
        window.setTimeout(() => {
          flashDeTela();
          burstFromElement(carimboRef.current, 'record');
        }, 1700),
      );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a festa é da rodada que acabou de chegar, uma vez
  }, [report]);

  const revelar = () => {
    if (revelado) return;
    setRevelado(true);
    /* O clímax, escalado pelo resultado: 100% dentro de uma corrente ganha a festa maior, um
       resultado bom ganha confete, um fraco ganha o mínimo. Festa igual ensinaria que tanto faz. */
    const perfeita = resumo.precisao === 100;
    const emCorrente = (sequencia?.rodadas ?? 0) >= 3;
    const tipo = perfeita && emCorrente ? 'rodadaPerfeita' : perfeita || resumo.precisao >= 60 ? 'rodadaBoa' : 'acerto';
    comemorar(tipo, raspaRef.current, { tremer: perfeita });
    pontosDoElemento(`+${resumo.xp} XP`, raspaRef.current, 'bom');
  };

  /* A TAMPA DA RASPADINHA: listras nos tokens do tema e a pílula "✦ Raspe aqui", desenhadas no
     canvas (o `montarRaspadinha` do protótipo). O dedo apaga com `destination-out`. */
  useEffect(() => {
    const cv = canvasRef.current;
    const alvo = raspaRef.current;
    if (!cv || !alvo || revelado) return;
    const cx = cv.getContext('2d');
    if (!cx) return;
    const r = alvo.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * d);
    cv.height = Math.round(r.height * d);
    cx.setTransform(d, 0, 0, d, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const tok = (n: string, reserva: string) => css.getPropertyValue(n).trim() || reserva;
    cx.fillStyle = tok('--surface-sunken', '#ddd');
    cx.fillRect(0, 0, r.width, r.height);
    cx.fillStyle = tok('--surface-hover', '#eee');
    for (let x = -r.height; x < r.width; x += 20) {
      cx.beginPath();
      cx.moveTo(x, 0);
      cx.lineTo(x + 10, 0);
      cx.lineTo(x + 10 + r.height, r.height);
      cx.lineTo(x + r.height, r.height);
      cx.fill();
    }
    cx.fillStyle = tok('--surface', '#fff');
    cx.beginPath();
    cx.roundRect?.(r.width / 2 - 64, r.height / 2 - 17, 128, 34, 17);
    cx.fill();
    cx.fillStyle = tok('--ink-muted', '#666');
    cx.font = '800 14px Archivo, system-ui';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('✦ Raspe aqui', r.width / 2, r.height / 2);
  }, [revelado]);

  const raspandoRef = useRef(false);
  const tracos = useRef(0);
  const raspar = (clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    const cx = cv?.getContext('2d');
    if (!cv || !cx || revelado) return;
    const q = cv.getBoundingClientRect();
    cx.globalCompositeOperation = 'destination-out';
    cx.beginPath();
    cx.arc(clientX - q.left, clientY - q.top, 20, 0, Math.PI * 2);
    cx.fill();
    tracos.current++;
    if (tracos.current % 3 === 0) play('tick');
    if (tracos.current % 8 !== 0) return;
    // Amostragem esparsa: medir todos os pixels a cada movimento travaria o dedo.
    const px = cx.getImageData(0, 0, cv.width, cv.height).data;
    let vazio = 0,
      tot = 0;
    for (let i = 3; i < px.length; i += 4 * 40) {
      tot++;
      if (px[i] === 0) vazio++;
    }
    if (tot && vazio / tot >= LIMIAR_REVELACAO) {
      raspandoRef.current = false;
      revelar();
    }
  };

  const erradas = itens.filter((i) => !i.correct);
  const certas = itens.filter((i) => i.correct);
  const nRodadas = sequencia?.rodadas ?? 1;

  return (
    <Tela largura="estreita">
      <section ref={fimRef} className="cartao fim entra" id="fim">
        <div className="linha" style={{ justifyContent: 'center', gap: 10 }}>
          <span className="mini-arte" aria-hidden>
            <IconePixel id={report.gameId as MinigameId} className="" />
          </span>
          <span className="label-mono" style={{ color: 'var(--accent-ink)' }}>
            {ageProfile === 'senior' ? 'Fim da rodada' : 'Rodada concluída'} · {jogo.split(/[:(]/)[0].trim()}
          </span>
        </div>
        <div className="estrelas-fim" aria-label={`${estrelas} de 3 estrelas`} title={`${resumo.precisao}% de acerto`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < estrelas ? 'on' : ''} style={{ ['--i' as string]: i }} aria-hidden>
              ★
            </span>
          ))}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>
          {resumo.acertos} de {resumo.total} {unidade}
        </h1>
        <div className="fim-numeros">
          {(
            [
              [
                'Pontos',
                <b key="p" ref={pontosRef} className="tn">
                  0
                </b>,
              ],
              [
                'Precisão',
                <b key="c" className="tn">
                  {resumo.precisao}%
                </b>,
              ],
              [
                'Tempo',
                <b key="t" className="tn">
                  {segundos}s
                </b>,
              ],
              [
                'Melhor sequência',
                <b key="s" className="tn">
                  {melhorSequencia}
                </b>,
              ],
            ] as const
          ).map(([rotulo, valor], i) => (
            <div key={rotulo} style={{ ['--i' as string]: i }}>
              <small>{rotulo}</small>
              {valor}
            </div>
          ))}
        </div>
        {bateuRecorde ? (
          <>
            <span ref={carimboRef} className="carimbo">
              <Trophy aria-hidden /> Novo recorde
            </span>
            <p className="mut" style={{ fontSize: 12, marginTop: 6 }}>
              antes: {recorde}
            </p>
          </>
        ) : (
          recorde !== null &&
          recorde > 0 && (
            <p className="mut" style={{ fontSize: 12.5 }}>
              seu recorde: {recorde}
              {pontosDaCorrente < recorde && ` · faltam ${recorde - pontosDaCorrente} pts`}
            </p>
          )
        )}

        <div
          ref={raspaRef}
          className={`raspa ${revelado ? 'revelada' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={
            revelado ? `Recompensa revelada: mais ${resumo.xp} XP e ${seeds} seeds` : 'Raspe para revelar a recompensa'
          }
          onClick={() => {
            if (!raspouRef.current) revelar();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              revelar();
            }
          }}
        >
          <div className="premio">
            <b>+{resumo.xp} XP</b>
            {seeds > 0 && (
              <span className="badge ok">
                <Sprout aria-hidden /> +{seeds} Seeds
              </span>
            )}
          </div>
          <div className="capa-raspa" aria-hidden>
            <span>
              <Sparkles aria-hidden /> Raspe aqui
            </span>
          </div>
          {!revelado && (
            <canvas
              ref={canvasRef}
              aria-hidden
              onPointerDown={(e) => {
                raspandoRef.current = true;
                raspouRef.current = true;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                raspar(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (raspandoRef.current) raspar(e.clientX, e.clientY);
              }}
              onPointerUp={() => {
                raspandoRef.current = false;
              }}
            />
          )}
        </div>
        {!revelado && (
          <button type="button" className="link" onClick={revelar}>
            Revelar sem raspar
          </button>
        )}

        {revelado && (
          <div className="pilha entra" style={{ marginTop: 16 }}>
            {progress?.available && (
              <div className="xp-fim">
                <div className="entre">
                  <b>Nível {progress.level}</b>
                  <span className="mut tn">
                    {progress.xpIntoLevel} de {progress.xpForLevel} XP
                  </span>
                </div>
                <div
                  className="hud-progresso"
                  role="progressbar"
                  aria-label="XP do nível"
                  aria-valuenow={progress.xpIntoLevel}
                  aria-valuemax={progress.xpForLevel}
                >
                  <span style={{ width: `${progress.levelPct}%` }} />
                </div>
              </div>
            )}
            <p className="mut tn" style={{ fontSize: 13 }}>
              {nRodadas} {nRodadas > 1 ? 'rodadas seguidas' : 'rodada seguida'} · multiplicador chegou a ×
              {multiplicador(melhorSequencia)}
              {sequencia && sequencia.combo >= 3 && ` · combo ×${sequencia.combo} continua na próxima`}
            </p>
            {!semMaterial && (
              <button type="button" className="btn btn-solid bloco" onClick={onContinuar}>
                <Sparkles aria-hidden /> {ageProfile === 'kids' ? 'Bora de novo!' : 'Mais uma'} · palavras novas
              </button>
            )}
            <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
              {onRepetir && (
                <button type="button" className="btn btn-outline" style={{ flex: '1 1 180px' }} onClick={onRepetir}>
                  <RotateCcw aria-hidden /> {estrelas < 3 ? 'De novo, pelas 3 estrelas' : 'De novo, estas'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: '1 1 180px' }}
                aria-expanded={resumoAberto}
                onClick={() => setResumoAberto((v) => !v)}
              >
                <List aria-hidden /> {ageProfile === 'kids' ? 'O que eu errei' : 'Ver o que escapou'}
              </button>
            </div>
            {/* O GASTO DAS SEEDS só existe com combo a proteger: sem sequência viva, "mais uma" já
                traz palavras novas de graça. Saldo curto: a opção fica dita, não some. */}
            {sequencia &&
              sequencia.combo >= 3 &&
              (onPularVez ? (
                <button
                  type="button"
                  className="btn btn-outline peq"
                  style={{ alignSelf: 'center' }}
                  onClick={onPularVez}
                  title={`Troca as palavras e mantém o combo ×${sequencia.combo}. Custa ${custoPular} seeds.`}
                >
                  <Sprout aria-hidden /> Trocar mantendo o combo · {custoPular} seeds
                </button>
              ) : (
                <p className="mut" style={{ fontSize: 12 }}>
                  trocar mantendo o combo custa {custoPular} seeds, você tem {saldoSeeds}
                </p>
              ))}
            {semMaterial && (
              <p className="mut" style={{ fontSize: 12.5 }}>
                Acabaram as palavras elegíveis desta fonte por agora. Volte aos jogos para trocar de fonte, ou repita
                estas mesmas.
              </p>
            )}
            <button type="button" className="link" onClick={onDone}>
              <ArrowLeft aria-hidden /> Voltar aos jogos
            </button>
            {proxima && (
              <p className="mut" style={{ fontSize: 12 }}>
                próxima recompensa: {proxima.destaque.nome} no nível {proxima.nivel}
                {onVerProgressao && (
                  <>
                    {' · '}
                    <button type="button" className="link" onClick={onVerProgressao}>
                      ver recompensas
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </section>

      {resumoAberto && (
        <section className="cartao p5 secao entra">
          <TituloDeSecao
            icone={List}
            titulo="O que aconteceu na rodada"
            direita={
              <span className="mut tn" style={{ fontSize: 12.5 }}>
                {resumo.acertos} acertos · {segundos}s · +{resumo.xp} XP
              </span>
            }
          />
          {erradas.length ? (
            <>
              <span className="label-mono">Errou ({erradas.length})</span>
              <ul className="lista-mapa">
                {erradas.map((i, n) => (
                  <li key={`${i.itemRef ?? ''}-${n}`}>
                    <div style={{ minWidth: 0 }}>
                      <b>{i.itemRef}</b>
                      <small className="mut">{i.back || 'sem tradução'}</small>
                    </div>
                    <span className="mut" style={{ fontSize: 12 }}>
                      {[
                        i.cefrLevel,
                        i.attempts > 1 ? `${i.attempts} tentativas` : null,
                        i.hinted ? 'com dica' : null,
                        'volta na revisão',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="badge warn">errei</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-solid"
                style={{ marginTop: 12 }}
                onClick={() => onRefazerErradas(erradas)}
              >
                <RotateCcw aria-hidden />{' '}
                {erradas.length === 1 ? 'Refazer só a errada' : `Refazer só as ${erradas.length} erradas`}
              </button>
            </>
          ) : (
            <p className="mut" style={{ fontSize: 13.5 }}>
              <PartyPopper aria-hidden style={{ width: 15, height: 15, verticalAlign: -3 }} /> Nenhum erro nesta rodada.
              {resumo.precisao >= 80 ? ' Pronto para subir para o difícil.' : ''}
            </p>
          )}
          {certas.length > 0 && (
            <>
              <button
                type="button"
                className="link"
                style={{ marginTop: 12 }}
                aria-expanded={acertosAbertos}
                onClick={() => setAcertosAbertos((v) => !v)}
              >
                {acertosAbertos ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />} Acertou ({certas.length})
              </button>
              {acertosAbertos && (
                <ul className="lista-mapa">
                  {certas.map((i, n) => (
                    <li key={`${i.itemRef ?? ''}-${n}`}>
                      <div style={{ minWidth: 0 }}>
                        <b>{i.itemRef}</b>
                        {i.back && <small className="mut">{i.back}</small>}
                      </div>
                      <span className="mut" style={{ fontSize: 12 }}>
                        {[i.cefrLevel, i.attempts <= 1 && !i.hinted ? 'de primeira' : null].filter(Boolean).join(' · ')}
                      </span>
                      <span className="badge ok">acertei</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </Tela>
  );
}
