import '../../../styles/leitorBalao.css';

import { Copy, Ear, SlidersHorizontal, Square, Volume2, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  type Area,
  type Caixa,
  colunaDoTrecho,
  LARGURA_DO_BALAO,
  posicionarBalao,
} from '../../../core/leitura/balaoDaTraducao';
import type { EstadoDaFerramenta } from '../../../core/leitura/ferramentasDeIa';
import { criarTraducaoAutomatica, type EstadoDaTraducao } from '../../../core/leitura/traducaoAutomatica';
import { t } from '../../../lib/i18n';
import type { AcaoDoAtalho } from '../../../lib/leitor/atalhos';
import { lerEmVozAlta, pararLeitura } from '../../../lib/leitor/lerEmVoz';
import { fraseDoMotivo } from './ferramentasDeIaTextos';

const DitadoDaFrase = lazy(() => import('./DitadoDaFrase'));

export interface TrechoDoBalao {
  texto: string;
  /** A frase do trecho. */
  frase: string;
  /** O bloco (parágrafo) que contém o trecho. */
  paragrafo: string;
  idioma: string;
}

type Escopo = 'trecho' | 'frase' | 'paragrafo';
/** Parágrafo longo demais para o balão: traduz o começo (o resto segue pelo painel do capítulo). */
const MAX_PARAGRAFO = 1200;

/**
 * O BALÃO DA TRADUÇÃO (openspec `leitura-assistida`, fatia B): a tradução do trecho aparece flutuando junto dele, acima ou
 * abaixo, na mesma coluna, e nunca sobre o texto selecionado. Com o modo tradução ligado, traduz sozinho (pausa de 250 ms,
 * cancelando se a seleção mudar); desligado, abre quando a pessoa toca em "Traduzir". Ações: frase sob o dedo, parágrafo,
 * ler em voz alta, copiar, ditado e (com a flag de IA) "Ajustar nível". O texto do livro não sai do aparelho por aqui.
 */
