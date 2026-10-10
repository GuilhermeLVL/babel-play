import { ArrowRight, Clock, Gift, Play, ShieldCheck } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LIMITE_DE_PREMIADOS, type PremioDeExemplo } from './tipos';

/** No protótipo o anúncio dura 10 s e dá para pular aos 5 (`anuncios.js:520-521`); no app, até 30 s. */
const TOTAL_S = 10;
const PULAR_S = 5;
const RAIO = 15.5;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/**
 * As duas folhas nascem na RAIZ do app, como no protótipo (`app.insertAdjacentHTML`, `anuncios.js:493`), e
 * não dentro da tela que ofereceu o premiado: lá elas herdariam o texto centralizado do fim de rodada.
 */
const naRaizDoApp = (folha: ReactNode) =>
  createPortal(folha, document.querySelector('[data-raiz-do-app]') ?? document.body);

/**
 * O FLUXO DO ANÚNCIO PREMIADO, DE DEMONSTRAÇÃO — porte de `premiado()` e `abrirAnuncioPremiado()`
 * (`anuncios.js:575-620` e `519-571`): a folha que diz ANTES o que se ganha e quanto dura, o "anúncio"
 * de exemplo com a contagem e o "Pular", e a volta dizendo se a pessoa viu até o fim.
 *
 * NADA AQUI É DE VERDADE: a marca é inventada, não há vídeo, script nem pedido de rede, e quem chama
 * SIMULA a recompensa (nada é creditado no servidor). Só existe em desenvolvimento.
 */
export default function FluxoDoPremiado({
  premio,
  vistosHoje,
  aoTerminar,
  aoSemAnuncios,
}: {
  premio: PremioDeExemplo;
  vistosHoje: number;
  /** `viu`: assistiu até o fim. Recusar ou pular não tira nada (`false`). */
  aoTerminar: (viu: boolean) => void;
  aoSemAnuncios: () => void;
}) {
  const [etapa, setEtapa] = useState<'confirmar' | 'assistir'>('confirmar');
  const terminar = useRef(aoTerminar);
  terminar.current = aoTerminar;

  if (etapa === 'confirmar')
    return (
      <Confirmacao
        premio={premio}
        vistosHoje={vistosHoje}
        aoVer={() => setEtapa('assistir')}
        aoRecusar={() => terminar.current(false)}
        aoSemAnuncios={aoSemAnuncios}
      />
    );
  return <AnuncioDeExemplo premio={premio} aoTerminar={(viu) => terminar.current(viu)} />;
}

function Confirmacao({
  premio,
  vistosHoje,
  aoVer,
  aoRecusar,
  aoSemAnuncios,
}: {
  premio: PremioDeExemplo;
  vistosHoje: number;
  aoVer: () => void;
  aoRecusar: () => void;
  aoSemAnuncios: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  /* Fechar pelo Esc ou pelo toque fora vale "Agora não"; seguir para o anúncio, não. */
  const seguiu = useRef(false);
  const recusar = useRef(aoRecusar);
  recusar.current = aoRecusar;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    /* O foco inicial fica na folha, não num botão: Enter sem querer não pode abrir um anúncio
       (`focarFolha`, `anuncios.js:574`). */
    d.focus({ preventScroll: true });
    const aoFechar = () => {
      if (!seguiu.current) recusar.current();
    };
    d.addEventListener('close', aoFechar);
    return () => d.removeEventListener('close', aoFechar);
  }, []);

  return naRaizDoApp(
    <dialog
      ref={ref}
      tabIndex={-1}
      className="folha-de-baixo pj-como-folha ad-folha"
      aria-label="Anúncio premiado"
      data-ad-folha="confirmar"
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <span className="folha-pega" aria-hidden="true" />
      <div className="folha-corpo">
        <div className="pj-como ad-confirma">
          <span className="label-mono">Anúncio premiado · opcional</span>
          <h2>Ver um anúncio e {premio.frase}?</h2>
          <ul className="ad-lista">
            <li>
              <Clock aria-hidden />
              <span>Você vai ver um anúncio de até 30 s.</span>
            </li>
            <li>
              <Gift aria-hidden />
              <span>A recompensa cai quando o anúncio termina. Dá para pular depois de 5 s, mas aí ela não vem.</span>
            </li>
            <li>
              <ShieldCheck aria-hidden />
              <span>Demonstração: o anúncio é de exemplo, nada sai do aparelho e nada é creditado.</span>
            </li>
          </ul>
          <div className="ad-confirma-pe">
            <button type="button" className="btn btn-outline" data-ad-f="nao" onClick={() => ref.current?.close()}>
              Agora não
            </button>
            <button
              type="button"
              className="btn btn-solid"
              data-ad-f="ver"
              onClick={() => {
                seguiu.current = true;
                ref.current?.close();
                aoVer();
              }}
            >
              <Play aria-hidden /> Ver anúncio
            </button>
          </div>
          <p className="ad-confirma-nota">
            Hoje: {vistosHoje} de {LIMITE_DE_PREMIADOS} premiados.{' '}
            <button
              type="button"
              className="ad-sem"
              data-ad-f="planos"
              onClick={() => {
                ref.current?.close();
                aoSemAnuncios();
              }}
            >
              Sem anúncios no Essencial
            </button>
          </p>
        </div>
      </div>
    </dialog>,
  );
}

