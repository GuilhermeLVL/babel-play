import type { FalaComAudio, ItemOutcome, ResultadoDitado, RodadaDitado, RoundReport } from '@core';
import { conferirDitado, scoreRound } from '@core';
import { CornerDownLeft, Gauge, Lightbulb, Play, SkipForward } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import { juntarPalavras, palavrasDaFrase } from '../../core/minigames/palavrasDaFrase';
import { regrasDoJogo, vezesDaAjuda } from '../../core/minigames/regras';
import { celebrar } from '../../lib/comemoracao';
import { criarFalante } from '../../lib/falante';
import { t } from '../../lib/i18n';
import { useNivelDoJogo } from '../../lib/jogos/nivelDoJogo';
import { flutuar, tremer } from '../../lib/polimento/jogos';
import { sentir } from '../../lib/polimento/sentidos';
import AjudasGerais from './casca/AjudasGerais';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from './casca/HudDaRodada';
import { SemVozNoQuest, useSemTecladoFisico, useVozNoJogo } from './noQuest';
import { textosDoJogo } from './polimento/textos';

/**
 * DITADO — a cena do protótipo (`jogos2.js:692-763`, `jogos.css:128-141`): o botão grande de ouvir,
 * "devagar", o campo com "Conferir" e, embaixo, a correção palavra por palavra.
 *
 * As regras e os números são os do protótipo: o limiar por nível (70, 80 ou 90 %), a segunda chance
 * (Fácil e Médio, uma vez por fala, nunca ao pular: o começo certo fica no campo, o resto sai sozinho e a
 * fala toca de novo) e a dica, que escreve até a próxima palavra certa. O que é do app: as falas, o som
 * (o clipe da gravação ou a voz, por `lib/falante`), a conferência do próprio app (`conferirDitado`, que
 * conhece os idiomas sem espaço e perdoa uma palavra pulada) e a nota de cada fala.
 */

