import type { FalaComAudio, ItemOutcome, RodadaEscuta, RoundReport } from '@core';
import { scoreRound } from '@core';
import { Gauge, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { regrasDoJogo } from '../../core/minigames/regras';
import { celebrar } from '../../lib/comemoracao';
import { criarFalante } from '../../lib/falante';
import { t } from '../../lib/i18n';
import { useNivelDoJogo } from '../../lib/jogos/nivelDoJogo';
import { flutuar } from '../../lib/polimento/jogos';
import AjudasGerais from './casca/AjudasGerais';
import { useAtalhosDasAlternativas } from './casca/atalhos';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { usePlacarDaRodada } from './casca/HudDaRodada';
import { SemVozNoQuest, useVozNoJogo } from './noQuest';
import { textosDoJogo } from './polimento/textos';

/**
 * QUAL FOI A FALA? — a cena do protótipo (`jogos2.js:647-689`, `jogos.css:86-93`): o botão grande de
 * ouvir, "devagar" ao lado, a lista de falas parecidas e, depois da resposta, a tradução.
 *
 * As regras e os números são os do protótipo. O que é do app: as falas e as alternativas (as da sua
 * gravação ou da trilha), o som (o clipe da gravação ou a voz, por `lib/falante`) e a nota de cada fala.
 */

interface Props {
  rodadas: RodadaEscuta[];
  audioUrl: string;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Quanto a fala leva para soar, para o botão saber quando parou de tocar. */
const duracaoDaFala = (f: FalaComAudio, velocidade: number) =>
  (f.endMs > f.startMs ? Math.max(300, f.endMs - f.startMs) : Math.max(900, f.text.length * 90)) / velocidade;

/** A alternativa é a fala certa? Pela identidade; sem ela, pelo próprio objeto. */
const ehACertaDe = (rodada: RodadaEscuta, op: FalaComAudio) =>
  op === rodada.correta || (op.id != null && op.id === rodada.correta.id);

export default function EscutaDoPrototipo({ rodadas, audioUrl, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('escuta');
  const nivel = useNivelDoJogo('escuta');
  const regras = regrasDoJogo('escuta', nivel);
  const textos = textosDoJogo('escuta');

  const [i, setI] = useState(0);
  const [escolhida, setEscolhida] = useState<FalaComAudio | null>(null);
  const [tocando, setTocando] = useState(false);
  const [seq, setSeq] = useState(0);
  const [feitos, setFeitos] = useState(0);
  const [acabou, setAcabou] = useState(false);

  const rodada = rodadas[i] as RodadaEscuta | undefined;
  /* 3 alternativas no Fácil, 4 nos outros (`jogos2.js:665`): a certa fica, sai uma das erradas. */
  const opcoes = useMemo(() => {
    if (!rodada) return [];
    let sobra = Math.max(0, rodada.opcoes.length - regras.alternativas);
    return rodada.opcoes.filter((op) => ehACertaDe(rodada, op) || sobra-- <= 0);
  }, [rodada, regras.alternativas]);
  const ehACerta = (op: FalaComAudio) => !!rodada && ehACertaDe(rodada, op);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const trava = useRef(false);
  const comDica = useRef(false);
  const tocouRef = useRef(-1);
  const pararEm = useRef<number | null>(null);
  const inicioDaFala = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  /* No headset o som é o clipe da gravação ou, sem ela, a voz do site, que só lê alguns idiomas. Sem
     nenhum dos dois o botão de ouvir não aparece: a rodada segue pela tradução escrita. */
  const haVoz = useVozNoJogo(rodada?.correta.lang);
  const temSom = !!audioUrl || haVoz;
  const falante = useMemo(() => criarFalante(audioRef, audioUrl), [audioUrl]);

  /** `dizer` + `falando` (`jogos2.js:6-10`): o botão grande fica `.tocando` enquanto a fala soa. */
  const dizer = (devagar: boolean) => {
    if (!rodada || !falante.disponivel || !temSom) return;
    const velocidade = devagar ? 0.6 : 1;
    falante.ouvir(
      {
        texto: rodada.correta.text,
        lang: rodada.correta.lang ?? '',
        startMs: rodada.correta.startMs,
        endMs: rodada.correta.endMs,
      },
      velocidade,
    );
    setTocando(true);
    if (pararEm.current) window.clearTimeout(pararEm.current);
    pararEm.current = window.setTimeout(() => setTocando(false), duracaoDaFala(rodada.correta, velocidade));
  };
  /* `tocar` de `jogos2.js:660`: não toca com a jogada travada. */
  const tocar = (devagar: boolean) => {
    if (!trava.current) dizer(devagar);
  };

  /* A fala toca sozinha 350 ms depois de entrar (`jogos2.js:666`), uma vez por fala. */
  useEffect(() => {
    if (!rodada || !ativo || tocouRef.current === i) return;
    const x = window.setTimeout(() => {
      tocouRef.current = i;
      tocar(false);
    }, 350);
    return () => window.clearTimeout(x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, ativo]);
  useEffect(
    () => () => {
      esperas.current.forEach((x) => window.clearTimeout(x));
      if (pararEm.current) window.clearTimeout(pararEm.current);
      falante.parar();
    },
    [falante],
  );

  /* `prox` de `jogos2.js:661-667`. */
  const prox = () => {
    if (i + 1 >= rodadas.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'escuta',
          items: todos,
          score: scoreRound('escuta', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return;
    }
    trava.current = false;
    comDica.current = false;
    inicioDaFala.current = Date.now();
    setEscolhida(null);
    setI(i + 1);
  };

  /* `pj.clique` de `jogos2.js:668-686`. */
  const responder = (op: FalaComAudio, botao: HTMLElement | null) => {
    if (trava.current || !rodada || !ativo) return;
    trava.current = true;
    const certo = ehACerta(op);
    setEscolhida(op);
    outcomes.current.push({
      ...(rodada.correta.id ? { itemRef: rodada.correta.id } : {}),
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioDaFala.current,
      ...(comDica.current ? { hinted: true } : {}),
    });
    const p = recontar(outcomes.current);
    setFeitos((n) => n + 1);
    if (certo) {
      setSeq((n) => n + 1);
      celebrar({ tipo: 'acerto', combo: seq + 1, el: botao, pontos: p.ganho });
    } else {
      setSeq(0);
      celebrar({ tipo: 'erro', el: botao });
      flutuar(botao, t('Ouça novamente'), 'erro');
      dizer(false);
    }
    depois(certo ? 1000 : 2200, prox);
  };

  /* As teclas 1 a 4 escolhem pela posição (o protótipo não as desenha aqui; o atalho continua). */
  useAtalhosDasAlternativas(
    opcoes.length,
    (k) => {
      const op = opcoes[k];
      if (op) responder(op, lista.current?.querySelectorAll<HTMLElement>('button')[k] ?? null);
    },
    !!rodada && ativo && !escolhida && !acabou,
  );

  if (!rodada) return null;

  return (
    <>
      <audio ref={audioRef} src={audioUrl || undefined} preload="auto" hidden />
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${rodadas.length} falas`}
        progresso={feitos / Math.max(1, rodadas.length)}
        ajudas={
          <AjudasGerais
            jogo="escuta"
            parado={!ativo || acabou}
            resposta={() => rodada.correta.text}
            aoVerResposta={() => {
              comDica.current = true;
              setSeq(0);
            }}
          />
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        {temSom ? (
          <div className="pj-acoes">
            <button
              type="button"
              className={`btn btn-solid pj-grande${tocando ? ' falando tocando' : ''}`}
              data-pj="ouvir"
              data-tour="ouvir"
              onClick={() => tocar(false)}
            >
              <Play data-pj-i="" aria-hidden /> {t('Ouvir de novo')}
            </button>
            {/* No Difícil o botão de ouvir devagar não existe (`jogos2.js:664`). */}
            {regras.ouvirDevagar && (
              <button
                type="button"
                className="btn btn-outline"
                data-pj="devagar"
                data-tour="devagar"
                onClick={() => tocar(true)}
              >
                <Gauge data-pj-i="" aria-hidden /> {t('devagar')}
              </button>
            )}
          </div>
        ) : (
          <div data-qp="sem-som">
            <SemVozNoQuest idioma={rodada.correta.lang} />
            {rodada.correta.translation ? (
              <>
                <p data-qp="apoio">{t('Escolha a fala que quer dizer:')}</p>
                <p data-qp="enunciado">{rodada.correta.translation}</p>
              </>
            ) : (
              <p data-qp="apoio">{t('Sem som e sem tradução, esta fala fica no palpite. Escolha uma para seguir.')}</p>
            )}
          </div>
        )}
        <div ref={lista} className="pj-lista">
          {opcoes.map((op, k) => (
            <button
              key={op.id ?? k}
              type="button"
              data-op={op.text}
              lang={op.lang}
              className={escolhida ? (ehACerta(op) ? 'certa' : op === escolhida ? 'errada' : undefined) : undefined}
              disabled={!!escolhida}
              onClick={(e) => responder(op, e.currentTarget)}
            >
              {op.text}
            </button>
          ))}
        </div>
        {/* A tradução só aparece depois da resposta (`jogos2.js:677`): antes, entregaria a certa. */}
        <p className="mut pj-aviso" style={{ color: 'var(--ink-muted)' }}>
          {escolhida && temSom ? rodada.correta.translation : ''}
        </p>
      </div>
    </>
  );
}
