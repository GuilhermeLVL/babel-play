import type { MinigameId, RoundReport } from '@core';
import { estrelasDaRodada, multiplicador, pontuarRodada, summarize } from '@core';
import { ArrowRight, Check, ChevronLeft, Flame, Heart, RotateCcw, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type NivelDoJogo, nivelSugerido, pontosComBonus } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { numero, t } from '../../../lib/i18n';
import { guardarNivelDoJogo, lerNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import type { DerivedProgress } from '../../../lib/progress';
import EspacoDeAnuncio from '../../anuncios/EspacoDeAnuncio';
import { nomeCurtoDoJogo, textosDoJogo, unidadeDoPlacar } from '../polimento/textos';
import HudDaRodada from './HudDaRodada';
import { nomeDoNivel } from './SeletorDeNivel';

/** A sugestão de nível entra 60 ms depois da tela de fim (`jogos4.js:143`). */
const ATRASO_DA_SUGESTAO = 60;

/** O título pelas estrelas (`jogos.js:313`). Função, e não tabela, para o `t()` ver cada frase. */
function tituloDoFim(estrelas: 0 | 1 | 2 | 3): string {
  if (estrelas === 3) return t('Rodada perfeita');
  if (estrelas === 2) return t('Boa rodada');
  if (estrelas === 1) return t('Rodada concluída');
  return t('Não foi desta vez');
}

interface FimDaRodadaProps {
  report: RoundReport;
  /** Quantos itens a rodada tinha (o "8 de 8 bolas" do placar). */
  total: number;
  progress?: DerivedProgress;
  /** Com `falhou`, a tela diz que nada foi creditado em vez de anunciar o XP que não entrou. */
  gravacao?: 'pendente' | 'ok' | 'falhou';
  /** O jogo seguinte que dá para abrir agora; `null` quando não há outro com material. */
  proximo: MinigameId | null;
  aoProximo: (jogo: MinigameId) => void;
  aoJogarDeNovo: () => void;
  aoVoltar: () => void;
}

/**
 * A TELA DE FIM DE RODADA — porte de `pjFim` (`jogos.js:296-328`) e da sugestão de nível
 * (`jogos4.js:138-153`). Mora DENTRO do palco, no lugar do tabuleiro, com o cabeçalho e o placar da
 * rodada ainda na tela (`CascaDaRodada` com `acabou`), como no protótipo.
 *
 * A aparência é a do protótipo; os números são os da rodada de verdade:
 *   - acertos, tempo, pontos e melhor combo saem do relatório (os pontos somam o bônus do Difícil);
 *   - as estrelas são as da régua do app (`estrelasDaRodada`), a mesma do mapa de fases;
 *   - o XP é o que o servidor credita por esta rodada, e a barra é a do nível da conta.
 *
 * O que a tela de antes tinha e o protótipo não mostra saiu daqui (raspadinha, recorde, maestria,
 * resumo dos erros, ranking, trocar mantendo o combo, próxima recompensa). Gravar a rodada e a nota de
 * revisão não dependem desta tela: acontecem em `Play.tsx`, quando o jogo entrega o relatório.
 */
export default function FimDaRodada({
  report,
  total,
  progress,
  gravacao = 'ok',
  proximo,
  aoProximo,
  aoJogarDeNovo,
  aoVoltar,
}: FimDaRodadaProps) {
  const jogo = report.gameId;
  const resumo = summarize(report);
  const estrelas = estrelasDaRodada(resumo.precisao);
  const erros = resumo.total - resumo.acertos;
  const segundos = Math.max(0, Math.round((report.durationMs ?? 0) / 1000));
  const placar = pontuarRodada(jogo, report.items);
  /* O nível em que a rodada FOI jogada: lido uma vez, para a oferta não mudar depois de aceita. */
  const [nivel] = useState<NivelDoJogo>(() => lerNivelDoJogo(jogo));
  const pontos = pontosComBonus(jogo, nivel, report.score, resumo.acertos);
  const naoCreditou = gravacao === 'falhou';
  const feitos = Math.min(report.items.length, total);
  const unidade = unidadeDoPlacar(jogo);
  /* O texto é do protótipo (fixo no repositório), com a marcação simples que ele traz. */
  const instr = textosDoJogo(jogo)?.instr;

  const fimRef = useRef<HTMLDivElement | null>(null);
  /* O som e a festa do fim (`jogos.js:323-326`), pelo motor do app: três estrelas soltam a finalização
     equipada, duas o confete, e menos que isso fica discreto. Uma vez por rodada. */
  useEffect(() => {
    celebrar({ tipo: 'rodada', estrelas, jogo, el: fimRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a festa é da rodada que acabou de chegar
  }, [report]);

  /* A barra de XP enche do que havia para o que há (`jogos.js:319-322`; a transição de 1,2 s é do CSS). */
  const fatiaDaRodada = progress?.available && progress.xpForLevel ? (resumo.xp / progress.xpForLevel) * 100 : 0;
  const [cheia, setCheia] = useState(false);
  useEffect(() => {
    const quadro = requestAnimationFrame(() => setCheia(true));
    return () => cancelAnimationFrame(quadro);
  }, []);
  const larguraDoXp = progress?.available
    ? cheia || naoCreditou
      ? progress.levelPct
      : Math.max(0, progress.levelPct - fatiaDaRodada)
    : 0;

  /* A SUGESTÃO DE NÍVEL: desce quem acertou menos da metade, sobe quem não errou (`jogos4.js:146-151`). */
  const para = nivelSugerido(jogo, nivel, resumo.acertos, erros);
  const [comSugestao, setComSugestao] = useState(false);
  useEffect(() => {
    const espera = window.setTimeout(() => setComSugestao(true), ATRASO_DA_SUGESTAO);
    return () => window.clearTimeout(espera);
  }, []);
  const sobe = para === 'dificil' || (para === 'medio' && nivel === 'facil');

  return (
    <>
      <HudDaRodada
        pontos={report.score}
        sequencia={placar.sequenciaFinal}
        acertos={resumo.acertos}
        rotulo={`${feitos} de ${total} ${unidade}`}
        progresso={total ? feitos / total : 1}
      />
      {/* A instrução continua no palco, escondida pelo `.pj-acabou` (`jogos.css:212`). */}
      {instr && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: instr }} />}
      <div className="pj-miolo">
        <div ref={fimRef} className="fim" data-fim-da-rodada={jogo}>
          <span className="label-mono">{t('Rodada concluída · {jogo}', { jogo: nomeCurtoDoJogo(jogo) })}</span>
          <h2>{tituloDoFim(estrelas)}</h2>
          <div className="estrelas-fim" role="img" aria-label={t('{n} de 3 estrelas', { n: estrelas })}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < estrelas ? 'on' : ''} style={{ ['--i' as string]: i }}>
                <Star data-pj-i="" aria-hidden />
              </span>
            ))}
          </div>
          <div className="fim-numeros">
            <div style={{ ['--i' as string]: 0 }}>
              <small>{t('Acertos')}</small>
              <b>{t('{a} de {b}', { a: resumo.acertos, b: Math.max(resumo.total, resumo.acertos) })}</b>
            </div>
            <div style={{ ['--i' as string]: 1 }}>
              <small>{t('Tempo')}</small>
              <b>
                {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
              </b>
            </div>
            <div style={{ ['--i' as string]: 2 }}>
              <small>{t('Pontos')}</small>
              <b>{pontos}</b>
            </div>
            <div style={{ ['--i' as string]: 3 }}>
              <small>{t('Melhor combo')}</small>
              <b>×{multiplicador(placar.melhorSequencia)}</b>
            </div>
          </div>
          {estrelas === 3 && (
            <div className="carimbo">
              <Check data-pj-i="" aria-hidden /> {t('sem nenhum erro')}
            </div>
          )}
          {naoCreditou ? (
            <div className="xp-fim" data-rodada-nao-creditada role="status">
              <div className="entre">
                <b>{t('Não foi possível salvar — nada foi creditado')}</b>
              </div>
            </div>
          ) : (
            <div className="xp-fim" data-xp-da-rodada={resumo.xp}>
              <div className="entre">
                <b>{t('+{n} XP', { n: resumo.xp })}</b>
                {progress?.available && (
                  <span className="mut">
                    {t('Nível {n} · {a} de {b}', {
                      n: progress.level,
                      a: numero(progress.xpIntoLevel),
                      b: numero(progress.xpForLevel),
                    })}
                  </span>
                )}
              </div>
              <div
                className="hud-progresso"
                role="progressbar"
                aria-label={t('XP do nível')}
                aria-valuenow={Math.round(progress?.available ? progress.levelPct : 0)}
                aria-valuemax={100}
              >
                <span style={{ width: `${larguraDoXp}%` }} />
              </div>
            </div>
          )}
          {/* OS ESPAÇOS DE ANÚNCIO DO FIM DE RODADA (flag `anuncios`, desligada de fábrica; sem provedor não
              desenham nada): o premiado, que é escolha, logo abaixo do XP; e o bloco nativo ABAIXO dos
              botões, longe do "Próximo jogo" (`plantarFim`, `anuncios.js:234-258` do protótipo). */}
          <EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />
          <div className="pj-fim-acoes">
            {para && comSugestao && (
              <button
                type="button"
                className="btn btn-outline pj-sugere"
                data-pj="trocar-nivel"
                data-n={para}
                onClick={() => {
                  /* Grava o nível deste jogo e recomeça (`jogos4.js:258`). */
                  guardarNivelDoJogo(jogo, para);
                  aoJogarDeNovo();
                }}
              >
                {sobe ? <Flame data-pj-i="" aria-hidden /> : <Heart data-pj-i="" aria-hidden />}{' '}
                {sobe
                  ? t('Foi tranquilo? Jogar no {nivel}', { nivel: nomeDoNivel(para) })
                  : t('Ficou puxado? Jogar no {nivel}', { nivel: nomeDoNivel(para) })}
              </button>
            )}
            {proximo && (
              <button
                type="button"
                className="btn btn-solid"
                data-pj="proximo"
                data-id={proximo}
                onClick={() => aoProximo(proximo)}
              >
                {t('Próximo jogo: {nome}', { nome: nomeCurtoDoJogo(proximo) })} <ArrowRight data-pj-i="" aria-hidden />
              </button>
            )}
            <button type="button" className="btn btn-outline" data-acao="recomecar" onClick={aoJogarDeNovo}>
              <RotateCcw data-pj-i="" aria-hidden /> {t('Jogar de novo')}
            </button>
            <button type="button" className="btn btn-outline" data-pj="jogos" onClick={aoVoltar}>
              <ChevronLeft data-pj-i="" aria-hidden /> {t('Voltar aos jogos')}
            </button>
          </div>
          <EspacoDeAnuncio espaco="fim-bloco" formato="nativo" />
        </div>
      </div>
    </>
  );
}
