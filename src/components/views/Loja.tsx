/**
 * PERSONALIZAR — a casca com DUAS áreas (decisão do dono, 2026-09-12):
 *
 *   · Meu visual → o que já é seu, para equipar (o inventário e o editor por peça).
 *   · Desafios   → tudo o que ainda dá para conseguir, na ordem da prioridade da tela: o que vem
 *                  só fazendo (como ganhar, como subir, conquistas), o que a temporada entrega
 *                  por estudar (Passe), e por último o que se compra (Loja).
 *
 * A MARCAÇÃO É A DO PROTÓTIPO APROVADO (`T.personalizar` em
 * `docs/prototipos/consistencia-telas.html`), que o dono trata como o Figma do app: cabeçalho no
 * molde com o saldo de Seeds como ação, e as duas abas embaixo dele. O CSS é o do protótipo
 * (`src/styles/prototipo.css`).
 *
 * A LOJA NÃO ESTÁ NO PROTÓTIPO, e fica: é o único lugar onde se compra com Seeds e Créditos. Ela
 * vem por último em Desafios, com o mesmo vocabulário do resto da tela (`.cartao.peca`, `.chips`,
 * `.btn`), para não parecer outro app no fim da página.
 *
 * Loja e Passe continuam endereçáveis: os nomes antigos de aba resolvem para `conquistas` em
 * `lib/rotas`, e os atalhos internos rolam até a seção (`irParaSecao`).
 *
 * Comprar aqui e equipar ali passam pelo mesmo `equiparItem` (lib/galeria/equipar) — o único
 * caminho que equipa no app. Os textos dos estados vêm de `lib/galeria/textos`.
 */
import { type ContextoDeConquistas, REGRAS } from '@core';
import { Check, Coins, Crown, Lock, Map as MapIcon, Shirt, ShoppingBag, Sparkles, Sprout, Trophy } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';

import { gastarCreditos, gastarSeeds } from '../../data/api';
import type { FonteType, ThemeType } from '../../lib/appearance';
/* A intensidade das partículas saiu daqui: ela é ajuste da peça, e mora no editor da peça
   (`personalizar/EditorDoItem`). Ter os dois lugares fazia a mesma escolha aparecer numa loja
   e num inventário, com dois desenhos. */
import {
  custoDoProximoNivel,
  NIVEL_MAXIMO,
  nivelDoAprimoramento,
  progressoDoAprimoramento,
  registrarAprimoramento,
} from '../../lib/aprimoramentos';
import { useCarteira } from '../../lib/carteira';
import { contarConquistas } from '../../lib/conquistas';
import { readCursor } from '../../lib/cursores';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { emitBurst } from '../../lib/effects';
import { comprarPecaComSeeds } from '../../lib/galeria/comprarPeca';
import { type ContextoDeEquipar, equiparItem, equipavel } from '../../lib/galeria/equipar';
import { estadoDaColecao, proximaRecompensa } from '../../lib/galeria/progressao';
import { TEXTOS } from '../../lib/galeria/textos';
import { estaAnonimo } from '../../lib/identidade';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import { CATALOGO_DA_LOJA, COR_DA_RARIDADE, estadoDoItem, type ItemDaLoja } from '../../lib/loja';
import { readPack, readParticulas } from '../../lib/particulas';
import type { DerivedProgress } from '../../lib/progress';
import { readRastro } from '../../lib/rastroDoMouse';
import { normalizarAbaDaLoja } from '../../lib/rotas';
import CartaoDeConvite from '../conta/CartaoDeConvite';
import MiniaturaDoItem from '../MiniaturaDoItem';
import type { AgeProfileType, MenuPositionType } from '../shell/navItems';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, PainelDeAba, Tela, TituloDeSecao } from '../ui';
import Conquistas from './Conquistas';
import CabecalhoDeTemporada from './loja/CabecalhoDeTemporada';
import ComprarCreditos from './loja/ComprarCreditos';
import PasseDeTemporada from './passe/PasseDeTemporada';
import Personalizar from './Personalizar';

