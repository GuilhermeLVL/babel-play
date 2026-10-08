import '../../../../styles/questPersonalizar.css';

import { Map as MapIcon, Shirt, ShoppingBag, Sprout, Trophy } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { MaestriaNoServidor } from '../../../../data/api';
import type { ThemeType } from '../../../../lib/appearance';
import { useCarteira } from '../../../../lib/carteira';
import { contarConquistas } from '../../../../lib/conquistas';
import { edicaoEstatica } from '../../../../lib/edicaoEstatica';
import { type ContextoDeEquipar, equiparItem, equipavel, estaEquipado } from '../../../../lib/galeria/equipar';
import { estadoDaColecao } from '../../../../lib/galeria/progressao';
import { numero, t } from '../../../../lib/i18n';
import { estaAnonimo } from '../../../../lib/identidade';
import { irPara } from '../../../../lib/irPara';
import type { ItemDaLoja } from '../../../../lib/loja';
import { sincronizarMaestria } from '../../../../lib/maestria';
import { revelarEmCirculo } from '../../../../lib/movimento/revelar';
import { contar } from '../../../../lib/polimento/base';
import { abaAVista } from '../../../../lib/polimento/personalizar';
import { perfilProtegido } from '../../../../lib/protecaoDoMenor';
import { type AbaDaLojaV2, normalizarAbaDaLojaV2 } from '../../../../lib/rotas';
import { useTemporada } from '../../../../lib/temporada';
import { applyTheme } from '../../../../lib/theme';
import CartaoDeConvite from '../../../conta/CartaoDeConvite';
import { toast } from '../../../Toast';
import Conquistas from '../../Conquistas';
import type { LojaProps } from '../../loja/propsDaLoja';
import PainelDeMaestria from '../../maestria/PainelDeMaestria';
import ColecaoDoPrototipo from './ColecaoDoPrototipo';
import { FolhaDeCreditos, FolhaDoVisual, secaoDoTipo } from './FolhasDoPersonalizar';
import LojaDoPrototipo from './LojaDoPrototipo';
import TemporadaDoPrototipo from './TemporadaDoPrototipo';

/**
 * PERSONALIZAR COMO NO PROTÓTIPO (`fidelidade/casca-e-telas.md`, 4.6; itens D34–D44).
 *
 * A marcação é a de `telas2.js:348-407` e `telas3.js:123-150`: o cabeçalho com as Seeds, as cinco abas
 * (Coleção, Maestria, Temporada, Conquistas, Loja) e, em Coleção, Temporada e Loja, o desenho novo.
 * Maestria e Conquistas ficam como em produção (`telas2.js:406`).
 *
 * O DADO É O DO APP: os temas, as Seeds, a temporada e a prateleira saem do catálogo e do servidor; a
 * compra, o equipar e o resgate passam pelas mesmas portas de sempre (`comprarPecaComSeeds`,
 * `equiparItem`, o crédito `temporada:` conferido no servidor).
 *
 * PROVAR UM TEMA NÃO EQUIPA (`telas2.js:409-428`): a cor se abre em círculo a partir do toque e vale
 * só enquanto esta tela está aberta. Sair de Personalizar devolve o tema equipado.
 */
const ABAS: AbaDaLojaV2[] = ['colecao', 'maestria', 'temporada', 'conquistas', 'loja'];
/* Coleção, Temporada e Loja são as redesenhadas (`telas2.js:404-408`). */
const REDESENHADA: ReadonlySet<AbaDaLojaV2> = new Set(['colecao', 'temporada', 'loja']);