function AnuncioDeExemplo({ premio, aoTerminar }: { premio: PremioDeExemplo; aoTerminar: (viu: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [s, setS] = useState(0);
  const [avisoDoCta, setAvisoDoCta] = useState(false);
  const acabou = useRef(false);
  const fim = useRef(aoTerminar);
  fim.current = aoTerminar;
  const podePular = s >= PULAR_S;
  const podePularRef = useRef(podePular);
  podePularRef.current = podePular;

  const terminar = (viu: boolean) => {
    if (acabou.current) return;
    acabou.current = true;
    ref.current?.close();
    fim.current(viu);
  };
  const terminarRef = useRef(terminar);
  terminarRef.current = terminar;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    d.focus({ preventScroll: true });
    const t0 = performance.now();
    const relogio = window.setInterval(() => {
      const agora = (performance.now() - t0) / 1000;
      setS(agora);
      if (agora >= TOTAL_S) terminarRef.current(true);
    }, 100);
    /* Esc só fecha depois que dá para pular, e fechar assim é pular: sem recompensa. */
    const aoCancelar = (e: Event) => {
      e.preventDefault();
      if (podePularRef.current) terminarRef.current(false);
    };
    d.addEventListener('cancel', aoCancelar);
    return () => {
      window.clearInterval(relogio);
      d.removeEventListener('cancel', aoCancelar);
    };
  }, []);

  const m = premio.marca;
  const Icone = m.icone;
  const falta = Math.max(0, TOTAL_S - s);
  return naRaizDoApp(
    <dialog ref={ref} tabIndex={-1} className="ad-tela ad-video" aria-label="Anúncio" data-ad-folha="anuncio">
      <div className="ad-player">
        <header>
          <span className="q-tag">Anúncio</span>
          <span className="ad-player-info">premiado · no app, até 30 s</span>
          <span className="q-espaco" />
          <span className="ad-conta" role="timer" aria-label="Tempo restante">
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r={RAIO} />
              <circle
                className="ad-conta-arco"
                cx="18"
                cy="18"
                r={RAIO}
                style={{
                  strokeDasharray: CIRCUNFERENCIA,
                  strokeDashoffset: CIRCUNFERENCIA * Math.min(1, s / TOTAL_S),
                }}
              />
            </svg>
            <b>{Math.ceil(falta)}</b>
          </span>
          <button type="button" className="ad-pular" disabled={!podePular} onClick={() => terminar(false)}>
            {podePular ? 'Pular (sem recompensa)' : `Pular em ${Math.ceil(PULAR_S - s)}`}
          </button>
        </header>
        <div className="ad-criativo grande" style={{ ['--mm' as string]: m.cor }}>
          <span className="ad-criativo-marca">
            <span className="ad-criativo-ic">
              <Icone aria-hidden />
            </span>
            {m.nome}
          </span>
          <b>{m.titulo}</b>
          <p>{m.texto}</p>
          <button
            type="button"
            className="ad-criativo-cta"
            onClick={() => {
              setAvisoDoCta(true);
              window.setTimeout(() => setAvisoDoCta(false), 1600);
            }}
          >
            {avisoDoCta ? (
              'No app, abre em outra aba'
            ) : (
              <>
                {m.acao} <ArrowRight aria-hidden />
              </>
            )}
          </button>
          <span className="ad-criativo-aviso">Anúncio de exemplo · marca fictícia</span>
        </div>
        <footer>
          <span className="ad-prog">
            <i style={{ width: `${Math.min(100, (s / TOTAL_S) * 100)}%` }} />
          </span>
          <p>
            <Gift aria-hidden /> Recompensa quando terminar: <b>{premio.premio}</b>
          </p>
        </footer>
      </div>
    </dialog>,
  );
}
