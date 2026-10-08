import { Check, Gamepad2, Sprout } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { ThemeType } from '../../../../lib/appearance';
import { tocarPreviaDoEfeito } from '../../../../lib/comemoracao';
import { comprarPecaComSeeds } from '../../../../lib/galeria/comprarPeca';
import { numero, t } from '../../../../lib/i18n';
import { CATALOGO_DA_LOJA, COR_DA_RARIDADE, estadoDoItem, type ItemDaLoja } from '../../../../lib/loja';
import {
  abaAVista,
  armarCompra,
  type ArteDaLoja,
  centro,
  comemorarCompra,
  desarmarCompra,
  entrarDepoisDe,
  previaDoEfeito,
  sentirMoeda,
} from '../../../../lib/polimento/personalizar';
import MiniaturaDoItem from '../../../MiniaturaDoItem';
import { toast } from '../../../Toast';

/**
 * A LOJA DO PROTÓTIPO (`telas2.js:384-403, 429-477`, `telas2.css:190-247`; itens D42–D44).
 *
 * A carteira de Seeds, as categorias e a prateleira: cada peça com a arte, a raridade, o preço e o
 * botão de SEGURAR PARA COMPRAR (1100 ms): gastar Seeds não pode acontecer num toque sem querer.
 *
 * A PRATELEIRA É A DO CATÁLOGO: o que tem preço em Seeds e ainda não é seu (a mesma régua de
 * `VitrineV2`), a mais barata primeiro. A compra é a de sempre (`comprarPecaComSeeds`): o servidor
 * arbitra, e o `spendId` fixo por peça não cobra duas vezes.
 */

type Categoria = 'tudo' | 'tema' | 'legenda' | 'cartao' | 'efeitos' | 'particulas';
/* As seis de `telas2.js:385`, com os tipos do catálogo que cada uma junta. */
const CATEGORIAS: Array<{ id: Categoria; nome: string; tipos?: string[] }> = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'tema', nome: 'Temas', tipos: ['tema'] },
  { id: 'legenda', nome: 'Legendas', tipos: ['legenda'] },
  { id: 'cartao', nome: 'Cartões', tipos: ['cartao'] },
  { id: 'efeitos', nome: 'Efeitos de jogo', tipos: ['efeito-acerto', 'efeito-combo', 'finalizacao'] },
  { id: 'particulas', nome: 'Partículas e rastros', tipos: ['particulas', 'rastro'] },
];
const categoriaDe = (item: ItemDaLoja): string =>
  CATEGORIAS.find((c) => c.tipos?.includes(item.tipo))?.nome ?? COR_DA_RARIDADE[item.raridade].rotulo;

const EFEITOS = new Set(['efeito-acerto', 'efeito-combo', 'finalizacao']);

/**
 * A arte em CSS do protótipo que desenha esta peça (`telas2.js:315-334`), quando ela é uma das que o
 * protótipo desenhou. As outras peças do catálogo mostram a miniatura de sempre, na mesma moldura.
 */
export function arteDoItem(item: ItemDaLoja): ArteDaLoja | undefined {
  const alvo = `${item.id} ${item.alvo}`.toLowerCase();
  if (item.tipo === 'legenda') return /fita/.test(alvo) ? 'fita' : /cinema/.test(alvo) ? 'legenda' : undefined;
  if (item.tipo === 'cartao') return /caderno/.test(alvo) ? 'cartao' : undefined;
  if (item.tipo === 'tema' || item.tipo === 'galeria') return /pastel/.test(alvo) ? 'paleta' : undefined;
  if (/pixel/.test(alvo)) return 'pixel';
  if (/confete/.test(alvo)) return 'confete';
  if (/brasa/.test(alvo)) return 'brasa';
  return undefined;
}