interface LojaProps {
  progress: DerivedProgress;
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
  /** Contexto das conquistas (montado no App), para a aba "Desafios" desta tela. */
  ctxConquistas: ContextoDeConquistas | null;
  /** Perfil de exibição — editado na aba Meu visual (único dono desde 2026-08-28). */
  ageProfile: AgeProfileType;
  setAgeProfile: (p: AgeProfileType) => void;
  /** v3: aba de destino ao abrir ("progressao" do fim de rodada). */
  abaInicial?: string | null;
  /** Espelha a aba na URL (ux-v2 §1.6): o App publica `/loja/<área>` a cada troca. */
  aoTrocarDeAba?: (aba: string) => void;
  /** v3: o contexto único de equipar (App). Opcional só para os testes de tela. */
  equiparCtx?: ContextoDeEquipar;
  /** Leva à porta de entrada. Ausente = self-host, onde não há conta. */
  onEntrar?: () => void;
}

const FILTROS = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'tema', nome: 'Temas' },
  { id: 'particulas', nome: 'Partículas' },
  { id: 'pack', nome: 'Emojis' },
  { id: 'cursor', nome: 'Cursor' },
  { id: 'rastro', nome: 'Rastro' },
  { id: 'posicao', nome: 'Layout' },
  { id: 'estudio', nome: 'Estúdio' },
  { id: 'galeria', nome: 'Galeria' },
] as const;

/* A linha de preço do cartão, na mesma letra da linha de progresso das conquistas do protótipo. */
const LINHA_DE_PRECO = { font: '600 11.5px var(--font-mono)', color: 'var(--ink-muted)' } as const;

/* A tabela de abas validas e a de apelidos moram em `lib/rotas.ts`: sao do vocabulario de
   ROTAS, e mante-las aqui fazia a Loja abrir na aba certa enquanto a URL mostrava
   `/loja/undefined` (achado A16). `normalizarAbaDaLoja` responde pelas duas. */

