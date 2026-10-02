import { Award, Map as MapIcon, Shirt, ShoppingBag, Sprout, Trophy } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { MaestriaNoServidor } from '../../../data/api';
import { useCarteira } from '../../../lib/carteira';
import { contarConquistas } from '../../../lib/conquistas';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../../../lib/edicaoEstatica';
import { type ContextoDeEquipar, estaEquipado } from '../../../lib/galeria/equipar';
import { estadoDaColecao } from '../../../lib/galeria/progressao';
import { t } from '../../../lib/i18n';
import { estaAnonimo } from '../../../lib/identidade';
import type { ItemDaLoja } from '../../../lib/loja';
import { sincronizarMaestria } from '../../../lib/maestria';
import { perfilProtegido } from '../../../lib/protecaoDoMenor';
import { type AbaDaLojaV2, normalizarAbaDaLojaV2 } from '../../../lib/rotas';
import { useTemporada } from '../../../lib/temporada';
import CartaoDeConvite from '../../conta/CartaoDeConvite';
import MolduraETitulo from '../../perfil/MolduraETitulo';
import { toast } from '../../Toast';
import { Abas, CabecalhoDeTela, type ItemDeAba, PainelDeAba, Tela } from '../../ui';
import Conquistas from '../Conquistas';
import CabecalhoDeTemporada from '../loja/CabecalhoDeTemporada';
import type { LojaProps } from '../loja/propsDaLoja';
import VitrineV2 from '../loja/VitrineV2';
import PainelDeMaestria from '../maestria/PainelDeMaestria';
import PasseDeTemporada from '../passe/PasseDeTemporada';
import Personalizar from '../Personalizar';
import PainelDePrevia, { FaixaDoTemaEmPrevia, TIPOS_COM_PREVIA, usePreviaAoVivo } from './PainelDePrevia';
import CascaDePersonalizarNoQuest from './quest/CascaDePersonalizarNoQuest';

/**
 * PERSONALIZAR EM CINCO ABAS (recompensas v2, Task 5.4 — spec 10.3), no mesmo molde de cartões:
 *
 *   · Coleção    → o que é seu, por tipo (temas, legendas, cartões, efeitos de jogo, moldura e
 *                  título), com a prévia ao vivo: a legenda de exemplo muda na hora e o tema pinta o
 *                  app só enquanto a tela está aberta. Equipar é o botão "Equipar".
 *   · Maestria   → os 18 jogos com nível, barra e próxima recompensa.
 *   · Temporada  → as duas trilhas, com datas.
 *   · Conquistas → a grade por pilar, com a contagem real ("12/40") na aba.
 *   · Loja       → Seeds e Créditos, com prévia e preço; Créditos só com carteira, fora do perfil
 *                  protegido e fora da edição estática.
 *
 * NA EDIÇÃO ESTÁTICA nenhuma aba mostra "Disponível na versão completa": a economia é arbitrada pelo
 * servidor em memória, e a primeira visita vê tudo no zero. Fora dela, sem conta, as abas de
 * economia pedem a entrada (a Coleção não: equipar o que é seu não depende de cadastro).
 */
