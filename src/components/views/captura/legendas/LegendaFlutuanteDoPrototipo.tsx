import '../../../../styles/legendas.css';
import '../../../../styles/legendasFlutuantes.css';

import { Grip, Pause, Play, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../../../lib/i18n';
import { anima } from '../../../../lib/polimento/base';
import {
  comMovimento,
  entrarFalaNoEspelho,
  entrarTraducaoNoEspelho,
  type Flutuante,
  ligarFlutuante,
} from '../../../../lib/polimento/captura';
import type { LegendaAoVivo } from './LinhaDaLegenda';

/** Uma fala no espelho: a original e, quando chega, a tradução (`telas.js:269-279`). */
function Fala({
  fala,
  atual,
  langDaTraducao,
  aoMudar,
}: {
  fala: LegendaAoVivo;
  atual: boolean;
  langDaTraducao?: string;
  aoMudar: () => void;
}) {
  const linha = useRef<HTMLDivElement>(null);
  const trad = useRef<HTMLSpanElement>(null);
  /* Nasce sem tradução na conta: a que já vem com a fala também entra (`telas.js:276-279`). */
  const tinha = useRef(false);
  useLayoutEffect(() => {
    if (linha.current) entrarFalaNoEspelho(linha.current);
  }, []);
  useLayoutEffect(() => {
    if (fala.traducao && !tinha.current && trad.current) entrarTraducaoNoEspelho(trad.current);
    tinha.current = !!fala.traducao;
  }, [fala.traducao]);
  useEffect(() => {
    const id = requestAnimationFrame(aoMudar);
    return () => cancelAnimationFrame(id);
  }, [fala.original, fala.traducao, aoMudar]);
  return (
    <div
      ref={linha}
      className={atual ? 'leg-fala atual' : 'leg-fala anterior'}
      data-fala={fala.id}
      aria-current={atual ? 'true' : undefined}
    >
      <span className="leg-o" lang={fala.lang}>
        {fala.original}
      </span>
      <span className="leg-t discreta" lang={langDaTraducao} ref={trad}>
        {fala.traducao}
      </span>
    </div>
  );
}

/**
 * AS LEGENDAS FLUTUANTES DO DESENHO NOVO, dentro do app — `abrirFlutuante()` de `telas.js:257-380`
 * (itens D17 e D18 de `fidelidade/casca-e-telas.md`): a janelinha de vidro escuro que se arrasta, se
 * joga e pousa no canto para onde ia, com o espelho das duas últimas falas.
 *
 * Onde o navegador tem a janela sempre-no-topo (Document Picture-in-Picture), quem flutua é ela, por
 * cima de qualquer programa; esta é a das telas sem essa janela.
 *
 * Fica montada enquanto o desenho novo estiver na tela; `aberta` diz se aparece. Ao fechar, sai
 * encolhendo (`fecharFlutuante()` de `telas.js:281-290`) antes de sumir.
 */
export default function LegendaFlutuanteDoPrototipo({
  aberta,
  falas,
  idiomaDaTraducao,
  aoFechar,
}: {
  aberta: boolean;
  /** As últimas falas da captura, em ordem. */
  falas: LegendaAoVivo[];
  /** O idioma da tradução de uma fala (o "outro" do par). */
  idiomaDaTraducao?: (lang: string | undefined) => string | undefined;
  aoFechar: () => void;
}) {
  const [montada, setMontada] = useState(aberta);
  const [pausada, setPausada] = useState(false);
  /* As falas a partir da última que havia ao abrir: a janela nasce com ela e segue dali. */
  const [desde, setDesde] = useState<string | null>(null);
  const [congeladas, setCongeladas] = useState<LegendaAoVivo[] | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const flut = useRef<Flutuante | null>(null);
  const ultimas = useRef(falas);
  ultimas.current = falas;

  useEffect(() => {
    if (aberta) {
      setDesde(ultimas.current[ultimas.current.length - 1]?.id ?? null);
      setPausada(false);
      setCongeladas(null);
      setMontada(true);
      return;
    }
    const janela = el.current;
    if (!janela) return setMontada(false);
    const some = () => setMontada(false);
    if (!comMovimento()) return some();
    let vivo = true;
    const fim = () => vivo && some();
    const relogio = window.setTimeout(fim, 420);
    anima(janela, [{ opacity: 0, scale: '0.85', filter: 'blur(6px)' }], { d: 220, fill: 'forwards' }).finished.then(
      fim,
      fim,
    );
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
    };
  }, [aberta]);

  useLayoutEffect(() => {
    if (!montada || !el.current) return;
    const f = ligarFlutuante(el.current);
    flut.current = f;
    return () => {
      f.desligar();
      flut.current = null;
    };
  }, [montada]);

  const [ajustar] = useState(() => () => flut.current?.ajustar());

  if (!montada) return null;

  const comTexto = falas.filter((f) => f.original.trim());
  const i = desde ? comTexto.findIndex((f) => f.id === desde) : -1;
  /* Só as duas últimas ficam (`telas.js:267-268`); pausada, a janela para onde estava. */
  const aVista = (congeladas ?? (i >= 0 ? comTexto.slice(i) : comTexto)).slice(-2);

  return createPortal(
    <div
      id="leg-flut"
      ref={el}
      className="leg-flut modo-video"
      role="region"
      aria-label={t('Legendas flutuantes')}
      tabIndex={-1}
    >
      <div className="leg-barra">
        <button type="button" className="leg-tit">
          <Grip aria-hidden /> {t('Legendas')}
        </button>
        <span className="q-espaco" style={{ flex: 1 }} />
        <button
          type="button"
          aria-pressed={pausada}
          aria-label={pausada ? t('Continuar legendas') : t('Pausar legendas')}
          title={pausada ? t('Continuar') : t('Pausar (Espaço)')}
          onClick={() => {
            setCongeladas(pausada ? null : aVista);
            setPausada(!pausada);
          }}
        >
          {pausada ? <Play aria-hidden /> : <Pause aria-hidden />}
        </button>
        <button
          type="button"
          aria-label={t('Fechar as legendas flutuantes')}
          title={t('Fechar')}
          data-px="fechar"
          onClick={aoFechar}
        >
          <X aria-hidden />
        </button>
      </div>
      <div className="leg-corpo">
        {aVista.length === 0 && <p className="leg-vazio">{t('Esperando a primeira fala')}</p>}
        {aVista.map((f, k) => (
          <Fala
            key={f.id}
            fala={f}
            atual={k === aVista.length - 1}
            langDaTraducao={idiomaDaTraducao?.(f.lang)}
            aoMudar={ajustar}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