export default function Loja({
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
  // A tela ÚNICA abre no Meu visual: personalizar é o uso; comprar e conquistar são os caminhos.
  const normalizarAba = (a: string | undefined | null): string | null => normalizarAbaDaLoja(a);
  const [aba, setAbaInterna] = useState<string>(normalizarAba(abaInicial) ?? 'personalizar');
  useEffect(() => {
    const alvo = normalizarAba(abaInicial);
    if (alvo) setAbaInterna(alvo);
  }, [abaInicial]);
  // Toda troca (clique na aba OU atalho interno como "Ver no Passe") avisa o App, que espelha
  // a área na URL — recarregar e compartilhar voltam ao mesmo lugar.
  const setAba = (a: string) => {
    setAbaInterna(a);
    aoTrocarDeAba?.(a);
  };
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('tudo');
  const [comprando, setComprando] = useState<string | null>(null);
  const [, force] = useState(0);
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
  /**
   * A ECONOMIA EXIGE CONTA — e a acessibilidade não (mudança porta-de-entrada).
   *
   * O recorte é por ABA porque esta tela guarda duas coisas de natureza diferente: a economia
   * (Desafios, Passe, Loja), que só é confiável com o servidor arbitrando, e a acessibilidade
   * (equipar o que já é seu, o perfil de exibição), que é direito declarado e não se tranca atrás
   * de cadastro. Gatear a view inteira trancaria "Leitura ampliada" junto.
   *
   * NA EDIÇÃO ESTÁTICA o gate não vale: lá a identidade é SEMPRE anônima e quem arbitra é o
   * servidor em memória (`data/efemero/rotas/economia.ts`), que credita as conquistas de verdade.
   * Trancar a aba lá era mostrar "Disponível na versão completa" para algo que já funciona.
   */
  const semConta = estaAnonimo() && !edicaoEstatica();

  // A carteira de Créditos é a única moeda que o cliente não deriva sozinho: o servidor arbitra.
  const carteira = useCarteira();

  // Recém-comprados nesta visita continuam na prateleira como 'Liberado · Equipar agora'.
  const [recemComprados] = useState(() => new Set<string>());
  const colecao = useMemo(() => estadoDaColecao(nivel, saldo), [nivel, saldo, comprando]); // eslint-disable-line react-hooks/exhaustive-deps -- `comprando` força reler a posse depois da compra
  /* LOJA = só o que ainda NÃO é seu e NÃO é exclusivo. Possuído vai para "Meu visual";
     exclusivo, para "Conquistas". Os aprimoramentos ficam aqui (são compra em degraus). */
  const itens = useMemo(
    () =>
      CATALOGO_DA_LOJA.filter((i) => {
        if (i.exclusivoDe) return false;
        if (i.tipo === 'aprimoramento') return filtro === 'tudo' || filtro === 'particulas';
        const seu = estadoDoItem(i, nivel, saldo).estado === 'equipavel';
        // Um item recém-comprado nesta visita continua na prateleira como "Liberado" (com Equipar agora).
        if (seu && !recemComprados.has(i.id)) return false;
        return filtro === 'tudo' || i.tipo === filtro;
      }),
    [filtro, nivel, saldo, comprando], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /* A ORDEM DA VITRINE, e o critério é literal: "dá para levar agora" quer dizer que o SALDO
     paga. A segunda vem ordenada pelo que falta: o mais perto primeiro, porque é ele que responde
     "o que eu consigo a seguir". */
  const custoDe = (i: ItemDaLoja): number | null =>
    i.tipo === 'aprimoramento'
      ? custoDoProximoNivel(i.alvo)
      : estadoDoItem(i, nivel, saldo).estado === 'compravel'
        ? (i.precoSeeds ?? null)
        : null;
  /* A PRATELEIRA PAGA sai das duas de Seeds: misturar as moedas na mesma grade faria o preço
     em Créditos parecer preço em Seeds. */
  const premium = itens.filter((i) => i.precoCreditos !== undefined);
  const deSeeds = itens.filter((i) => i.precoCreditos === undefined);
  const podeAgora = deSeeds.filter((i) => {
    const c = custoDe(i);
    return c !== null && saldo >= c;
  });
  const aindaNao = deSeeds
    .filter((i) => !podeAgora.includes(i))
    .sort((a, b) => {
      // Falta de Seeds ordena pela diferença; falta de nível, pelo nível — e Seeds vem primeiro,
      // porque juntar moeda é o que dá para fazer hoje.
      const ca = custoDe(a),
        cb = custoDe(b);
      if (ca !== null && cb !== null) return ca - cb;
      if (ca !== null) return -1;
      if (cb !== null) return 1;
      return a.nivel - b.nivel;
    });
  /* A PEÇA DA VITRINE, por regra e não por sorteio: o mais caro que o saldo paga hoje; sem
     nada ao alcance, o que falta menos. */
  const emDestaque = podeAgora.length
    ? [...podeAgora].sort((a, b) => (custoDe(b) ?? 0) - (custoDe(a) ?? 0))[0]
    : aindaNao[0];
  /* E ele SAI das prateleiras: o mesmo cartão duas vezes seguidas parece defeito. */
  const naPrateleira = (lista: ItemDaLoja[]) => lista.filter((i) => i.id !== emDestaque?.id);
  const proxima = proximaRecompensa(nivel);

  const equipadoAtual = (item: ItemDaLoja): boolean => {
    if (item.tipo === 'tema') return theme === item.alvo;
    if (item.tipo === 'fonte') return fonte === item.alvo;
    if (item.tipo === 'particulas') return readParticulas() === item.alvo;
    if (item.tipo === 'posicao') return menuPosition === item.alvo;
    if (item.tipo === 'pack') return readPack() === item.alvo;
    if (item.tipo === 'cursor') return readCursor() === item.alvo;
    if (item.tipo === 'rastro') return readRastro() === item.alvo;
    return false;
  };

  /**
   * IR A UMA SEÇÃO DE "DESAFIOS". Os atalhos de dentro do app ("Ver na Loja", "Ver no Passe", a
   * rota de aquisição de uma peça trancada no inventário) continuam válidos porque o destino
   * continua existindo — como âncora. Sem o `scrollIntoView` o botão trocaria a aba e deixaria a
   * pessoa no topo, com a seção certa fora da tela.
   */
  const irParaSecao = (secao: 'desafios' | 'passe' | 'loja') => {
    setAba('conquistas');
    /* Um quadro depois: a aba precisa montar antes de haver elemento para rolar até. */
    requestAnimationFrame(() => {
      document.getElementById(`secao-${secao}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  /** "Equipar agora" depois da compra — pelo único caminho que equipa. */
  const equiparAgora = (item: ItemDaLoja, el: HTMLElement | null) => {
    if (!equipavel(item)) {
      setAba('personalizar');
      return;
    }
    if (equiparItem(item, ctxEquipar)) {
      comemorar('acerto', el, { texto: TEXTOS.emUso });
      force((n) => n + 1);
    }
  };

  /** Compra o PRÓXIMO nível de um aprimoramento (spendId por nível: idempotente por degrau). */
  const aprimorar = async (item: ItemDaLoja, el: HTMLElement | null) => {
    const custo = custoDoProximoNivel(item.alvo);
    if (custo === null) return;
    const proximo = nivelDoAprimoramento(item.alvo) + 1;
    setComprando(item.id);
    try {
      const r = await gastarSeeds({
        spendId: `apr-${item.alvo}-n${proximo}`,
        amount: custo,
        reason: `aprimoramento:${item.alvo}:${proximo}`,
      });
      if (r && (r as { ok?: boolean }).ok === false) {
        toast.warn('Não deu para aprimorar agora. Tente de novo.');
        return;
      }
      registrarAprimoramento(item.alvo);
      comemorar('subiuNivel', el, { texto: `Nv. ${proximo}!` });
      explodirAleatorio(2, 'fogos');
      toast.ok(`${item.nome} subiu para o nível ${proximo}!`);
      force((n) => n + 1);
    } catch {
      toast.warn('Não deu para aprimorar agora. Tente de novo.');
    } finally {
      setComprando(null);
    }
  };

  /**
   * COMPRA COM CRÉDITOS — a moeda que custou dinheiro. A posse do que se paga NÃO é marcada
   * localmente: ela vem do servidor na próxima leitura da carteira (`credit_spends`).
   */
  const comprarComCreditos = async (item: ItemDaLoja, el: HTMLElement | null) => {
    if (item.precoCreditos === undefined) return;
    if ((carteira.creditos ?? 0) < item.precoCreditos) {
      toast.warn(
        `Faltam ${item.precoCreditos - (carteira.creditos ?? 0)} Créditos. Eles se compram aqui embaixo, ou vêm no Passe.`,
      );
      return;
    }
    setComprando(item.id);
    try {
      const r = await gastarCreditos({
        spendId: `premium-${item.id}`,
        amount: item.precoCreditos,
        reason: `premium:${item.id}`,
      });
      if (!r) {
        toast.warn('Não deu para completar a compra agora. Tente de novo.');
        return;
      }
      comemorar('subiuNivel', el, { texto: 'Seu!' });
      explodirAleatorio(3, 'fogos');
      toast.ok(`${item.nome} é seu!`);
      carteira.recarregar();
      force((n) => n + 1);
    } catch {
      toast.warn('Não deu para completar a compra agora. Tente de novo.');
    } finally {
      setComprando(null);
    }
  };

  const comprar = async (item: ItemDaLoja, el: HTMLElement | null) => {
    if (item.precoSeeds === undefined) return;
    setComprando(item.id);
    try {
      /* A transação mora em `comprarPecaComSeeds` porque o cartão do inventário compra pela
         MESMA porta. O `spendId` fixo por item é compartilhado de propósito: o mesmo item
         comprado nas duas telas debita uma vez só. */
      const compra = await comprarPecaComSeeds(item);
      if (!compra.ok) {
        toast.warn(
          compra.faltam > 0
            ? `Faltam ${compra.faltam} Seeds para levar ${item.nome}. Nada foi cobrado.`
            : 'Não deu para completar a compra agora. Nada foi cobrado.',
        );
        return;
      }
      recemComprados.add(item.id);
      comemorar('subiuNivel', el, { texto: 'Seu!' });
      explodirAleatorio(3, 'confete');
      toast.ok(`${item.nome} é seu!`);
      force((n) => n + 1);
    } finally {
      setComprando(null);
    }
  };

  /**
   * UM CARTÃO DA PRATELEIRA — o `.cartao.peca` do protótipo (o mesmo de Meu visual), com a linha
   * de preço e os dois caminhos lado a lado: a Seed (estudo) e o nível (cadeado).
   */
  const cartaoDaLoja = (item: ItemDaLoja) => {
    const { estado } = estadoDoItem(item, nivel, saldo);
    const equipado = estado === 'equipavel' && equipadoAtual(item);
    const preco = item.precoSeeds;
    const falta = preco !== undefined ? preco - saldo : 0;
    const apr = item.tipo === 'aprimoramento';
    const custoApr = apr ? custoDoProximoNivel(item.alvo) : null;

    return (
      <article
        className="cartao peca"
        onMouseEnter={(e) => {
          // Prévia VIVA: partículas soltam uma amostra ao passar o mouse no cartão delas.
          if (item.tipo === 'particulas' && estado !== 'bloqueado') {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            emitBurst(r.left + r.width / 2, r.top + r.height / 3, 'xp');
          }
        }}
      >
        <div className="vis">
          <MiniaturaDoItem item={item} tam="grande" />
        </div>
        <span className="label-mono">{COR_DA_RARIDADE[item.raridade].rotulo}</span>
        <h3>{item.nome}</h3>
        <p>{item.desc}</p>

        {apr ? (
          (() => {
            const nv = nivelDoAprimoramento(item.alvo);
            const pct = progressoDoAprimoramento(item.alvo);
            return (
              <>
                <div className="entre" style={LINHA_DE_PRECO}>
                  <span>
                    Nv. {nv} / {NIVEL_MAXIMO}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="barra">
                  <span style={{ width: `${pct}%` }} />
                </div>
                {custoApr === null ? (
                  <span className="badge warn">★ Dominado</span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => void aprimorar(item, e.currentTarget)}
                    disabled={comprando === item.id || saldo < custoApr}
                    className="btn btn-outline bloco"
                  >
                    <Sprout aria-hidden style={{ color: 'var(--good)' }} />
                    {comprando === item.id
                      ? 'Aprimorando…'
                      : saldo < custoApr
                        ? `Faltam ${custoApr - saldo}`
                        : `Aprimorar · ${custoApr}`}
                  </button>
                )}
              </>
            );
          })()
        ) : estado === 'equipavel' ? (
          <button
            type="button"
            onClick={(e) => equiparAgora(item, e.currentTarget)}
            className={`btn ${equipado ? 'equipado' : 'btn-outline'} bloco`}
            aria-pressed={equipado || undefined}
          >
            {equipado ? (
              <>
                <Check aria-hidden /> {TEXTOS.emUso}
              </>
            ) : item.tipo === 'estudio' ? (
              'Abrir o Estúdio'
            ) : equipavel(item) ? (
              TEXTOS.equiparAgora
            ) : (
              'usar no Meu visual'
            )}
          </button>
        ) : item.precoCreditos !== undefined ? (
          /* PREMIUM: uma via só, e a tela diz qual. Nível e Seeds não abrem — misturar as moedas
             apagaria a diferença entre "ganhei estudando" e "paguei". */
          <>
            <div className="entre" style={LINHA_DE_PRECO}>
              <span className="linha" style={{ gap: 4, color: 'var(--premium)' }}>
                <Coins aria-hidden style={{ width: 13, height: 13 }} /> {item.precoCreditos}
              </span>
              <span className="linha" style={{ gap: 4 }}>
                <Crown aria-hidden style={{ width: 12, height: 12 }} /> ou no Passe
              </span>
            </div>
            {carteira.disponivel ? (
              <button
                type="button"
                onClick={(e) => void comprarComCreditos(item, e.currentTarget)}
                disabled={comprando === item.id}
                className="btn btn-solid bloco"
              >
                {comprando === item.id
                  ? 'Comprando…'
                  : (carteira.creditos ?? 0) < item.precoCreditos
                    ? `Faltam ${item.precoCreditos - (carteira.creditos ?? 0)}`
                    : 'Comprar com Créditos'}
              </button>
            ) : (
              <button type="button" className="btn btn-outline bloco" disabled>
                Sem compra nesta instalação
              </button>
            )}
          </>
        ) : (
          <>
            <div className="entre" style={LINHA_DE_PRECO}>
              {preco !== undefined ? (
                <span className="linha tn" data-preco-seeds style={{ gap: 4, color: 'var(--good-ink)' }}>
                  <Sprout aria-hidden style={{ width: 13, height: 13 }} /> {preco}
                </span>
              ) : (
                <span>só por nível</span>
              )}
              <span className="linha" style={{ gap: 4 }}>
                <Lock aria-hidden style={{ width: 12, height: 12 }} /> nv. {item.nivel}
              </span>
            </div>
            {estado === 'compravel' ? (
              <button
                type="button"
                onClick={(e) => void comprar(item, e.currentTarget)}
                disabled={comprando === item.id}
                className="btn btn-solid bloco"
              >
                {comprando === item.id ? 'Comprando…' : 'Comprar com Seeds'}
              </button>
            ) : (
              <button type="button" className="btn btn-outline bloco" disabled>
                {preco !== undefined && falta > 0 ? `Faltam ${falta} Seeds` : `Chega no nível ${item.nivel}`}
              </button>
            )}
          </>
        )}
      </article>
    );
  };

  /* A contagem da aba é de DESAFIOS — as conquistas que ainda faltam —, no mesmo espírito da de
     "Meu visual" (o que está na sua mão): um número que muda quando você faz algo. Antes contava
     os itens do catálogo e dizia "Desafios (69)" para quem tinha 14 conquistas no total. */
  const conquistasContadas = contarConquistas(ctxConquistas);
  const nDesafios = conquistasContadas.total - conquistasContadas.feitas;

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        sobrancelha="Seu visual"
        icone={Shirt}
        titulo="Personalizar"
        sub="Temas, efeitos e letras que você já ganhou, e os desafios que liberam os próximos."
        acoes={
          <span className="pill" style={{ cursor: 'default' }}>
            <Sprout aria-hidden style={{ color: 'var(--good)' }} />
            <b className="tn" style={{ color: 'var(--ink)' }}>
              {saldo}
            </b>{' '}
            Seeds
          </span>
        }
        abas={
          /* DUAS PORTAS: o que é meu, e o que dá para conseguir (decisão do dono, 2026-09-12).
             Os ids seguem `personalizar`/`conquistas` porque são os da rota (`/loja/<área>`). */
          <Abas
            rotuloDoGrupo="Seções de Personalizar"
            ativo={aba}
            aoTrocar={setAba}
            itens={[
              {
                id: 'personalizar',
                rotulo: 'Meu visual',
                icone: <Shirt aria-hidden />,
                contagem: colecao.possuidos.length,
              },
              { id: 'conquistas', rotulo: 'Desafios', icone: <Trophy aria-hidden />, contagem: nDesafios },
            ]}
          />
        }
      />

      <PainelDeAba id="personalizar" ativo={aba}>
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
          onIrParaLoja={() => {
            setFiltro('galeria');
            irParaSecao('loja');
          }}
          onIrParaPasse={() => irParaSecao('passe')}
          onIrParaConquistas={() => irParaSecao('desafios')}
        />
      </PainelDeAba>

      {/* ── DESAFIOS: TUDO O QUE AINDA DÁ PARA CONSEGUIR, numa página ──────────────────────────
             Na ordem da prioridade da tela: o que se ganha fazendo, o que a temporada entrega por
             estudar (Passe), e por último o que se compra (Loja). */}
      <PainelDeAba id="conquistas" ativo={aba}>
        {semConta ? (
          <CartaoDeConvite view="conquistas" onEntrar={() => onEntrar?.()} onVoltar={() => setAba('personalizar')} />
        ) : (
          <>
            <div id="secao-desafios" style={{ scrollMarginTop: 16 }}>
              <Conquistas progress={progress} ctx={ctxConquistas} />
            </div>

            {/* O PASSE fica como está: o destino dele está em aberto com o dono, e a aparência da
                trilha é dele (`passe/PasseDeTemporada`). Aqui só o título no molde da tela. */}
            <section id="secao-passe" className="secao" style={{ scrollMarginTop: 16 }}>
              <TituloDeSecao
                icone={MapIcon}
                titulo="Passe da temporada"
                desc="A trilha do que cada nível entrega. Subir de nível é de graça: estudar é o único requisito."
              />
              {/* O cabeçalho de temporada (temporada, barra de XP e as duas carteiras) era o topo da
                  aba inteira; o protótipo abre a tela com o cabeçalho único e o saldo de Seeds.
                  Ele desce para cá, onde a temporada é o assunto. */}
              <CabecalhoDeTemporada
                progress={progress}
                saldo={saldo}
                carteira={carteira}
                temporada={{ numero: 1, nome: 'Fundação' }}
                /* Edição estática: não há cobrança — sem o atalho de compra. */
                aoComprarCreditos={edicaoEstatica() ? undefined : () => irParaSecao('loja')}
              />
              <div style={{ marginTop: 16 }}>
                <PasseDeTemporada
                  progress={progress}
                  ctxEquipar={ctxEquipar}
                  equipadoAtual={equipadoAtual}
                  temPasse={carteira.temPasse}
                  aoComprarPasse={
                    carteira.disponivel
                      ? () => {
                          setFiltro('tudo');
                          irParaSecao('loja');
                        }
                      : undefined
                  }
                />
              </div>
            </section>

            <section id="secao-loja" className="secao" style={{ scrollMarginTop: 16 }}>
              <TituloDeSecao
                icone={ShoppingBag}
                titulo="Loja"
                desc="O atalho pago: o que o nível entregaria mais tarde, agora, com a moeda de estudo."
              />

              {/* ── AS DUAS MOEDAS, DECLARADAS. A linha que separa as duas é a que separa este app
                   de um pay-to-win, então ela fica escrita, e não subentendida. */}
              <div className="g2">
                <div className="cartao p5">
                  <div className="entre">
                    <h3 className="linha" style={{ gap: 8, fontSize: 15, fontWeight: 800 }}>
                      <Sprout aria-hidden style={{ width: 16, height: 16, color: 'var(--good)' }} /> Seeds
                    </h3>
                    <b className="tn" style={{ font: '800 17px var(--font-mono)', color: 'var(--good-ink)' }}>
                      {saldo}
                    </b>
                  </div>
                  <p className="mut" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
                    Vêm de <b style={{ color: 'var(--ink)' }}>estudar</b>: revisar, jogar, aparecer no dia. Compram tudo
                    o que está nesta página. <b style={{ color: 'var(--ink)' }}>Não se compram com dinheiro</b>: nunca
                    vão estar à venda.
                  </p>
                </div>
                <div className="cartao p5">
                  <div className="entre">
                    <h3 className="linha" style={{ gap: 8, fontSize: 15, fontWeight: 800 }}>
                      <Coins aria-hidden style={{ width: 16, height: 16, color: 'var(--premium)' }} /> Créditos
                    </h3>
                    <b className="tn" style={{ font: '800 17px var(--font-mono)', color: 'var(--premium)' }}>
                      {carteira.disponivel ? (carteira.creditos ?? '—') : '—'}
                    </b>
                  </div>
                  <p className="mut" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
                    Compram-se com dinheiro e pagam o <b style={{ color: 'var(--ink)' }}>Passe Premium</b> e a
                    prateleira paga. <b style={{ color: 'var(--ink)' }}>Não compram progresso</b>: nível, XP, Seeds e
                    conquista só saem estudando.
                  </p>
                  {!carteira.disponivel && (
                    <p className="mut" style={{ fontSize: 12, marginTop: 8 }}>
                      Nesta instalação não há compra com dinheiro: sem conta e sem cobrança configurada, não existe o
                      que vender.
                    </p>
                  )}
                </div>
              </div>

              {/* O CAMINHO GRÁTIS, numa linha, com o atalho para onde ele é desenhado inteiro. */}
              {proxima && (
                <p className="mut linha" style={{ gap: 6, fontSize: 12.5, marginTop: 14, flexWrap: 'wrap' }}>
                  <Sparkles aria-hidden style={{ width: 15, height: 15, color: 'var(--accent)' }} />
                  No nível {proxima.nivel} você libera{' '}
                  <b style={{ color: 'var(--ink)' }}>{proxima.itens.length} peças de graça</b>, só estudando.
                  <button type="button" className="link" onClick={() => irParaSecao('passe')}>
                    Ver no Passe
                  </button>
                </p>
              )}

              {/* ── O DESTAQUE — escolhido por regra: o mais caro que o saldo paga hoje. */}
              {emDestaque && (
                <>
                  <div className="label-mono" style={{ margin: '20px 0 10px' }}>
                    Em destaque
                  </div>
                  <div className="gauto">{cartaoDaLoja(emDestaque)}</div>
                </>
              )}

              {/* ── FILTROS ── */}
              <div className="chips" role="group" aria-label="Filtrar a Loja" style={{ marginTop: 20 }}>
                {FILTROS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="pill"
                    aria-pressed={filtro === f.id}
                    onClick={() => setFiltro(f.id)}
                  >
                    {f.nome}
                  </button>
                ))}
              </div>

              {itens.length === 0 && (
                <p className="mut" style={{ fontSize: 13, marginTop: 16 }}>
                  Nada para comprar neste filtro: tudo já é seu. Veja em{' '}
                  <button type="button" className="link" onClick={() => setAba('personalizar')}>
                    Meu visual
                  </button>
                  .
                </p>
              )}

              {/* ── AS DUAS PRATELEIRAS: "dá para levar agora" e "ainda não". */}
              {naPrateleira(podeAgora).length === 0 && podeAgora.length === 0 ? (
                <p className="mut" style={{ fontSize: 13, marginTop: 16, maxWidth: '70ch' }}>
                  Nada cabe no saldo de {saldo} Seeds agora. Elas vêm de estudar (revisar, jogar, aparecer) e o que está
                  logo abaixo é o que falta menos.
                </p>
              ) : naPrateleira(podeAgora).length > 0 ? (
                <>
                  <div className="label-mono" style={{ margin: '20px 0 10px' }}>
                    Dá para levar agora · {naPrateleira(podeAgora).length}
                  </div>
                  <div className="gauto">
                    {naPrateleira(podeAgora).map((item) => (
                      <Fragment key={item.id}>{cartaoDaLoja(item)}</Fragment>
                    ))}
                  </div>
                </>
              ) : null}

              {aindaNao.length > 0 && (
                <>
                  <div className="label-mono" style={{ margin: '20px 0 10px' }}>
                    Ainda não · {naPrateleira(aindaNao).length} · o que falta menos vem primeiro; nada aqui expira
                  </div>
                  <div className="gauto">
                    {naPrateleira(aindaNao).map((item) => (
                      <Fragment key={item.id}>{cartaoDaLoja(item)}</Fragment>
                    ))}
                  </div>
                </>
              )}

              {/* ── A PRATELEIRA PAGA: o que os Créditos compram. */}
              {premium.length > 0 && (
                <>
                  <div className="label-mono" style={{ margin: '20px 0 10px' }}>
                    Com Créditos · {premium.length} · vêm de graça no Passe da temporada, ou avulsos aqui
                  </div>
                  <div className="gauto">
                    {premium.map((item) => (
                      <Fragment key={item.id}>{cartaoDaLoja(item)}</Fragment>
                    ))}
                  </div>
                </>
              )}

              {/* ── O QUE SE PAGA COM DINHEIRO. Fica DEPOIS de tudo que se ganha estudando. A
                   aparência dele é do Passe/Créditos, fora desta rodada. */}
              {!edicaoEstatica() && (
                <div style={{ marginTop: 24 }}>
                  <ComprarCreditos />
                </div>
              )}

              {/* O rodapé lê das REGRAS: o que a Loja diz sobre ganhar Seeds é o que o sistema credita. */}
              <p className="mut" style={{ fontSize: 12.5, marginTop: 18 }}>
                Seeds se ganham fazendo:{' '}
                {REGRAS.filter((r) => r.seeds > 0)
                  .slice(0, 4)
                  .map((r) => `${r.seeds} ${r.unidade}`)
                  .join(' · ')}
                .{' '}
                <button type="button" className="link" onClick={() => irParaSecao('desafios')}>
                  Ver todas as regras
                </button>
                . Seeds não se compram com dinheiro: só estudando.
              </p>
            </section>
          </>
        )}
      </PainelDeAba>
    </Tela>
  );
}
