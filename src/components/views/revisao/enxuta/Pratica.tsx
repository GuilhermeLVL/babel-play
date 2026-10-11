import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  CalendarClock,
  Check,
  CircleCheck,
  CircleX,
  Gauge,
  Headphones,
  Layers,
  Lightbulb,
  Mic,
  PenLine,
  Sparkles,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { idiomaDaInterface, t, tp } from '../../../../lib/i18n';
import {
  andarBarra,
  chegarBotoes,
  entradaDoFechoDaPratica,
  pintarPratica,
  revelarFrase,
} from '../../../../lib/polimento/revisao';
import { sentir } from '../../../../lib/polimento/sentidos';
import type { CenaDoCartao } from '../../../../lib/revisao/cena';
import {
  acharNaFrase,
  alvoNaFrase,
  conferirDitadoDaFrase,
  conferirLacuna,
  type ResultadoDoDitado,
} from '../../../../lib/revisao/enxuta';
import type { Tocador } from '../../../../lib/revisao/falaOriginal';
import type { VocabCard } from '../../../../types';
import Gravador from './Gravador';
import { Eq, FraseMarcada, SeloDaPratica } from './pecas';

export type PraticaDeRecordar = 'falar' | 'ditado' | 'completar';

export interface ItemDaPratica {
  cartao: VocabCard;
  /** A cena do cartão, quando ele nasceu de uma captura (lida antes de a prática abrir). */
  cena: CenaDoCartao | null;
}

/** O que o fim da prática devolve depois de mandar as notas. */
export interface NotasDaPratica {
  /** Quantas notas o servidor gravou. */
  gravadas: number;
  /** Quantas não foram (sem rede). */
  falhas: number;
}

const ICONE = { falar: Mic, ditado: Headphones, completar: PenLine } as const;

/** "inglês", "espanhol": o nome do idioma do cartão, na língua da interface. */
function nomeDoIdioma(codigo: string): string {
  try {
    return new Intl.DisplayNames([idiomaDaInterface()], { type: 'language' }).of(codigo.split('-')[0]) ?? codigo;
  } catch {
    return codigo;
  }
}

/**
 * AS PRÁTICAS DE RECORDAR — porte de `CX_CORPO`, `cxHtmlDaPratica`, `cxHtmlDoFecho` e das ações `pr-*`
 * (`cartoes4.js:552-666, 860-938`): Falar, Ouvir e escrever e Completar, dentro da tela da revisão.
 *
 * O QUE GRAVAM: nada durante a prática. No fecho, cada cartão recebe uma nota pelo caminho da revisão
 * (`aoGravar`): Bom se a pessoa lembrou, Errei se não. Sair no meio não grava nada, e a tela diz isso.
 * O texto de cada resultado diz quando o cartão volta pela conta de verdade (`voltaSeErrar`), e não o
 * "volta amanhã" fixo do protótipo.
 *
 * Carregada só quando uma prática começa (`React.lazy`).
 */