const PASTEIS = ['#f6c9c0', '#f8e3b5', '#cfe8cf', '#c6dff2', '#dccdf0', '#f3cde1'];
const frase = (
  <>
    <b>
      We ship the <u>roadmap</u> today.
    </b>
    <i>Entregamos o roteiro hoje.</i>
  </>
);
/* `ARTE` de `telas2.js:326-334`. */
const ARTE: Record<ArteDaLoja, ReactNode> = {
  legenda: <span className="px-arte-leg">{frase}</span>,
  fita: <span className="px-arte-leg fita">{frase}</span>,
  pixel: (
    <span className="px-arte-pixel">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  ),
  cartao: (
    <span className="px-arte-cartao">
      <b>roadmap</b>
      <i>roteiro</i>
    </span>
  ),
  brasa: <span className="px-arte-brasa">×3</span>,
  paleta: (
    <span className="px-arte-paleta">
      {PASTEIS.map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  ),
  confete: (
    <span className="px-arte-confete">
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  ),
};

export default function LojaDoPrototipo({
  nivel,
  saldo,
  mostrado,
  versao,
  aoMudar,
  aoContarSeeds,
  aoProvarTema,
  aoUsar,
  aoGanhar,
}: {
  nivel: number;
  saldo: number;
  /** As Seeds como o cabeçalho as mostra agora (contam depois de uma compra). */
  mostrado: number;
  versao: number;
  /** Algo mudou (compra): a tela de fora relê a posse. */
  aoMudar: () => void;
  aoContarSeeds: (de: number, ate: number, ms: number) => void;
  aoProvarTema: (id: ThemeType) => void;
  /** O que já é seu: equipa (ou abre a folha "Meu visual" na seção da peça). */
  aoUsar: (item: ItemDaLoja) => void;
  /** "Ganhar jogando" leva ao Jogar (`telas2.js:592`). */
  aoGanhar: () => void;
}) {
  const [cat, setCat] = useState<Categoria>('tudo');
  const [comprando, setComprando] = useState<string | null>(null);
  const [recemComprados] = useState(() => new Set<string>());
  const cats = useRef<HTMLDivElement>(null);

  /* Trocar de categoria: a prateleira entra pelo lado (`repintar(…, 1, '.px-cats')`, `telas2.js:589`). */
  const primeira = useRef(true);
  useLayoutEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    entrarDepoisDe(cats.current, 1);
    /* `repintar` também leva a categoria escolhida para o meio da barra (`sentidos.js:305`). */
    const quadro = requestAnimationFrame(() => abaAVista(cats.current));
    return () => cancelAnimationFrame(quadro);
  }, [cat]);

  /* O que tem preço em Seeds, não é seu (ou acabou de ser comprado aqui) e não é exclusivo. */
  const itens = useMemo(() => {
    const tipos = CATEGORIAS.find((c) => c.id === cat)?.tipos;
    return CATALOGO_DA_LOJA.filter((i) => {
      if (i.exclusivoDe || i.origemMaestria || i.precoCreditos !== undefined) return false;
      if (tipos && !tipos.includes(i.tipo)) return false;
      if (estadoDoItem(i, nivel, saldo).estado === 'equipavel') return recemComprados.has(i.id);
      return i.precoSeeds !== undefined;
    }).sort((a, b) => (a.precoSeeds ?? 0) - (b.precoSeeds ?? 0));
  }, [nivel, saldo, cat, versao]); // eslint-disable-line react-hooks/exhaustive-deps -- `versao` relê a posse depois da compra

  /** O dedo ficou até o fim (`telas2.js:451-472`): a compra de verdade, e a festa se ela valeu. */
  const comprar = async (item: ItemDaLoja, b: HTMLElement) => {
    if (comprando) return;
    const cartao = b.closest('.px-item');
    const [x, y] = centro(cartao ?? b);
    const preco = item.precoSeeds ?? 0;
    setComprando(item.id);
    let r: Awaited<ReturnType<typeof comprarPecaComSeeds>>;
    try {
      r = await comprarPecaComSeeds(item);
    } finally {
      setComprando(null);
    }
    if (!r.ok) {
      desarmarCompra(b);
      toast.warn(
        r.faltam > 0
          ? t('Faltam {n} Seeds para levar {nome}. Nada foi cobrado.', { n: r.faltam, nome: item.nome })
          : t('Não deu para completar a compra agora. Nada foi cobrado.'),
      );
      return;
    }
    recemComprados.add(item.id);
    /* O saldo é relido do servidor: as outras peças passam a contar com o que sobrou. */
    window.dispatchEvent(new CustomEvent('babel:metricas-mudaram'));
    sentirMoeda();
    /* O cartão novo precisa estar na tela antes da festa: é ele que gira. */
    flushSync(aoMudar);
    /* "Equipar agora" depois da compra, como o app sempre ofereceu: a ação mora no aviso. */
    toast.ok(t('{nome} agora é seu.', { nome: item.nome }), {
      action: { label: t('Equipar agora'), onClick: () => aoUsar(item) },
    });
    aoContarSeeds(saldo, saldo - preco, 900);
    const novo = [...document.querySelectorAll<HTMLElement>('.px-item')].find((el) => el.dataset.itemId === item.id);
    comemorarCompra(x, y, novo ?? null);
  };

  /** "Ver prévia" (`previaDoEfeito`, `telas2.js:429-434`). */
  const previa = (item: ItemDaLoja, arte: ArteDaLoja | undefined, el: HTMLElement) => {
    if (previaDoEfeito(arte, el)) return;
    /* Um efeito de jogo sem arte do protótipo toca a própria rajada, na peça. */
    if (EFEITOS.has(item.tipo)) {
      tocarPreviaDoEfeito(item.tipo as Parameters<typeof tocarPreviaDoEfeito>[0], item.alvo, el);
      return;
    }
    if (item.tipo === 'tema') aoProvarTema(item.alvo as ThemeType);
    toast.info(t('Prévia aplicada na vitrine da Coleção.'));
  };

  return (
    <>
      <section className="q-cartao px-carteira" data-testid="carteira-de-seeds">
        <span className="q-ic">
          <Sprout aria-hidden />
        </span>
        <div>
          <p className="q-rotulo">Seeds</p>
          <b className="px-saldo">{numero(mostrado)}</b>
          <p className="q-d">
            {t('Vêm de estudar e compram tudo o que está na prateleira de Seeds. Não se compram com dinheiro.')}
          </p>
        </div>
        <button type="button" className="q-ctl" data-px="ganhar" onClick={aoGanhar}>
          <Gamepad2 aria-hidden /> {t('Ganhar jogando')}
        </button>
      </section>

      <div className="q-abas q-seg px-cats" role="group" aria-label={t('Categoria')} ref={cats}>
        {CATEGORIAS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="q-aba"
            aria-checked={cat === c.id}
            data-px-cat={c.nome}
            onClick={() => setCat(c.id)}
          >
            {t(c.nome)}
          </button>
        ))}
      </div>

      <div className="px-loja" data-testid="prateleira-de-seeds">
        {itens.length === 0 && (
          <div className="q-vazio">
            <h2>{t('Nada nesta prateleira ainda')}</h2>
          </div>
        )}
        {itens.map((item) => {
          const tem = estadoDoItem(item, nivel, saldo).estado === 'equipavel';
          const preco = item.precoSeeds ?? 0;
          const falta = Math.max(0, preco - saldo);
          const arte = arteDoItem(item);
          return (
            <article
              key={item.id}
              className={`q-cartao px-item${tem ? ' tem' : ''}`}
              data-item={item.nome}
              data-item-id={item.id}
            >
              <div className="px-arte" data-arte={arte}>
                {arte ? ARTE[arte] : <MiniaturaDoItem item={item} tam="grande" />}
              </div>
              <p className="q-rotulo">
                <span className="q-tag">{t(COR_DA_RARIDADE[item.raridade].rotulo)}</span> {t(categoriaDe(item))}
              </p>
              <h3>{item.nome}</h3>
              <p className="q-d">{item.desc}</p>
              <div className="px-item-pe">
                {tem ? (
                  /* A etiqueta do protótipo, com o toque que equipa o que já é seu. */
                  <span
                    className="q-tag"
                    role="button"
                    tabIndex={0}
                    data-px="usar"
                    onClick={() => aoUsar(item)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      aoUsar(item);
                    }}
                  >
                    <Check aria-hidden /> {t('Na sua coleção')}
                  </span>
                ) : (
                  <>
                    <span className="q-chip px-preco-seeds" data-preco-seeds>
                      <Sprout aria-hidden /> {numero(preco)}
                    </span>
                    {falta ? (
                      <span className="px-falta">
                        <span className="q-barra">
                          <span style={{ width: `${Math.round((saldo / preco) * 100)}%` }} />
                        </span>
                        <small>{t('Faltam {n} Seeds', { n: falta })}</small>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="q-ctl pri px-segurar"
                        data-px-comprar={item.nome}
                        aria-busy={comprando === item.id || undefined}
                        onPointerDown={(e) => {
                          const b = e.currentTarget;
                          if (!comprando) armarCompra(b, () => void comprar(item, b));
                        }}
                        /* Pelo teclado, segurar Enter ou Espaço vale o mesmo que segurar o dedo. */
                        onKeyDown={(e) => {
                          if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat || comprando) return;
                          e.preventDefault();
                          const b = e.currentTarget;
                          armarCompra(b, () => void comprar(item, b));
                        }}
                        onKeyUp={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') e.currentTarget.dispatchEvent(new Event('pointerup'));
                        }}
                      >
                        <span className="px-segurar-fundo" aria-hidden="true" />
                        <span>{t('Segure para comprar')}</span>
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="q-ctl"
                  data-px-previa={arte ?? item.tipo}
                  onClick={(e) => previa(item, arte, e.currentTarget)}
                >
                  {t('Ver prévia')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