export default function PersonalizarV2({
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
  const setAba = (a: string) => {
    const alvo = normalizarAbaDaLojaV2(a) ?? 'colecao';
    setAbaInterna(alvo);
    aoTrocarDeAba?.(alvo);
  };

  const [versao, setVersao] = useState(0);
  const aoMudar = () => setVersao((v) => v + 1);
  const nivel = progress.available ? progress.level : 1;
  const saldo = progress.available ? progress.seeds : 0;
  const ctxEquipar: ContextoDeEquipar = equiparCtx ?? { setTheme, setFonte, setMenuPosition, onOpenStudio, nivel, saldo };
  const equipadoAtual = (i: ItemDaLoja) => estaEquipado(i, { theme, fonte, menuPosition });

  const semConta = estaAnonimo() && !edicaoEstatica();
  const protegido = perfilProtegido();
  const carteira = useCarteira();
  const mostrarCreditos = carteira.disponivel && !protegido && !edicaoEstatica();
  const temporada = useTemporada((seeds) => toast.ok(t('Temporada: +{n} Seeds dos níveis que você alcançou.', { n: seeds })));

  /* A maestria é lida uma vez por visita: a contagem da aba e o painel usam a mesma resposta. */
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

  const { previa, prever, parar } = usePreviaAoVivo(theme);
  const colecao = useMemo(() => estadoDaColecao(nivel, saldo), [nivel, saldo, versao]); // eslint-disable-line react-hooks/exhaustive-deps -- `versao` relê a posse
  const conquistas = contarConquistas(ctxConquistas);
  const comNivel = (maestria ?? []).filter((j) => j.nivel > 0).length;

  const convite = (
    <CartaoDeConvite view="conquistas" onEntrar={() => onEntrar?.()} onVoltar={() => setAba('colecao')} />
  );
  const painelDePrevia = <PainelDePrevia previa={previa} aoParar={parar} />;

  /* AS ABAS E O MIOLO DE CADA UMA, ditos uma vez: a tela de sempre e a do headset mostram os mesmos. */
  const questNovo = useQuestNovo();
  const itensDeAba: ItemDeAba[] = [
    { id: 'colecao', rotulo: t('Coleção'), icone: <Shirt aria-hidden />, contagem: colecao.possuidos.length },
    { id: 'maestria', rotulo: t('Maestria'), icone: <Award aria-hidden />, contagem: `${comNivel}/18` },
    { id: 'temporada', rotulo: t('Temporada'), icone: <MapIcon aria-hidden /> },
    {
      id: 'conquistas',
      rotulo: t('Conquistas'),
      icone: <Trophy aria-hidden />,
      contagem: `${conquistas.feitas}/${conquistas.total}`,
    },
    { id: 'loja', rotulo: t('Loja'), icone: <ShoppingBag aria-hidden /> },
  ];
  const miolo: Record<AbaDaLojaV2, ReactNode> = {
    colecao: (
      <Personalizar
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
        onIrParaLoja={() => setAba('loja')}
        onIrParaPasse={() => setAba('temporada')}
        onIrParaConquistas={() => setAba('conquistas')}
        topo={painelDePrevia}
        aoPrever={prever}
        itemEmPrevia={previa.itemId}
        tiposComPrevia={TIPOS_COM_PREVIA}
      />
    ),
    maestria: semConta ? convite : <PainelDeMaestria jogos={maestria} />,
    temporada: semConta ? (
      convite
    ) : (
      <section className="secao">
        <CabecalhoDeTemporada
          estado={temporada}
          saldo={saldo}
          carteira={carteira}
          aoComprarCreditos={mostrarCreditos ? () => setAba('loja') : undefined}
        />
        <div style={{ marginTop: 16 }}>
          <PasseDeTemporada temporada={temporada} ctxEquipar={ctxEquipar} equipadoAtual={equipadoAtual} protegido={protegido} />
        </div>
      </section>
    ),
    conquistas: semConta ? convite : <Conquistas progress={progress} ctx={ctxConquistas} />,
    loja: semConta ? (
      convite
    ) : (
      <>
        <PainelDePrevia previa={previa} aoParar={parar} soEmPrevia />
        <VitrineV2
          nivel={nivel}
          saldo={saldo}
          carteira={carteira}
          mostrarCreditos={mostrarCreditos}
          ctxEquipar={ctxEquipar}
          equipadoAtual={equipadoAtual}
          aoPrever={prever}
          itemEmPrevia={previa.itemId}
          tiposComPrevia={TIPOS_COM_PREVIA}
          aoMudar={aoMudar}
        />
      </>
    ),
  };

  /* NO META QUEST (telas novas): o cabeçalho e as abas do desenho do headset; o miolo é o mesmo. */
  if (questNovo)
    return (
      <CascaDePersonalizarNoQuest
        saldo={saldo}
        moldura={<MolduraETitulo nivel={nivel} tamanho={44} />}
        abas={itensDeAba}
        ativa={aba}
        aoTrocar={setAba}
        faixa={<FaixaDoTemaEmPrevia previa={previa} aoParar={parar} />}
      >
        {miolo[aba]}
      </CascaDePersonalizarNoQuest>
    );

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        sobrancelha={t('Seu visual')}
        icone={Shirt}
        titulo={t('Personalizar')}
        sub={t('O que é seu, a maestria de cada jogo, a temporada, as conquistas e a loja.')}
        acoes={
          <span className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
            <MolduraETitulo nivel={nivel} tamanho={34} />
            <span className="pill" style={{ cursor: 'default' }} data-testid="saldo-de-seeds">
              <Sprout aria-hidden style={{ color: 'var(--good)' }} />
              <b className="tn" style={{ color: 'var(--ink)' }}>
                {saldo}
              </b>{' '}
              Seeds
            </span>
          </span>
        }
        abas={<Abas rotuloDoGrupo={t('Seções de Personalizar')} ativo={aba} aoTrocar={setAba} itens={itensDeAba} />}
      />

      <FaixaDoTemaEmPrevia previa={previa} aoParar={parar} />

      <PainelDeAba id="colecao" ativo={aba}>
        {miolo.colecao}
      </PainelDeAba>

      <PainelDeAba id="maestria" ativo={aba}>
        {miolo.maestria}
      </PainelDeAba>

      <PainelDeAba id="temporada" ativo={aba}>
        {miolo.temporada}
      </PainelDeAba>

      <PainelDeAba id="conquistas" ativo={aba}>
        {miolo.conquistas}
      </PainelDeAba>

      <PainelDeAba id="loja" ativo={aba}>
        {miolo.loja}
      </PainelDeAba>
    </Tela>
  );
}