export default function Pratica({
  tipo,
  rotulo,
  itens,
  idiomaDe,
  tocador,
  atalhos,
  voltaSeErrar,
  aoGravar,
  aoTrocar,
  aoSair,
  children,
}: {
  tipo: PraticaDeRecordar;
  /** O nome do recorte ("As 4 que escaparam"). */
  rotulo: string;
  itens: ItemDaPratica[];
  /** O idioma do cartão (BCP-47 ou base), para a voz e para o campo. */
  idiomaDe: (c: VocabCard) => string;
  tocador: Tocador;
  /** Há teclado físico: a linha de teclas aparece e o campo pega o foco. */
  atalhos: boolean;
  /** "ainda hoje", "em 1,2 d": quando o cartão volta se a nota for Errei. */
  voltaSeErrar: (c: VocabCard) => string;
  aoGravar: (resultados: Array<{ id: string; lembrou: boolean }>) => Promise<NotasDaPratica>;
  /** O botão de faísca do topo: abre a folha das práticas de novo. */
  aoTrocar: () => void;
  aoSair: (interrompida: boolean) => void;
  children?: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [fase, setFase] = useState<'frente' | 'depois'>('frente');
  const [texto, setTexto] = useState('');
  const [dica, setDica] = useState(false);
  const [ditado, setDitado] = useState<ResultadoDoDitado | null>(null);
  const [lacuna, setLacuna] = useState<0 | 1 | 2>(0);
  const [tocando, setTocando] = useState(false);
  /* Falar: a frase só aparece depois de dita (ou de "só ver a frase"); a nota, depois de comparar. */
  const [fraseAVista, setFraseAVista] = useState(false);
  const [notaAVista, setNotaAVista] = useState(false);
  const [semFalar, setSemFalar] = useState(false);
  const resultados = useRef<Array<{ id: string; lembrou: boolean }>>([]);
  const quase = useRef(0);
  const [fim, setFim] = useState<null | { certos: number; quase: number; notas: NotasDaPratica | null }>(null);
  const barraAntes = useRef(0);
  const vezDoSom = useRef(0);
  const refFrase = useRef<HTMLParagraphElement>(null);
  const refNota = useRef<HTMLDivElement>(null);

  const total = itens.length;
  const item = itens[Math.min(i, total - 1)];
  const c = item.cartao;
  const frase = (item.cena?.frase || c.sentence || '').trim();
  const idioma = idiomaDe(c);
  const alvo = alvoNaFrase(frase, c.word);
  const traducaoDaFrase = item.cena?.traducao ?? '';
  const Icone = ICONE[tipo];
  const nome = tipo === 'falar' ? t('Falar') : tipo === 'ditado' ? t('Ouvir e escrever') : t('Completar');

  /** `cxSom()` e `cxOuvir()` de `cartoes4.js:680-698`: toca e acende o botão enquanto toca. */
  const ouvir = (o: { devagar?: boolean } = {}) => {
    const vez = ++vezDoSom.current;
    setTocando(true);
    const velocidade = o.devagar ? 0.6 : 1;
    const ateALacuna = tipo === 'completar' && fase === 'frente';
    const inicioDaLacuna = acharNaFrase(frase, c.word)[0]?.[0] ?? frase.length;
    const p = ateALacuna
      ? tocador.voz(frase.slice(0, inicioDaLacuna).trim() || c.word, idioma, velocidade)
      : item.cena
        ? tocador.original(item.cena, idioma, velocidade)
        : tocador.voz(frase, idioma, velocidade);
    void p.finally(() => {
      if (vezDoSom.current === vez) setTocando(false);
    });
  };

  /* Cartão novo: entra, toca sozinho (`cartoes4.js:762-765`) e o campo pega o foco onde há teclado. */
  useLayoutEffect(() => {
    if (fim || !raiz.current) return;
    andarBarra(raiz.current, barraAntes.current);
    barraAntes.current = (i / Math.max(1, total)) * 100;
    pintarPratica(raiz.current, 'proximo');
    if (tipo === 'falar') return;
    const relogio = window.setTimeout(() => ouvir(), 520);
    if (atalhos) raiz.current.querySelector<HTMLInputElement>('[data-cx-campo]')?.focus({ preventScroll: true });
    return () => window.clearTimeout(relogio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, !!fim]);
  useLayoutEffect(() => {
    if (fase !== 'depois' || !raiz.current) return;
    pintarPratica(raiz.current, 'resposta');
    /* depois da resposta a fala toca de novo (`cartoes4.js:770`) */
    if (tipo === 'completar' || (tipo === 'ditado' && ditado && !ditado.lembrou)) {
      const relogio = window.setTimeout(() => ouvir(), 420);
      return () => window.clearTimeout(relogio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);
  useEffect(() => {
    if (fraseAVista) revelarFrase(refFrase.current);
  }, [fraseAVista]);
  useEffect(() => {
    if (notaAVista) chegarBotoes(refNota.current);
  }, [notaAVista]);
  useLayoutEffect(() => {
    if (fim && raiz.current) entradaDoFechoDaPratica(raiz.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!fim]);
  useEffect(() => () => tocador.parar(), [tocador]);

  /** `cxProximo()` e `cxFecharPratica()` de `cartoes4.js:853-866`. */
  const proximo = (lembrou: boolean) => {
    tocador.parar();
    resultados.current.push({ id: c.id, lembrou });
    if (i + 1 >= total) {
      const certos = resultados.current.filter((r) => r.lembrou).length;
      setFim({ certos, quase: quase.current, notas: null });
      void aoGravar(resultados.current).then((notas) => setFim((f) => (f ? { ...f, notas } : f)));
      return;
    }
    setI(i + 1);
    setFase('frente');
    setTexto('');
    setDica(false);
    setDitado(null);
    setLacuna(0);
    setFraseAVista(false);
    setNotaAVista(false);
    setSemFalar(false);
  };

  /** `cxVerificar()` de `cartoes4.js:867-888`. */
  const verificar = (resposta = texto) => {
    if (fase !== 'frente' || tipo === 'falar') return;
    tocador.parar();
    const dita = resposta.trim();
    setTexto(dita);
    let lembrou: boolean;
    if (tipo === 'ditado') {
      const r = conferirDitadoDaFrase(dita, frase, c.word);
      setDitado(r);
      lembrou = r.lembrou;
      if (r.quase && lembrou) quase.current++;
    } else {
      const q = conferirLacuna(dita, frase, c.word);
      setLacuna(q);
      lembrou = q > 0;
      if (q === 1) quase.current++;
    }
    setFase('depois');
    sentir(lembrou ? 'acerto' : 'desliga');
  };
  const lembrouAgora = tipo === 'ditado' ? !!ditado?.lembrou : lacuna > 0;

  /* `cxTeclaDaPratica()` de `cartoes4.js:1021-1033`. */
  useEffect(() => {
    if (fim) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      const alvoDaTecla = e.target as HTMLElement | null;
      if (alvoDaTecla?.matches?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if ((k === 'enter' || k === ' ') && fase === 'depois' && !alvoDaTecla?.closest?.('button')) {
        e.preventDefault();
        proximo(lembrouAgora);
        return;
      }
      if (k === 'r' && tipo !== 'falar') {
        e.preventDefault();
        ouvir();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  const sair = () => {
    tocador.parar();
    aoSair(!fim && (i > 0 || fase === 'depois' || resultados.current.length > 0));
  };

  // ── O fecho (`cxHtmlDoFecho`, `cartoes4.js:633-650`) ────────────────────────────────────────────
  if (fim) {
    const resto = total - fim.certos;
    const feito =
      tipo === 'falar'
        ? tp(total, '{certos} de {n} frase lembrada, dita em voz alta.', '{certos} de {n} frases lembradas, ditas em voz alta.', {
            certos: fim.certos,
          })
        : tipo === 'ditado'
          ? tp(total, '{certos} de {n} frase de ouvido.', '{certos} de {n} frases de ouvido.', { certos: fim.certos })
          : tp(total, '{certos} de {n} lacuna completada.', '{certos} de {n} lacunas completadas.', { certos: fim.certos });
    return (
      <div
        className="q-palco q-revisao ct-rev ct-fim cx-fim cx-pr cx-pr-fim"
        data-testid="revisao-no-quest"
        data-estado="pratica-fim"
        data-pr={tipo}
        ref={raiz}
      >
        <header className="q-cab cx-topo">
          <button type="button" className="q-ctl q-voltar" aria-label={t('Voltar')} onClick={sair}>
            <ArrowLeft aria-hidden />
          </button>
          <div>
            <p className="q-sobre">{rotulo}</p>
            <h1>{t('Prática concluída')}</h1>
          </div>
        </header>
        <div className="q-cartao fundo qr-fecho">
          <span className="q-ic">
            <Icone aria-hidden />
          </span>
          <div>
            <h2>{nome}</h2>
            <p>
              {feito}
              {fim.quase > 0 &&
                ` ${tp(fim.quase, '{n} com deslize de digitação, que não conta.', '{n} com deslize de digitação, que não conta.')}`}
            </p>
          </div>
        </div>
        {fim.notas === null ? (
          <p className="cx-fecho-conta leve" role="status">
            <CalendarClock aria-hidden />
            <span>{t('Gravando as notas…')}</span>
          </p>
        ) : fim.notas.falhas > 0 ? (
          <p className="cx-fecho-conta leve" role="status">
            <WifiOff aria-hidden />
            <span>
              <b>{t('Sem rede.')}</b>{' '}
              {tp(
                fim.notas.falhas,
                '{n} nota desta prática não foi gravada: a agenda desse cartão não mudou.',
                '{n} notas desta prática não foram gravadas: a agenda desses cartões não mudou.',
              )}
            </span>
          </p>
        ) : (
          <p className="cx-fecho-conta conta" role="status">
            <CircleCheck aria-hidden />
            <span>
              <b>{t('Contou como revisão.')}</b>{' '}
              {tp(fim.certos, '{n} cartão recebeu a nota Bom', '{n} cartões receberam a nota Bom')}
              {resto > 0 && `; ${tp(resto, '{n} recebeu Errei e volta logo', '{n} receberam Errei e voltam logo')}`}.
            </span>
          </p>
        )}
        <div className="q-faixa cx-fim-pe" role="toolbar" aria-label={t('O que fazer agora')}>
          <button type="button" className="q-ctl pri" onClick={aoTrocar}>
            <Sparkles aria-hidden /> {t('Praticar de outro jeito')}
          </button>
          <button type="button" className="q-ctl" onClick={sair}>
            <Layers aria-hidden /> {t('Voltar')}
          </button>
        </div>
        {children}
      </div>
    );
  }

  // ── Os miolos (`CX_CORPO`, `cartoes4.js:552-597`) ───────────────────────────────────────────────
  const botaoDeOuvir = (rotuloDoBotao: string, extra?: ReactNode) => (
    <div className="cx-pr-tocar">
      <button type="button" className={`q-ctl ct-som cx-toca ${tocando ? 'ct-tocando' : ''}`} onClick={() => ouvir()}>
        <AudioLines aria-hidden />
        <Eq />
        <span>{rotuloDoBotao}</span>
      </button>
      {extra}
    </div>
  );
  const avancar = (
    <button type="button" className="q-ctl pri qr-principal" onClick={() => proximo(lembrouAgora)}>
      {t('Avançar')} <ArrowRight aria-hidden />
    </button>
  );
  const consequencia = (lembrou: boolean, comDica = false) => (
    <p className="ct-consequencia">
      {lembrou
        ? comDica
          ? t('Conta como lembrada, com dica.')
          : t('Conta como lembrada.')
        : t('Conta como esquecida: volta {quando}.', { quando: voltaSeErrar(c) })}
    </p>
  );
  const campo = (rotuloDoCampo: string, dicaDoCampo: string) => (
    <label className="q-campo">
      <span>{rotuloDoCampo}</span>
      <input
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={dicaDoCampo}
        data-cx-campo="texto"
        lang={idioma}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && texto.trim()) {
            e.preventDefault();
            verificar();
          }
        }}
      />
    </label>
  );
  const fileira = (
    <div className="cx-fileira">
      <button type="button" className="q-ctl" onClick={() => verificar('')}>
        {t('Não sei')}
      </button>
      <button type="button" className="q-ctl pri qr-principal" disabled={!texto.trim()} onClick={() => verificar()}>
        <Check aria-hidden /> {t('Verificar')}
      </button>
    </div>
  );

  let miolo: ReactNode;
  if (tipo === 'falar') {
    const revelar = () => {
      setFraseAVista(true);
    };
    miolo = (
      <>
        <span className="q-rotulo">{t('Diga em {idioma}', { idioma: nomeDoIdioma(idioma) })}</span>
        <p className="cx-pr-pista">“{traducaoDaFrase || c.translation}”</p>
        {!fraseAVista && (
          <p className="cx-pr-sub">
            {traducaoDaFrase ? (
              <>
                {t('A palavra do cartão:')} <b>{c.translation}</b>
              </>
            ) : (
              t('Diga a palavra e, se lembrar, a frase em que ela apareceu.')
            )}
          </p>
        )}
        <p className="exemplo cx-pr-frase" lang={idioma} hidden={!fraseAVista} ref={refFrase}>
          “<FraseMarcada frase={frase} palavra={c.word} />”
        </p>
        {!semFalar && (
          <div className="cx-voz-caixa">
            <Gravador
              key={c.id}
              frase={frase}
              idioma={idioma}
              quem={item.cena?.quem}
              originalGravada={!!item.cena?.temAudio}
              aoOuvirOriginal={() =>
                item.cena ? tocador.original(item.cena, idioma) : tocador.voz(frase, idioma)
              }
              convite={t('Toque no microfone e diga a frase. Depois você ouve a original e a sua.')}
              aoGravar={revelar}
              aoComparar={() => setNotaAVista(true)}
            />
          </div>
        )}
        {!fraseAVista && !semFalar && (
          <button
            type="button"
            className="cx-link cx-pr-pular"
            onClick={() => {
              setSemFalar(true);
              setFraseAVista(true);
              setNotaAVista(true);
            }}
          >
            {t('Agora não posso falar: só ver a frase')}
          </button>
        )}
        <div className="cx-pr-nota" hidden={!notaAVista} ref={refNota}>
          <p className="q-rotulo">{t('Você lembrou da frase?')}</p>
          <div className="fsrs" role="group" aria-label={t('Você lembrou da frase?')} style={{ '--n': 2 } as CSSProperties}>
            <button
              type="button"
              className="e"
              onClick={() => {
                sentir('desliga');
                proximo(false);
              }}
            >
              {t('Ainda não')}
              <small>{t('volta {quando}', { quando: voltaSeErrar(c) })}</small>
            </button>
            <button
              type="button"
              className="b"
              onClick={() => {
                sentir('liga');
                proximo(true);
              }}
            >
              {t('Lembrei')}
              <small>{t('conta como revisão')}</small>
            </button>
          </div>
        </div>
      </>
    );
  } else if (tipo === 'ditado') {
    miolo =
      fase === 'frente' ? (
        <>
          <span className="q-rotulo">{t('Escreva o que você ouviu')}</span>
          {botaoDeOuvir(
            t('Ouvir a fala'),
            <button type="button" className="q-ctl" onClick={() => ouvir({ devagar: true })}>
              <Gauge aria-hidden /> {t('Devagar')}
            </button>,
          )}
          <p className="cx-onde">
            {item.cena?.temAudio ? <Mic aria-hidden /> : <Volume2 aria-hidden />}
            <span>
              {item.cena?.temAudio
                ? [item.cena.titulo, item.cena.quem].filter(Boolean).join(' · ')
                : t('Voz do aparelho')}
            </span>
          </p>
          {campo(t('A frase em {idioma}', { idioma: nomeDoIdioma(idioma) }), t('Escreva a frase…'))}
          {fileira}
        </>
      ) : (
        ditado && (
          <>
            <p className={`qr-veredito ${ditado.veredito}`} role="status">
              {ditado.veredito === 'errado' ? <CircleX aria-hidden /> : <CircleCheck aria-hidden />}
              <span>
                {ditado.veredito === 'certo'
                  ? ditado.quase
                    ? t('Certo. Só um deslize de digitação, que não conta.')
                    : t('Certo, palavra por palavra.')
                  : ditado.veredito === 'parcial'
                    ? ditado.pegouAPalavra
                      ? t('Quase. A palavra do cartão, “{palavra}”, você pegou.', { palavra: alvo })
                      : t('Quase. Faltou justo a palavra do cartão.')
                    : texto
                      ? t('Ainda não. Veja a frase e ouça de novo.')
                      : t('Tudo bem. Veja a frase e ouça de novo.')}
              </span>
            </p>
            <p className="cx-pr-palavras" lang={idioma} aria-label={t('A frase, palavra por palavra')}>
              {ditado.exibe.map((w, n) => (
                <span key={n} className={ditado.marcas[n] || 'ok'}>
                  {w}{' '}
                </span>
              ))}
            </p>
            {traducaoDaFrase && <p className="exemplo">“{traducaoDaFrase}”</p>}
            {botaoDeOuvir(t('Ouvir de novo'))}
            {consequencia(ditado.lembrou)}
            {avancar}
          </>
        )
      );
  } else {
    miolo =
      fase === 'frente' ? (
        <>
          <span className="q-rotulo">{t('Complete a frase')}</span>
          <p className="qr-frase cx-pr-frase-vao" lang={idioma}>
            “<FraseMarcada frase={frase} palavra={c.word} modo="vao" />”
          </p>
          <p className="q-texto cx-pr-quer">
            {t('Quer dizer:')} <b>{c.translation}</b>
            {dica && (
              <span className="cx-pr-dica">
                {' · '}
                {t('começa com “{letras}”', { letras: alvo.slice(0, Math.min(2, Math.max(1, alvo.length - 1))) })}
              </span>
            )}
          </p>
          {botaoDeOuvir(
            t('Ouvir até a lacuna'),
            <button
              type="button"
              className="q-ctl"
              disabled={dica}
              onClick={() => {
                setDica(true);
                sentir('toque');
              }}
            >
              <Lightbulb aria-hidden /> {t('Dica')}
            </button>,
          )}
          {campo(t('A palavra que falta'), t('Digite a palavra…'))}
          {fileira}
        </>
      ) : (
        <>
          <p className={`qr-veredito ${lacuna === 2 ? 'certo' : lacuna === 1 ? 'parcial' : 'errado'}`} role="status">
            {lacuna ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
            <span>
              {lacuna === 2
                ? t('Certo: “{palavra}”.', { palavra: alvo })
                : lacuna === 1
                  ? t('Quase: foi só um deslize de digitação. O certo é “{palavra}”.', { palavra: alvo })
                  : texto
                    ? t('Era “{palavra}” (você escreveu “{tentativa}”).', { palavra: alvo, tentativa: texto })
                    : t('Era “{palavra}”.', { palavra: alvo })}
            </span>
          </p>
          <p className="exemplo cx-pr-frase cx-encaixou" lang={idioma}>
            “<FraseMarcada frase={frase} palavra={c.word} />”
          </p>
          {traducaoDaFrase && <p className="exemplo">“{traducaoDaFrase}”</p>}
          {botaoDeOuvir(t('Ouvir a frase inteira'))}
          {consequencia(lacuna > 0, dica)}
          {avancar}
        </>
      );
  }

  return (
    <div
      className="q-palco q-revisao ct-rev cx-rev cx-pr"
      data-testid="revisao-no-quest"
      data-estado="pratica"
      data-pr={tipo}
      data-fase={fase}
      ref={raiz}
    >
      <header className="q-cab qr-topo cx-topo">
        <button type="button" className="q-ctl q-voltar" aria-label={t('Sair da prática')} onClick={sair}>
          <ArrowLeft aria-hidden />
        </button>
        <div className="qr-progresso">
          <span
            className="q-barra"
            role="progressbar"
            aria-label={t('Progresso da prática')}
            aria-valuenow={i}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <span style={{ width: `${(i / Math.max(1, total)) * 100}%` }} />
          </span>
          <span className="qr-conta">
            {Math.min(i + 1, total)} / {total}
          </span>
        </div>
        <button
          type="button"
          className="q-ctl cx-ic"
          aria-label={t('Praticar de outro jeito')}
          title={t('Praticar de outro jeito')}
          onClick={aoTrocar}
        >
          <Sparkles aria-hidden />
        </button>
      </header>
      <h1 className="sr">
        {nome}: {rotulo}
      </h1>
      <div className="cx-linha">
        <p className="cx-pr-linha">
          <span className="q-tag off">
            <Layers aria-hidden /> {rotulo}
          </span>
          <SeloDaPratica conta />
        </p>
      </div>
      <section className="q-cartao qr-cartao flash pele-padrao cartao-aprendida cx-pr-cartao" aria-label={nome}>
        {miolo}
      </section>
      {atalhos && (
        <p className="cx-teclas" data-precisa="teclado">
          {tipo === 'falar' ? (
            t('Sem pressa: aqui não há relógio')
          ) : (
            <>
              <kbd>Enter</kbd> {t('verifica e avança')}
            </>
          )}
        </p>
      )}
      {children}
    </div>
  );
}