interface Props {
  rodadas: RodadaDitado[];
  audioUrl: string;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Quanto a fala leva para soar, para o botão saber quando parou de tocar. */
const duracaoDaFala = (f: FalaComAudio, velocidade: number) =>
  (f.endMs > f.startMs ? Math.max(300, f.endMs - f.startMs) : Math.max(900, f.text.length * 90)) / velocidade;

export default function DitadoDoPrototipo({ rodadas, audioUrl, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('ditado');
  const nivel = useNivelDoJogo('ditado');
  const regras = regrasDoJogo('ditado', nivel);
  const LIM = regras.limiar;
  const textos = textosDoJogo('ditado');

  const [i, setI] = useState(0);
  const [texto, setTextoEstado] = useState('');
  const [conferido, setConferido] = useState<ResultadoDitado | null>(null);
  /** Quantas palavras do começo ficaram no campo na segunda chance; `null` enquanto ela não foi dada. */
  const [ficaram, setFicaram] = useState<number | null>(null);
  const [tocando, setTocando] = useState(false);
  const [dicas, setDicas] = useState(() => vezesDaAjuda('ditado', 'palavra', nivel));
  const [seq, setSeq] = useState(0);
  const [feitos, setFeitos] = useState(0);
  const [acabou, setAcabou] = useState(false);

  const rodada = rodadas[i] as RodadaDitado | undefined;
  const fala = rodada?.fala;
  const lang = fala?.lang ?? '';

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const entrada = useRef<HTMLDivElement>(null);
  const correcao = useRef<HTMLDivElement>(null);
  const textoRef = useRef('');
  const trava = useRef(false);
  const comDica = useRef(false);
  /** `pj.segunda` (`jogos2.js:721-723`): a fala que já gastou a segunda chance. */
  const segunda = useRef(-1);
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
  const escrever = (v: string) => {
    textoRef.current = v;
    setTextoEstado(v);
  };

  /* No headset o som é o clipe da gravação ou, sem ela, a voz do site, que só lê alguns idiomas. Sem
     nenhum dos dois o botão de ouvir não aparece, e a fala é escrita a partir da tradução. O campo
     também não rouba o foco ali: o teclado do sistema sobe quando a pessoa toca nele. */
  const semTeclado = useSemTecladoFisico();
  const haVoz = useVozNoJogo(fala?.lang);
  const temSom = !!audioUrl || haVoz;
  const falante = useMemo(() => criarFalante(audioRef, audioUrl), [audioUrl]);
  const focar = () => {
    if (!semTeclado) campo.current?.focus({ preventScroll: true });
  };

  /** `dizer` + `falando` (`jogos2.js:6-10`): o botão grande fica `.tocando` enquanto a fala soa. */
  const tocar = (devagar: boolean) => {
    if (!fala || trava.current || !falante.disponivel || !temSom) return;
    const velocidade = devagar ? 0.6 : 1;
    falante.ouvir({ texto: fala.text, lang, startMs: fala.startMs, endMs: fala.endMs }, velocidade);
    setTocando(true);
    if (pararEm.current) window.clearTimeout(pararEm.current);
    pararEm.current = window.setTimeout(() => setTocando(false), duracaoDaFala(fala, velocidade));
  };

  /* O campo ganha o foco e a fala toca sozinha 350 ms depois de entrar (`jogos2.js:709-710`). */
  useEffect(() => {
    if (!fala || !ativo || tocouRef.current === i) return;
    focar();
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

  /** Quantas palavras do começo do que foi escrito batem com a fala, uma a uma (`jogos2.js:724-725`). */
  const noLugar = (escrito: string) => {
    const alvo = palavrasDaFrase(fala?.text, lang);
    const escritas = palavrasDaFrase(escrito, lang);
    let n = 0;
    while (n < alvo.length && n < escritas.length && conferirDitado(alvo[n], escritas[n], lang).precisao === 100) n++;
    return { n, alvo };
  };

  /* `prox` de `jogos2.js:703-711`. */
  const prox = () => {
    if (i + 1 >= rodadas.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'ditado',
          items: todos,
          score: scoreRound('ditado', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return;
    }
    trava.current = false;
    comDica.current = false;
    inicioDaFala.current = Date.now();
    escrever('');
    setConferido(null);
    setFicaram(null);
    setI(i + 1);
  };

  /* `conferir` de `jogos2.js:712-743`. */
  const conferir = (pulou: boolean) => {
    if (trava.current || !fala || !ativo) return;
    trava.current = true;
    const r = conferirDitado(fala.text, textoRef.current, lang);
    if (r.precisao < LIM && regras.segundaChance && segunda.current !== i && !pulou) {
      /* Segunda chance: o começo certo fica, o resto sai sozinho, e a fala toca de novo. */
      segunda.current = i;
      const { n, alvo } = noLugar(textoRef.current);
      escrever(n ? juntarPalavras(alvo.slice(0, n), lang) + ' ' : '');
      setFicaram(n);
      setSeq(0);
      sentir('erro', 'error');
      tremer(entrada.current);
      trava.current = false;
      focar();
      tocar(false);
      return;
    }
    /* Pular nunca vale como acerto: é desistência declarada (`revealed`), como no jogo de sempre. */
    const certo = !pulou && r.precisao >= LIM;
    setFicaram(null);
    setConferido(r);
    outcomes.current.push({
      ...(fala.id ? { itemRef: fala.id } : {}),
      correct: certo,
      attempts: segunda.current === i ? 2 : 1,
      ms: Date.now() - inicioDaFala.current,
      hinted: comDica.current,
      revealed: pulou,
    });
    const p = recontar(outcomes.current);
    setFeitos((n) => n + 1);
    if (certo) {
      setSeq((n) => n + 1);
      celebrar({ tipo: 'acerto', combo: seq + 1, el: correcao.current ?? entrada.current, pontos: p.ganho });
    } else {
      setSeq(0);
      celebrar({ tipo: 'erro', el: entrada.current });
      flutuar(entrada.current, t('Abaixo de {limiar}%', { limiar: LIM }), 'erro');
    }
    depois(certo ? 1700 : 3400, prox);
  };

  /* `pj.ajuda` de `jogos2.js:750-760`: completa o campo até a próxima palavra certa. */
  const pedirDica = () => {
    if (trava.current || dicas <= 0 || !fala) return;
    const { n, alvo } = noLugar(textoRef.current);
    if (n >= alvo.length) return;
    escrever(juntarPalavras(alvo.slice(0, n + 1), lang) + ' ');
    setDicas((d) => d - 1);
    /* Custa (`jogos.js:334-338`): zera o combo, e o acerto que vier conta como "com dica". */
    comDica.current = true;
    setSeq(0);
    focar();
    flutuar(campo.current, t('palavra {n}', { n: n + 1 }), '');
  };

  if (!rodada || !fala) return null;

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
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Dica"
              resta={dicas}
              title="Conta como dica: zera o combo"
              data-ajuda="palavra"
              data-tour="dica-ditado"
              disabled={!ativo || acabou || !!conferido}
              onClick={pedirDica}
            />
            <AjudasGerais
              jogo="ditado"
              parado={!ativo || acabou}
              resposta={() => fala.text}
              aoVerResposta={() => {
                comDica.current = true;
                setSeq(0);
              }}
            />
          </>
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
              <Play data-pj-i="" aria-hidden /> {t('Ouvir fala')}
            </button>
            <button type="button" className="btn btn-outline" data-pj="devagar" onClick={() => tocar(true)}>
              <Gauge data-pj-i="" aria-hidden /> {t('devagar')}
            </button>
          </div>
        ) : (
          <div data-qp="sem-som">
            <SemVozNoQuest idioma={fala.lang} />
            {fala.translation ? (
              <>
                <p data-qp="apoio">{t('Escreva a fala que quer dizer:')}</p>
                <p data-qp="enunciado">{fala.translation}</p>
              </>
            ) : (
              <p data-qp="apoio">{t('Sem som e sem tradução não há o que escrever. Pule esta fala.')}</p>
            )}
          </div>
        )}
        <div ref={entrada} className="pj-entrada">
          <input
            ref={campo}
            type="text"
            placeholder={t('escreva o que ouviu…')}
            aria-label={t('O que você ouviu')}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            lang={fala.lang}
            data-tour="entrada"
            value={texto}
            disabled={!!conferido}
            onChange={(e) => escrever(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') conferir(false);
            }}
          />
          <button
            type="button"
            className="btn btn-solid"
            data-pj="conferir"
            data-tour="conferir"
            onClick={() => conferir(false)}
          >
            <CornerDownLeft data-pj-i="" aria-hidden /> {t('Conferir')}
          </button>
        </div>
        <div ref={correcao} className="pj-correcao">
          {conferido ? (
            <>
              <p>
                {conferido.acertos} de {conferido.total} palavras, {conferido.precisao}%
              </p>
              <div className="pj-palavras">
                {conferido.palavras.map((p, k) => (
                  <span key={k} className={p.certa ? 'ok' : 'no'} style={{ '--i': k } as CSSProperties}>
                    {p.esperada}
                    {!p.certa && <small>{p.escrita || '-'}</small>}
                  </span>
                ))}
              </div>
              {fala.translation && <p>{fala.translation}</p>}
            </>
          ) : ficaram !== null ? (
            /* O aviso da segunda chance (`jogos2.js:727`). */
            <p className="pj-aviso">
              {ficaram
                ? ficaram === 1
                  ? t('A primeira palavra ficou; o resto saiu.')
                  : t('As {n} primeiras palavras ficaram; o resto saiu.', { n: ficaram })
                : t('Ainda não.')}{' '}
              {t('Ouça de novo e complete: você tem mais uma tentativa.')}
            </p>
          ) : null}
        </div>
        <button type="button" className="pj-link" data-pj="pular" hidden={!!conferido} onClick={() => conferir(true)}>
          <SkipForward data-pj-i="" aria-hidden /> {t('não consigo, pular')}
        </button>
      </div>
    </>
  );
}
