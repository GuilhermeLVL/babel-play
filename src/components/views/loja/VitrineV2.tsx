import { REGRAS, VITRINE_DE_CREDITOS } from '@core';
import { Check, Coins, Eye, Lock, MonitorSmartphone, Sprout } from 'lucide-react';
import { Fragment, useId, useMemo, useState } from 'react';

import type { Carteira } from '../../../lib/carteira';
import { celebrarEscolha } from '../../../lib/comemoracao';
import { comprarPecaComCreditos, mensagemDaRecusaDeCreditos } from '../../../lib/galeria/comprarComCreditos';
import { comprarPecaComSeeds } from '../../../lib/galeria/comprarPeca';
import { type ContextoDeEquipar, equiparItem, equipavel } from '../../../lib/galeria/equipar';
import { TEXTOS } from '../../../lib/galeria/textos';
import { t } from '../../../lib/i18n';
import { CATALOGO_DA_LOJA, COR_DA_RARIDADE, estadoDoItem, type ItemDaLoja } from '../../../lib/loja';
import MiniaturaDoItem from '../../MiniaturaDoItem';
import { toast } from '../../Toast';
import { DialogoBase, TituloDeSecao } from '../../ui';
import ComprarCreditos from './ComprarCreditos';

/**
 * A ABA LOJA DE PERSONALIZAR (recompensas v2, Task 5.4 — spec 6 e 10.3).
 *
 * DUAS PRATELEIRAS, NUNCA MISTURADAS: a de Seeds (a moeda de estudo) e a de Créditos (a moeda paga).
 * Cada cartão mostra a peça como ela aparece (a miniatura real), "Ver prévia" quando ela tem onde
 * aparecer, e o preço à vista.
 *
 * A PRATELEIRA DE CRÉDITOS só existe quando a carteira existe (`carteira.disponivel`: há conta e
 * cobrança), fora do perfil protegido e fora da edição estática — quem decide é a tela de fora
 * (`mostrarCreditos`), e o servidor recusa de novo (403 `menor_nao_compra`). A compra tem DUAS
 * ETAPAS: "Comprar com Créditos" abre a prévia com o preço e o saldo depois; só "Confirmar compra"
 * gasta. Não existe compra num clique.
 *
 * Os itens de Créditos são os que têm `precoCreditos` no catálogo — a mesma régua de
 * `VITRINE_DE_CREDITOS` (`core/loja.ts`) e do `POST /api/billing/gastar`.
 */

type Filtro = 'tudo' | 'tema' | 'legenda' | 'cartao' | 'efeitos' | 'particulas';
const FILTROS: Array<{ id: Filtro; nome: string; tipos?: string[] }> = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'tema', nome: 'Temas', tipos: ['tema'] },
  { id: 'legenda', nome: 'Legendas', tipos: ['legenda'] },
  { id: 'cartao', nome: 'Cartões', tipos: ['cartao'] },
  { id: 'efeitos', nome: 'Efeitos de jogo', tipos: ['efeito-acerto', 'efeito-combo', 'finalizacao'] },
  { id: 'particulas', nome: 'Partículas e rastros', tipos: ['particulas', 'rastro'] },
];

const LINHA_DE_PRECO = { font: '600 11.5px var(--font-mono)', color: 'var(--ink-muted)' } as const;

/** Rastro só existe com ponteiro fino (mouse): no celular a peça não aparece, e a tela diz. */
function ponteiroFino(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
}