export default function BalaoDaTraducao({
  trecho,
  rect,
  area,
  colunas,
  destino,
  estado,
  modoAuto,
  traduzir,
  aoTraduzir,
  aoFechar,
  aoAjustarNivel,
  comando,
}: {
  trecho: TrechoDoBalao;
  /** O trecho na janela do app (já fora do iframe). */
  rect: Caixa;
  /** O miolo visível do leitor, onde o balão pode ficar. */
  area: Area;
  colunas: 1 | 2;
  /** O idioma da tradução (o da pessoa). */
  destino: string;
  /** O estado da tradução no plano/idade (`estadoDaFerramenta('traduzir-trecho')`); indisponível mostra o motivo. */
  estado: EstadoDaFerramenta;
  /** Modo tradução ligado: traduz com a pausa de 250 ms (a seleção ainda pode mudar). Desligado: pedido explícito, na hora. */
  modoAuto: boolean;
  /** Traduz um texto (com cache de quem chama); `null` = não deu. */
  traduzir: (texto: string) => Promise<string | null>;
  aoTraduzir?: (texto: string, traducao: string) => void;
  aoFechar: () => void;
  /** Só com a flag `ia_ajustar_nivel`: abre o painel de ajuste de nível (fatia D). */
  aoAjustarNivel?: () => void;
  /** Um atalho de teclado (T, V, C): o `n` muda a cada tecla, para repetir a mesma ação. */
  comando?: { acao: AcaoDoAtalho; n: number } | null;
}) {
  const [escopo, setEscopo] = useState<Escopo>('trecho');
  const [traducao, setTraducao] = useState<EstadoDaTraducao>({ fase: 'ociosa' });
  const [lendo, setLendo] = useState(false);
  const [ditado, setDitado] = useState(false);
  const [aviso, setAviso] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState({ w: LARGURA_DO_BALAO, h: 140 });

  const textoDoEscopo = useMemo(() => {
    if (escopo === 'frase') return trecho.frase || trecho.texto;
    if (escopo === 'paragrafo') return (trecho.paragrafo || trecho.texto).slice(0, MAX_PARAGRAFO);
    return trecho.texto;
  }, [escopo, trecho]);
  const mesmoIdioma = !trecho.idioma || trecho.idioma === destino.split('-')[0];

  /* O controlador vive o tempo do balão; o `traduzir`/`aoTraduzir` mais novos entram por ref (sem refazer o controlador). */
  const traduzirRef = useRef(traduzir);
  traduzirRef.current = traduzir;
  const aoTraduzirRef = useRef(aoTraduzir);
  aoTraduzirRef.current = aoTraduzir;
  const textoRef = useRef(textoDoEscopo);
  textoRef.current = textoDoEscopo;
  const ctl = useMemo(
    () =>
      criarTraducaoAutomatica({
        traduzir: (x) => traduzirRef.current(x),
        aoMudar: (e) => {
          setTraducao(e);
          if (e.fase === 'pronta') aoTraduzirRef.current?.(textoRef.current, e.texto);
        },
      }),
    [],
  );
  useEffect(() => () => ctl.cancelar(), [ctl]);

  const disponivel = estado.disponivel && !mesmoIdioma;
  useEffect(() => {
    if (!disponivel) return;
    /* Modo automático: a pausa de 250 ms evita traduzir cada ajuste de alça; pedido explícito sai na hora. */
    ctl.agendar(textoDoEscopo, modoAuto && escopo === 'trecho' ? undefined : 0);
  }, [ctl, disponivel, textoDoEscopo, modoAuto, escopo]);

  /* A leitura em voz alta para junto com o balão (a seleção saiu). */
  useEffect(
    () => () => {
      pararLeitura();
    },
    [],
  );

  const ler = () => {
    if (lendo) {
      pararLeitura();
      setLendo(false);
      return;
    }
    setLendo(true);
    lerEmVozAlta(textoDoEscopo, trecho.idioma, () => setLendo(false));
  };
  const copiar = async () => {
    const pronta = traducao.fase === 'pronta' ? traducao.texto : '';
    const saida = pronta ? `${textoDoEscopo}\n\n${pronta}` : textoDoEscopo;
    try {
      await navigator.clipboard.writeText(saida);
      setAviso(t('Copiado.'));
    } catch {
      setAviso(t('Não deu para copiar. Selecione o texto e copie pelo menu.'));
    }
  };

  /* Os atalhos T, V e C chegam como comando. */
  const ultimo = useRef(0);
  useEffect(() => {
    if (!comando || comando.n === ultimo.current) return;
    ultimo.current = comando.n;
    if (comando.acao === 'traduzir') ctl.agendar(textoRef.current, 0);
    else if (comando.acao === 'ler') ler();
    else if (comando.acao === 'copiar') void copiar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ler` e `copiar` leem o estado de agora
  }, [comando]);

  /* Mede o balão para escolher o lado: reposiciona quando o conteúdo muda de tamanho. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const h = el.scrollHeight;
      const w = el.offsetWidth;
      setTamanho((a) => (Math.abs(a.h - h) > 1 || Math.abs(a.w - w) > 1 ? { w, h } : a));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    /* Medir no quadro seguinte: reposicionar dentro do callback do observador gera o aviso "loop completed". */
    let quadro = 0;
    const o = new ResizeObserver(() => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(medir);
    });
    o.observe(el);
    return () => {
      cancelAnimationFrame(quadro);
      o.disconnect();
    };
  }, []);

  const pos = posicionarBalao(rect, tamanho, area, colunaDoTrecho(rect, area, colunas));
  const temFrase = !!trecho.frase && trecho.frase !== trecho.texto;
  const temParagrafo = !!trecho.paragrafo && trecho.paragrafo !== trecho.texto && trecho.paragrafo !== trecho.frase;

  return (
    <div
      ref={ref}
      className="leitor-balao"
      data-lado={pos.lado}
      data-testid="balao-da-traducao"
      role="region"
      aria-label={t('Tradução do trecho')}
      style={{ left: pos.x, top: pos.y, width: pos.largura, maxHeight: Math.max(pos.alturaMax, 96) }}
    >
      <div className="leitor-balao-topo">
        {(temFrase || temParagrafo) && (
          <div className="leitor-balao-escopo" role="group" aria-label={t('O que traduzir')}>
            <button
              type="button"
              aria-pressed={escopo === 'trecho'}
              onClick={() => setEscopo('trecho')}
              className="leitor-alvo"
            >
              {t('Trecho')}
            </button>
            {temFrase && (
              <button
                type="button"
                aria-pressed={escopo === 'frase'}
                onClick={() => setEscopo('frase')}
                className="leitor-alvo"
              >
                {t('Frase')}
              </button>
            )}
            {temParagrafo && (
              <button
                type="button"
                aria-pressed={escopo === 'paragrafo'}
                onClick={() => setEscopo('paragrafo')}
                className="leitor-alvo"
              >
                {t('Parágrafo')}
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="leitor-balao-fechar leitor-alvo"
          aria-label={t('Fechar a tradução')}
          onClick={aoFechar}
        >
          <X aria-hidden />
        </button>
      </div>

      <div className="leitor-balao-corpo" role="status" aria-live="polite" lang={destino || undefined}>
        {!estado.disponivel ? (
          <span>{fraseDoMotivo(estado)}</span>
        ) : mesmoIdioma ? (
          <span>{t('Este trecho já está no seu idioma.')}</span>
        ) : traducao.fase === 'pronta' ? (
          <span data-testid="balao-traducao-texto">{traducao.texto}</span>
        ) : traducao.fase === 'falhou' ? (
          <span>{t('Não deu para traduzir agora. O tradutor do aparelho pode estar carregando; tente de novo.')}</span>
        ) : (
          <span className="leitor-balao-carregando">{t('Traduzindo…')}</span>
        )}
      </div>

      <div className="leitor-balao-acoes">
        <button type="button" className="leitor-alvo" onClick={ler} aria-pressed={lendo}>
          {lendo ? <Square aria-hidden /> : <Volume2 aria-hidden />}{' '}
          <span>{lendo ? t('Parar a leitura') : t('Ler em voz alta')}</span>
        </button>
        <button type="button" className="leitor-alvo" onClick={() => void copiar()}>
          <Copy aria-hidden /> <span>{t('Copiar')}</span>
        </button>
        {temFrase && (
          <button type="button" className="leitor-alvo" aria-pressed={ditado} onClick={() => setDitado((d) => !d)}>
            <Ear aria-hidden /> <span>{t('Ditado')}</span>
          </button>
        )}
        {aoAjustarNivel && (
          <button type="button" className="leitor-alvo" data-testid="balao-ajustar-nivel" onClick={aoAjustarNivel}>
            <SlidersHorizontal aria-hidden /> <span>{t('Ajustar nível')}</span>
          </button>
        )}
      </div>
      {aviso && (
        <p className="leitor-apoio" role="status">
          {aviso}
        </p>
      )}
      {ditado && temFrase && (
        <Suspense fallback={null}>
          <DitadoDaFrase frase={trecho.frase} idioma={trecho.idioma} />
        </Suspense>
      )}
    </div>
  );
}