export default function PersonalizarDoPrototipo({
  progress,
  theme,
  setTheme,
  fonte,
  setFonte,
  menuPosition,
  setMenuPosition,
  onOpenStudio,
  ctxConquistas,
  ageProfile,
  setAgeProfile,
  abaInicial,
  aoTrocarDeAba,
  equiparCtx,
  onEntrar,
}: LojaProps) {
  const [aba, setAbaInterna] = useState<AbaDaLojaV2>(normalizarAbaDaLojaV2(abaInicial) ?? 'colecao');
  useEffect(() => {
    const alvo = normalizarAbaDaLojaV2(abaInicial);
    if (alvo) setAbaInterna(alvo);
  }, [abaInicial]);
  const setAba = useCallback(
    (a: AbaDaLojaV2) => {
      setAbaInterna(a);
      aoTrocarDeAba?.(a);
    },
    [aoTrocarDeAba],
  );

  /* No celular a barra de abas rola de lado: a aba escolhida vai para o meio (`sentidos.js:292-305`). */
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const quadro = requestAnimationFrame(() => abaAVista(barra.current));
    return () => cancelAnimationFrame(quadro);
  }, [aba]);

  const [versao, setVersao] = useState(0);
  const aoMudar = useCallback(() => setVersao((v) => v + 1), []);
  const nivel = progress.available ? progress.level : 1;
  const saldo = progress.available ? progress.seeds : 0;
  const ctxEquipar: ContextoDeEquipar = equiparCtx ?? {
    setTheme,
    setFonte,
    setMenuPosition,
    onOpenStudio,
    nivel,
    saldo,
  };
  const semConta = estaAnonimo() && !edicaoEstatica();

  const temporada = useTemporada((seeds) =>
    toast.ok(t('Temporada: +{n} Seeds dos níveis que você alcançou.', { n: seeds })),
  );
  const [maestria, setMaestria] = useState<MaestriaNoServidor[] | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void sincronizarMaestria()
      .then((r) => vivo && setMaestria(r))
      .catch(() => vivo && setMaestria(null));
    return () => {
      vivo = false;
    };
  }, []);

  /* ── AS SEEDS DO CABEÇALHO: contam quando uma compra ou um resgate muda o saldo
        (`telas2.js:465, 606`); fora disso, mostram o saldo do app. ── */
  const [mostrado, setMostrado] = useState(saldo);
  const alvoDaContagem = useRef<number | null>(null);
  useEffect(() => {
    if (alvoDaContagem.current === saldo) return;
    alvoDaContagem.current = null;
    setMostrado(saldo);
  }, [saldo]);
  const contarSeeds = useCallback((de: number, ate: number, ms: number) => {
    alvoDaContagem.current = ate;
    contar(setMostrado, de, ate, ms);
  }, []);

  /* ── O QUE O PROTÓTIPO NÃO DESENHA E O APP PRECISA OFERECER: o inventário inteiro e os Créditos, em
        folhas que abrem do que já está na tela (as linhas-resumo, o que já é seu, o chip de Seeds). ── */
  const [folha, setFolha] = useState<string | null>(null);
  const [creditosAbertos, setCreditosAbertos] = useState(false);
  const carteira = useCarteira();
  /* A mesma condição de `PersonalizarV2`: há carteira, fora do perfil protegido e da edição estática. */
  const mostrarCreditos = carteira.disponivel && !perfilProtegido() && !edicaoEstatica();
  /** O que já é seu: equipa pelo caminho de sempre; o que não se equipa abre a folha na seção dele. */
  const usarItem = (item: ItemDaLoja) => {
    if (equipavel(item) && equiparItem(item, ctxEquipar)) {
      aoMudar();
      toast.ok(t('{nome} equipado.', { nome: item.nome }));
      return;
    }
    setFolha(secaoDoTipo(item.tipo));
  };

  /* ── O TEMA EM PROVA (`telas2.js:300-301, 409-428`) ── */
  const [emProva, setEmProva] = useState<ThemeType | null>(null);
  const equipado = useRef(theme);
  equipado.current = theme;
  const provando = useRef<ThemeType | null>(null);
  provando.current = emProva;
  const provarTema = useCallback((id: ThemeType) => {
    revelarEmCirculo(
      () =>
        flushSync(() => {
          setEmProva(id === equipado.current ? null : id);
          applyTheme(id);
        }),
      800,
    );
  }, []);
  /* Equipar (ou o servidor trazer outro tema) encerra a prova: o equipado passa a ser o que vale. */
  useEffect(() => setEmProva(null), [theme]);
  /* `aoSair.personalizar` de `telas2.js:423-428`: a prévia nunca sobrevive à tela que a mostrou. */
  useEffect(
    () => () => {
      if (!provando.current) return;
      try {
        applyTheme(equipado.current);
      } catch {
        /* sem DOM */
      }
    },
    [],
  );
  const equiparTema = useCallback(
    (item: ItemDaLoja) => {
      /* O tema já está pintado pela prova: equipar não repete o círculo (`telas2.js:587`). */
      const ctx =
        provando.current === item.alvo
          ? { ...ctxEquipar, setTheme: (alvo: ThemeType) => setTheme(alvo, { semCirculo: true }) }
          : ctxEquipar;
      if (!equiparItem(item, ctx)) return;
      setEmProva(null);
      aoMudar();
      toast.ok(t('Tema equipado.'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o contexto de equipar é remontado a cada render
    [ctxEquipar.setTheme, aoMudar],
  );

  const colecao = useMemo(() => estadoDaColecao(nivel, saldo), [nivel, saldo, versao]); // eslint-disable-line react-hooks/exhaustive-deps -- `versao` relê a posse
  const conquistas = contarConquistas(ctxConquistas);
  const comNivel = (maestria ?? []).filter((j) => j.nivel > 0).length;

  /* Os ícones e a ordem de `telas2.js:349`. */
  const abas: Array<{ id: AbaDaLojaV2; rotulo: string; icone: ReactNode; n?: string }> = [
    { id: 'colecao', rotulo: t('Coleção'), icone: <Shirt aria-hidden />, n: String(colecao.possuidos.length) },
    { id: 'maestria', rotulo: t('Maestria'), icone: <Trophy aria-hidden />, n: `${comNivel}/18` },
    { id: 'temporada', rotulo: t('Temporada'), icone: <MapIcon aria-hidden /> },
    {
      id: 'conquistas',
      rotulo: t('Conquistas'),
      icone: <Trophy aria-hidden />,
      n: `${conquistas.feitas}/${conquistas.total}`,
    },
    { id: 'loja', rotulo: t('Loja'), icone: <ShoppingBag aria-hidden /> },
  ];

  // As setas trocam de aba, como nas abas de sempre (`ui/Abas`).
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!passo && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const destino =
      e.key === 'Home' ? 0 : e.key === 'End' ? ABAS.length - 1 : (indice + passo + ABAS.length) % ABAS.length;
    setAba(ABAS[destino]);
    (
      e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('.q-aba')[destino] as HTMLElement | undefined
    )?.focus();
  };

  const convite = (
    <CartaoDeConvite view="conquistas" onEntrar={() => onEntrar?.()} onVoltar={() => setAba('colecao')} />
  );
  /* As abas que ficam como em produção moram no miolo de sempre (`.tela` é o escopo de `questBase.css`). */
  const comoEmProducao = (miolo: ReactNode) => (
    <div className="tela qp-miolo">
      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="qp-pilha">
        {miolo}
      </div>
    </div>
  );

  let corpo: ReactNode;
  if (aba === 'colecao')
    corpo = (
      <ColecaoDoPrototipo
        nivel={nivel}
        saldo={saldo}
        theme={theme}
        fonte={fonte}
        emProva={emProva}
        versao={versao}
        aoProvar={provarTema}
        aoEquipar={equiparTema}
        aoIrPara={setAba}
        aoAbrirVisual={setFolha}
      />
    );
  else if (aba === 'maestria') corpo = comoEmProducao(semConta ? convite : <PainelDeMaestria jogos={maestria} />);
  else if (aba === 'conquistas')
    corpo = comoEmProducao(semConta ? convite : <Conquistas progress={progress} ctx={ctxConquistas} />);
  else if (semConta) corpo = comoEmProducao(convite);
  else if (aba === 'temporada')
    corpo = (
      <TemporadaDoPrototipo
        estado={temporada}
        saldo={saldo}
        aoContarSeeds={contarSeeds}
        aoUsar={usarItem}
        aoVerPlanos={() => irPara({ view: 'planos' })}
      />
    );
  else
    corpo = (
      <LojaDoPrototipo
        nivel={nivel}
        saldo={saldo}
        mostrado={mostrado}
        versao={versao}
        aoMudar={aoMudar}
        aoContarSeeds={contarSeeds}
        aoProvarTema={provarTema}
        aoUsar={usarItem}
        aoGanhar={() => irPara({ view: 'play' })}
      />
    );

  const redesenhada = REDESENHADA.has(aba) && !(semConta && aba !== 'colecao');
  return (
    <div className={`q-palco qp${redesenhada ? ' px-personalizar' : ''}`} data-testid="personalizar-no-quest">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{t('Seu visual')}</p>
          <h1>{t('Personalizar')}</h1>
        </div>
        {/* Com Créditos à venda, o toque no chip abre a carteira e a prateleira paga (a mesma peça do
            protótipo, sem nada a mais na tela parada). */}
        <span
          className="q-chip px-seeds"
          data-testid="saldo-de-seeds"
          {...(mostrarCreditos
            ? {
                role: 'button',
                tabIndex: 0,
                'aria-label': t('{n} Seeds. Abrir os Créditos', { n: numero(mostrado) }),
                onClick: () => setCreditosAbertos(true),
                onKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  setCreditosAbertos(true);
                },
              }
            : null)}
        >
          <Sprout aria-hidden />
          <span>{numero(mostrado)}</span> Seeds
        </span>
      </header>

      <div className="q-abas qp-abas" role="tablist" aria-label={t('Personalizar')} ref={barra}>
        {abas.map((a, i) => {
          const selecionada = a.id === aba;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`aba-${a.id}`}
              className="q-aba"
              aria-selected={selecionada}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setAba(a.id)}
              onKeyDown={(e) => aoTeclar(e, i)}
            >
              {a.icone}
              {a.rotulo}
              {a.n !== undefined && (
                <>
                  {' '}
                  <span className="n">{a.n}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {corpo}

      {folha && (
        <FolhaDoVisual
          secao={folha}
          theme={theme}
          setTheme={setTheme}
          fonte={fonte}
          setFonte={setFonte}
          nivel={nivel}
          saldo={saldo}
          ageProfile={ageProfile}
          setAgeProfile={setAgeProfile}
          menuPosition={menuPosition}
          setMenuPosition={setMenuPosition}
          onOpenStudio={onOpenStudio}
          aoIrPara={(a) => {
            setFolha(null);
            setAba(a);
          }}
          aoFechar={() => {
            setFolha(null);
            aoMudar();
          }}
        />
      )}
      {creditosAbertos && (
        <FolhaDeCreditos
          nivel={nivel}
          saldo={saldo}
          carteira={carteira}
          ctxEquipar={ctxEquipar}
          equipadoAtual={(i) => estaEquipado(i, { theme, fonte, menuPosition })}
          aoMudar={aoMudar}
          aoFechar={() => setCreditosAbertos(false)}
        />
      )}
    </div>
  );
}