export default function VitrineV2({
  nivel,
  saldo,
  carteira,
  mostrarCreditos,
  ctxEquipar,
  equipadoAtual,
  aoPrever,
  itemEmPrevia,
  tiposComPrevia,
  aoMudar,
}: {
  nivel: number;
  saldo: number;
  carteira: Carteira;
  /** Carteira disponível, sem perfil protegido e fora da edição estática. */
  mostrarCreditos: boolean;
  ctxEquipar: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
  aoPrever: (item: ItemDaLoja, el: HTMLElement) => void;
  itemEmPrevia: string | null;
  tiposComPrevia: ReadonlySet<string>;
  /** Algo mudou (compra, equipar): a tela de fora relê saldo e posse. */
  aoMudar: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [comprando, setComprando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<ItemDaLoja | null>(null);
  const [recemComprados] = useState(() => new Set<string>());
  const [versao, setVersao] = useState(0);
  const fino = ponteiroFino();

  const doFiltro = (i: ItemDaLoja) => {
    const f = FILTROS.find((x) => x.id === filtro);
    return !f?.tipos || f.tipos.includes(i.tipo);
  };

  /* SEEDS: o que tem preço em Seeds, não é seu (ou acabou de ser comprado aqui) e não é exclusivo. */
  const deSeeds = useMemo(
    () =>
      CATALOGO_DA_LOJA.filter((i) => {
        if (i.exclusivoDe || i.origemMaestria || i.precoCreditos !== undefined) return false;
        const est = estadoDoItem(i, nivel, saldo).estado;
        if (est === 'equipavel') return recemComprados.has(i.id);
        return i.precoSeeds !== undefined;
      })
        .filter(doFiltro)
        .sort((a, b) => (a.precoSeeds ?? 0) - (b.precoSeeds ?? 0)),
    [nivel, saldo, filtro, versao], // eslint-disable-line react-hooks/exhaustive-deps -- `versao` relê a posse depois da compra
  );
  const deCreditos = useMemo(
    () => VITRINE_DE_CREDITOS.filter(doFiltro),
    [filtro], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const comprarSeeds = async (item: ItemDaLoja, el: HTMLElement) => {
    setComprando(item.id);
    try {
      const r = await comprarPecaComSeeds(item);
      if (!r.ok) {
        toast.warn(
          r.faltam > 0
            ? t('Faltam {n} Seeds para levar {nome}. Nada foi cobrado.', { n: r.faltam, nome: item.nome })
            : t('Não deu para completar a compra agora. Nada foi cobrado.'),
        );
        return;
      }
      recemComprados.add(item.id);
      celebrarEscolha(el, t('Seu!'));
      toast.ok(t('{nome} é seu!', { nome: item.nome }));
      setVersao((v) => v + 1);
      aoMudar();
    } finally {
      setComprando(null);
    }
  };

  const confirmarCreditos = async (item: ItemDaLoja) => {
    setComprando(item.id);
    try {
      const r = await comprarPecaComCreditos(item);
      if (!r.ok) {
        toast.warn(mensagemDaRecusaDeCreditos(r.motivo ?? 'falha'));
        return;
      }
      celebrarEscolha(null, t('Seu!'));
      toast.ok(t('{nome} é seu!', { nome: item.nome }));
      carteira.recarregar();
      setConfirmando(null);
      aoMudar();
    } finally {
      setComprando(null);
    }
  };

  const equipar = (item: ItemDaLoja, el: HTMLElement) => {
    if (equiparItem(item, ctxEquipar)) {
      celebrarEscolha(el, TEXTOS.emUso);
      setVersao((v) => v + 1);
      aoMudar();
    }
  };

  const previa = (item: ItemDaLoja) =>
    tiposComPrevia.has(item.tipo) ? (
      <button
        type="button"
        className="link editar"
        aria-pressed={itemEmPrevia === item.id}
        onClick={(e) => aoPrever(item, e.currentTarget)}
      >
        <Eye aria-hidden /> {t('Ver prévia')}
      </button>
    ) : null;

  const cartaoDeSeeds = (item: ItemDaLoja) => {
    const { estado } = estadoDoItem(item, nivel, saldo);
    const preco = item.precoSeeds ?? 0;
    const seu = estado === 'equipavel';
    const eq = seu && equipadoAtual(item);
    return (
      <article className="cartao peca" data-item-da-loja={item.id}>
        <div className="vis">
          <MiniaturaDoItem item={item} tam="grande" />
        </div>
        <span className="label-mono">{COR_DA_RARIDADE[item.raridade].rotulo}</span>
        <h3>{item.nome}</h3>
        <p>{item.desc}</p>
        <div className="entre" style={LINHA_DE_PRECO}>
          <span className="linha tn" data-preco-seeds style={{ gap: 4, color: 'var(--good-ink)' }}>
            <Sprout aria-hidden style={{ width: 13, height: 13 }} /> {preco}
          </span>
          {!seu && saldo < preco && (
            <span className="linha" style={{ gap: 4 }}>
              <Lock aria-hidden style={{ width: 12, height: 12 }} /> {t('faltam {n}', { n: preco - saldo })}
            </span>
          )}
        </div>
        {seu ? (
          equipavel(item) && (
            <button
              type="button"
              className={`btn ${eq ? 'equipado' : 'btn-outline'} bloco`}
              aria-pressed={eq || undefined}
              onClick={(e) => equipar(item, e.currentTarget)}
            >
              {eq ? (
                <>
                  <Check aria-hidden /> {TEXTOS.emUso}
                </>
              ) : (
                TEXTOS.equiparAgora
              )}
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn btn-solid bloco"
            disabled={comprando === item.id || saldo < preco}
            onClick={(e) => void comprarSeeds(item, e.currentTarget)}
          >
            {comprando === item.id
              ? t('Comprando…')
              : saldo < preco
                ? t('Faltam {n} Seeds', { n: preco - saldo })
                : t('Comprar com Seeds')}
          </button>
        )}
        {previa(item)}
      </article>
    );
  };

  const cartaoDeCreditos = (item: ItemDaLoja) => {
    const { estado } = estadoDoItem(item, nivel, saldo);
    const seu = estado === 'equipavel';
    const preco = item.precoCreditos ?? 0;
    const saldoC = carteira.creditos ?? 0;
    const soNoComputador = item.tipo === 'rastro' && !fino;
    return (
      <article className="cartao peca" data-item-de-credito={item.id}>
        <div className="vis">
          <MiniaturaDoItem item={item} tam="grande" />
        </div>
        <span className="label-mono">{COR_DA_RARIDADE[item.raridade].rotulo}</span>
        <h3>{item.nome}</h3>
        <p>
          {item.desc}
          {soNoComputador && (
            <>
              <br />
              <MonitorSmartphone aria-hidden style={{ width: 13, height: 13, verticalAlign: -2, marginRight: 4 }} />
              {t('Rastro de mouse: aparece só no computador, não neste aparelho.')}
            </>
          )}
        </p>
        <div className="entre" style={LINHA_DE_PRECO}>
          <span className="linha tn" style={{ gap: 4, color: 'var(--premium)' }}>
            <Coins aria-hidden style={{ width: 13, height: 13 }} /> {preco}
          </span>
        </div>
        {seu ? (
          <button type="button" className="btn btn-outline bloco" onClick={(e) => equipar(item, e.currentTarget)}>
            {equipadoAtual(item) ? TEXTOS.emUso : TEXTOS.equiparAgora}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-solid bloco"
            disabled={saldoC < preco}
            onClick={() => setConfirmando(item)}
          >
            {saldoC < preco ? t('Faltam {n} Créditos', { n: preco - saldoC }) : t('Comprar com Créditos')}
          </button>
        )}
      </article>
    );
  };

  return (
    <section className="secao" data-testid="vitrine-v2">
      <div className={mostrarCreditos ? 'g2' : undefined}>
        <div className="cartao p5">
          <div className="entre">
            <h3 className="linha" style={{ gap: 8, fontSize: 15, fontWeight: 800 }}>
              <Sprout aria-hidden style={{ width: 16, height: 16, color: 'var(--good)' }} /> Seeds
            </h3>
            <b className="tn" data-saldo-seeds style={{ font: '800 17px var(--font-mono)', color: 'var(--good-ink)' }}>
              {saldo}
            </b>
          </div>
          <p className="mut" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
            {t('Vêm de estudar e compram tudo o que está na prateleira de Seeds. Não se compram com dinheiro.')}
          </p>
        </div>
        {mostrarCreditos && (
          <div className="cartao p5" data-testid="carteira-de-creditos">
            <div className="entre">
              <h3 className="linha" style={{ gap: 8, fontSize: 15, fontWeight: 800 }}>
                <Coins aria-hidden style={{ width: 16, height: 16, color: 'var(--premium)' }} /> {t('Créditos')}
              </h3>
              <b className="tn" style={{ font: '800 17px var(--font-mono)', color: 'var(--premium)' }}>
                {carteira.creditos ?? '—'}
              </b>
            </div>
            <p className="mut" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
              {t(
                'Compram-se com dinheiro e compram só enfeite, com prévia e preço à vista. Nível, XP, Seeds, maestria e conquista só saem estudando.',
              )}
            </p>
          </div>
        )}
      </div>

      <div className="chips" role="group" aria-label={t('Filtrar a Loja')} style={{ marginTop: 20 }}>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="pill"
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
          >
            {t(f.nome)}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <TituloDeSecao
          nivel="h3"
          icone={Sprout}
          titulo={t('Com Seeds')}
          desc={t('A mais barata primeiro. Nada aqui expira.')}
        />
      </div>
      {deSeeds.length ? (
        <div className="gauto">
          {deSeeds.map((i) => (
            <Fragment key={i.id}>{cartaoDeSeeds(i)}</Fragment>
          ))}
        </div>
      ) : (
        <p className="mut" style={{ fontSize: 13 }}>
          {t('Nada para comprar neste filtro: tudo já é seu.')}
        </p>
      )}

      {mostrarCreditos && deCreditos.length > 0 && (
        <>
          <div style={{ marginTop: 28 }} />
          <TituloDeSecao
            nivel="h3"
            icone={Coins}
            titulo={t('Com Créditos')}
            desc={t('Peças avulsas, com prévia e preço. A compra pede confirmação.')}
          />
          <div className="gauto">
            {deCreditos.map((i) => (
              <Fragment key={i.id}>{cartaoDeCreditos(i)}</Fragment>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <ComprarCreditos />
          </div>
        </>
      )}

      <p className="mut" style={{ fontSize: 12.5, marginTop: 18 }}>
        {t('Seeds se ganham fazendo:')}{' '}
        {REGRAS.filter((r) => r.seeds > 0)
          .slice(0, 4)
          .map((r) => `${r.seeds} ${r.unidade}`)
          .join(' · ')}
        .
      </p>

      {confirmando && (
        <ConfirmarCompra
          item={confirmando}
          saldo={carteira.creditos ?? 0}
          comprando={comprando === confirmando.id}
          aoConfirmar={() => void confirmarCreditos(confirmando)}
          aoCancelar={() => setConfirmando(null)}
        />
      )}
    </section>
  );
}

/** A SEGUNDA ETAPA: a peça em prévia, o preço, o saldo depois — e só então o gasto. */
function ConfirmarCompra({
  item,
  saldo,
  comprando,
  aoConfirmar,
  aoCancelar,
}: {
  item: ItemDaLoja;
  saldo: number;
  comprando: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const id = useId();
  const preco = item.precoCreditos ?? 0;
  return (
    <DialogoBase classe="medio" rotuloId={id} aoFechar={aoCancelar}>
      <div className="p5" data-testid="confirmar-compra">
        <span className="label-mono">{t('Confirmar compra')}</span>
        <h2 id={id} style={{ font: '800 20px var(--font-display)', margin: '6px 0 12px' }}>
          {item.nome}
        </h2>
        <div className="cartao p5" style={{ display: 'grid', placeItems: 'center', minHeight: 96 }}>
          <MiniaturaDoItem item={item} tam="grande" />
        </div>
        <p className="mut" style={{ fontSize: 13, margin: '12px 0' }}>
          {item.desc}
        </p>
        <div className="entre tn" style={{ fontSize: 13.5 }}>
          <span>{t('Preço')}</span>
          <b style={{ color: 'var(--premium)' }}>{t('{n} Créditos', { n: preco })}</b>
        </div>
        <div className="entre tn" style={{ fontSize: 13.5, marginTop: 4 }}>
          <span>{t('Saldo depois')}</span>
          <b>{t('{n} Créditos', { n: Math.max(0, saldo - preco) })}</b>
        </div>
        <div className="linha" style={{ gap: 8, marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={aoCancelar} data-autofocus>
            {t('Cancelar')}
          </button>
          <button type="button" className="btn btn-solid" onClick={aoConfirmar} disabled={comprando}>
            {comprando ? t('Comprando…') : t('Confirmar compra')}
          </button>
        </div>
      </div>
    </DialogoBase>
  );
}
