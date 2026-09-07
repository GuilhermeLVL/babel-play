/**
 * PERSONALIZAR v3 — a casca com QUATRO áreas claras (pedido do dono, 2026-08-28):
 *
 *   · Meu visual    → o que já é seu, para equipar (o editor por peça — `Personalizar`).
 *   · Loja          → SÓ o que ainda se compra/libera por nível ou Seeds (nada de possuído aqui).
 *   · Conquistas    → o que SÓ vem por conquista (exclusivos em destaque) + a grade + "como ganhar".
 *   · Progressão    → a grade de tudo que dá para liberar, nível a nível, e a curva de XP.
 *
 * No topo, sempre visível: a barra de XP do nível, "faltam N XP", o saldo e a PRÓXIMA recompensa.
 * Comprar aqui e equipar ali passam pelo mesmo `equiparItem` (lib/galeria/equipar) — o único
 * caminho que equipa no app. Os textos dos estados vêm de `lib/galeria/textos`.
 */
import { normalizarAbaDaLoja } from '../../lib/rotas';
import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Sprout, Lock, Check, Sparkles, Coins, Crown, Trophy, Shirt, Ticket } from 'lucide-react';
import { Abas, PainelDeAba } from '../ui';
import Conquistas from './Conquistas';
import PasseDeTemporada from './passe/PasseDeTemporada';
import Personalizar from './Personalizar';
import { REGRAS, type ContextoDeConquistas } from '@core';
import {
  CATALOGO_DA_LOJA, COR_DA_RARIDADE, estadoDoItem, marcarPosse, type ItemDaLoja,
} from '../../lib/loja';
import { proximaRecompensa, estadoDaColecao } from '../../lib/galeria/progressao';
import { equiparItem, equipavel, type ContextoDeEquipar } from '../../lib/galeria/equipar';
import { TEXTOS } from '../../lib/galeria/textos';
import MiniaturaDoItem from '../MiniaturaDoItem';
import ComprarCreditos from './loja/ComprarCreditos';
import CabecalhoDeTemporada from './loja/CabecalhoDeTemporada';
import { useCarteira } from '../../lib/carteira';
import { estaAnonimo } from '../../lib/identidade';
import CartaoDeConvite from '../conta/CartaoDeConvite';
import { gastarSeeds, gastarCreditos } from '../../data/api';
import { toast } from '../Toast';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { readParticulas, readPack } from '../../lib/particulas';
import { readCursor } from '../../lib/cursores';
import { readRastro } from '../../lib/rastroDoMouse';
/* A intensidade das partículas saiu daqui: ela é ajuste da peça, e mora no editor da peça
   (`personalizar/EditorDoItem`). Ter os dois lugares fazia a mesma escolha aparecer numa loja
   e num inventário, com dois desenhos. */
import {
  nivelDoAprimoramento, custoDoProximoNivel, registrarAprimoramento, progressoDoAprimoramento,
  NIVEL_MAXIMO,
} from '../../lib/aprimoramentos';
import type { ThemeType, FonteType } from '../../lib/appearance';
import type { MenuPositionType, AgeProfileType } from '../shell/navItems';
import type { DerivedProgress } from '../../lib/progress';

interface LojaProps {
  progress: DerivedProgress;
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
  /** Contexto das conquistas (montado no App), para a aba "Conquistas" desta tela. */
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

/* v4 (spec personalizar-v4, protótipo aprovado 31/08): 'progressao' virou o PASSE — a mesma
   informação (o que cada nível libera) na lente de 100 posições aprovada pelo dono. O id antigo
   segue aceito como alias para navegação gravada/links não quebrarem. */
/* A tabela de abas validas e a de apelidos mudaram para `lib/rotas.ts`: sao do vocabulario de
   ROTAS, e mante-las aqui fazia a Loja abrir na aba certa enquanto a URL mostrava
   `/loja/undefined` (achado A16). `normalizarAbaDaLoja` responde pelas duas. */

export default function Loja({ progress, theme, setTheme, fonte, setFonte, menuPosition, setMenuPosition, onOpenStudio, ctxConquistas, ageProfile, setAgeProfile, abaInicial, aoTrocarDeAba, equiparCtx, onEntrar }: LojaProps) {
  // A tela ÚNICA abre no Meu visual: personalizar é o uso; comprar e conquistar são os caminhos.
  const normalizarAba = (a: string | undefined | null): string | null => normalizarAbaDaLoja(a);
  const [aba, setAbaInterna] = useState<string>(normalizarAba(abaInicial) ?? 'personalizar');
  useEffect(() => { const alvo = normalizarAba(abaInicial); if (alvo) setAbaInterna(alvo); }, [abaInicial]);
  // Toda troca (clique na aba OU atalho interno como "Ver no Passe") avisa o App, que espelha
  // a área na URL — recarregar e compartilhar voltam ao mesmo lugar.
  const setAba = (a: string) => { setAbaInterna(a); aoTrocarDeAba?.(a); };
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('tudo');
  const [comprando, setComprando] = useState<string | null>(null);
  const [, force] = useState(0);
  const nivel = progress.available ? progress.level : 1;
  const saldo = progress.available ? progress.seeds : 0;
  const ctxEquipar: ContextoDeEquipar = equiparCtx ?? { setTheme, setFonte, setMenuPosition, onOpenStudio, nivel, saldo };
  /**
   * A ECONOMIA EXIGE CONTA — e a acessibilidade não (mudança porta-de-entrada).
   *
   * O recorte é por ABA porque esta tela guarda duas coisas de natureza diferente: a economia
   * (Loja, Passe, Desafios), que só é confiável com o servidor arbitrando, e a acessibilidade
   * (equipar o que já é seu, o perfil de exibição), que é direito declarado e não se tranca atrás
   * de cadastro. Gatear a view inteira trancaria "Leitura ampliada" junto.
   */
  const semConta = estaAnonimo();

  // A carteira de Créditos é a única moeda que o cliente não deriva sozinho: o servidor arbitra.
  const carteira = useCarteira();

  // Recém-comprados nesta visita continuam na prateleira como 'Liberado · Equipar agora'.
  const [recemComprados] = useState(() => new Set<string>());
  const colecao = useMemo(() => estadoDaColecao(nivel, saldo), [nivel, saldo, comprando]); // eslint-disable-line react-hooks/exhaustive-deps -- `comprando` força reler a posse depois da compra
  /* LOJA = só o que ainda NÃO é seu e NÃO é exclusivo. Possuído vai para "Meu visual";
     exclusivo, para "Conquistas". Os aprimoramentos ficam aqui (são compra em degraus). */
  const itens = useMemo(
    () => CATALOGO_DA_LOJA.filter((i) => {
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
     paga. A primeira versão desta divisão usava "não está bloqueado por nível", e aí um item de
     50 Seeds aparecia como disponível para quem tinha 0 — a prateleira mentia no título, que é
     pior do que a parede de cadeados que ela veio consertar.
     A segunda vem ordenada pelo que falta: o mais perto primeiro, porque é ele que responde
     "o que eu consigo a seguir". */
  const custoDe = (i: ItemDaLoja): number | null =>
    i.tipo === 'aprimoramento' ? custoDoProximoNivel(i.alvo)
    : estadoDoItem(i, nivel, saldo).estado === 'compravel' ? (i.precoSeeds ?? null)
    : null;
  /* A PRATELEIRA PAGA sai das duas de Seeds: misturar as moedas na mesma grade faria o preço
     em Créditos parecer preço em Seeds, que é exatamente a confusão que a régua das quatro
     origens existe para evitar. */
  const premium = itens.filter((i) => i.precoCreditos !== undefined);
  const deSeeds = itens.filter((i) => i.precoCreditos === undefined);
  const podeAgora = deSeeds.filter((i) => { const c = custoDe(i); return c !== null && saldo >= c; });
  const aindaNao = deSeeds
    .filter((i) => !podeAgora.includes(i))
    .sort((a, b) => {
      // Falta de Seeds ordena pela diferença; falta de nível, pelo nível — e Seeds vem primeiro,
      // porque juntar moeda é o que dá para fazer hoje.
      const ca = custoDe(a), cb = custoDe(b);
      if (ca !== null && cb !== null) return ca - cb;
      if (ca !== null) return -1;
      if (cb !== null) return 1;
      return a.nivel - b.nivel;
    });
  /* A PEÇA DA VITRINE, por regra e não por sorteio: o mais caro que o saldo paga hoje; sem
     nada ao alcance, o que falta menos. Destaque aleatório mudaria a cada render e a pessoa
     nunca reencontraria o que viu. */
  const emDestaque = podeAgora.length
    ? [...podeAgora].sort((a, b) => (custoDe(b) ?? 0) - (custoDe(a) ?? 0))[0]
    : aindaNao[0];
  /* E ele SAI das prateleiras: o mesmo cartão duas vezes, um logo abaixo do outro, faz a
     vitrine parecer defeito em vez de destaque. */
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

  /** "Equipar agora" depois da compra — pelo único caminho que equipa. */
  const equiparAgora = (item: ItemDaLoja, el: HTMLElement | null) => {
    if (!equipavel(item)) { setAba('personalizar'); return; }
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
      const r = await gastarSeeds({ spendId: `apr-${item.alvo}-n${proximo}`, amount: custo, reason: `aprimoramento:${item.alvo}:${proximo}` });
      if (r && (r as { ok?: boolean }).ok === false) { toast.warn('Não deu para aprimorar agora. Tente de novo.'); return; }
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
   * COMPRA COM CRÉDITOS — a moeda que custou dinheiro.
   *
   * Gêmea de `comprar`, com uma diferença que importa: a posse do que se paga NÃO é marcada
   * localmente. Ela vem do servidor na próxima leitura da carteira (`credit_spends`), porque nada
   * comprado com dinheiro pode viver em localStorage. Por isso o `recarregar()` no fim.
   */
  const comprarComCreditos = async (item: ItemDaLoja, el: HTMLElement | null) => {
    if (item.precoCreditos === undefined) return;
    if ((carteira.creditos ?? 0) < item.precoCreditos) {
      toast.warn(`Faltam ${item.precoCreditos - (carteira.creditos ?? 0)} Créditos. Eles se compram aqui embaixo, ou vêm no Passe.`);
      return;
    }
    setComprando(item.id);
    try {
      const r = await gastarCreditos({ spendId: `premium-${item.id}`, amount: item.precoCreditos, reason: `premium:${item.id}` });
      if (!r) { toast.warn('Não deu para completar a compra agora. Tente de novo.'); return; }
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
      // spendId fixo por item: comprar de novo (retry, aba duplicada) NÃO cobra de novo.
      const r = await gastarSeeds({ spendId: `loja-${item.id}`, amount: item.precoSeeds, reason: `loja:${item.id}` });
      if (r && (r as { ok?: boolean }).ok === false) {
        toast.warn('Não deu para completar a compra agora. Tente de novo.');
        return;
      }
      marcarPosse(item.id);
      recemComprados.add(item.id);
      comemorar('subiuNivel', el, { texto: 'Seu!' });
      explodirAleatorio(3, 'confete');
      toast.ok(`${item.nome} é seu!`);
      force((n) => n + 1);
    } catch {
      toast.warn('Não deu para completar a compra agora. Tente de novo.');
    } finally {
      setComprando(null);
    }
  };


  /**
   * UM CARTÃO DA PRATELEIRA — compacto, com o PREÇO legível de longe.
   *
   * O QUE MUDOU (pedido do dono, 01/09: "os produtos não estão sendo exibidos de forma
   * atrativa"): o cartão anterior era alto e falava por texto — nome, descrição inteira, e o
   * preço escondido dentro da frase "Nível 9 ou 550 Seeds" num botão cinza de cadeado. Numa
   * loja, o preço é a segunda coisa que se lê depois da arte, e a MOEDA precisa ter cara.
   *
   * Agora: arte, nome, e uma linha de preço com OS DOIS CAMINHOS lado a lado e iconados — a
   * Seed (verde, estudo) e o nível (cadeado). A pessoa vê de relance o que custa e como se
   * consegue sem comprar.
   */
  const CartaoDaLoja = ({ item, destaque }: { item: ItemDaLoja; destaque?: boolean }) => {
    const { estado } = estadoDoItem(item, nivel, saldo);
    const raridade = COR_DA_RARIDADE[item.raridade];
    const equipado = estado === 'equipavel' && equipadoAtual(item);
    const preco = item.precoSeeds;
    const falta = preco !== undefined ? preco - saldo : 0;
    const apr = item.tipo === 'aprimoramento';
    const custoApr = apr ? custoDoProximoNivel(item.alvo) : null;

    return (
      <div
        className={`rounded-2xl border-2 ${raridade.borda} bg-surface overflow-hidden flex flex-col transition-transform hover:-translate-y-1 ${
          estado === 'bloqueado' && !apr ? 'opacity-75' : ''
        } ${destaque ? 'sm:flex-row' : ''}`}
        onMouseEnter={(e) => {
          // Prévia VIVA: partículas soltam uma amostra ao passar o mouse no cartão delas.
          if (item.tipo === 'particulas' && estado !== 'bloqueado') {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            emitBurst(r.left + r.width / 2, r.top + r.height / 3, 'xp');
          }
        }}
      >
        <div className={`${raridade.fundo} flex items-center justify-center relative shrink-0 ${
          destaque ? 'h-32 sm:h-auto sm:w-48' : 'h-20'
        }`}>
          <MiniaturaDoItem item={item} tam="grande" />
          <span className="absolute top-1.5 right-1.5 font-mono text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-canvas/75 text-ink-muted">
            {raridade.rotulo}
          </span>
        </div>

        <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
          <h3 className={`font-display font-black text-ink leading-tight ${destaque ? 'text-[17px]' : 'text-[13px] line-clamp-2'}`}>
            {item.nome}
          </h3>
          <p className={`text-[11.5px] text-ink-muted leading-snug flex-1 ${destaque ? '' : 'line-clamp-2'}`}>{item.desc}</p>

          {apr ? (() => {
            const nv = nivelDoAprimoramento(item.alvo);
            const pct = progressoDoAprimoramento(item.alvo);
            return (
              <>
                <div>
                  <div className="flex items-center justify-between text-[10.5px] font-black mb-1">
                    <span className="text-ink">Nv. {nv} / {NIVEL_MAXIMO}</span>
                    <span className="text-ink-muted tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-canvas border border-border-subtle overflow-hidden">
                    <div className="h-full rounded-full bg-warn transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {custoApr === null ? (
                  <div className="w-full py-2 rounded-xl bg-warn/15 border border-warn text-center text-[12px] font-black text-warn-ink">★ Dominado</div>
                ) : (
                  <button
                    onClick={(e) => void aprimorar(item, e.currentTarget)}
                    disabled={comprando === item.id || saldo < custoApr}
                    className="w-full py-2 rounded-xl bg-warn hover:brightness-110 text-white font-bold text-[12.5px] shadow-btn cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sprout className="w-3.5 h-3.5" aria-hidden />
                      {comprando === item.id ? 'Aprimorando…' : saldo < custoApr ? `Faltam ${custoApr - saldo}` : `Aprimorar · ${custoApr}`}
                    </span>
                  </button>
                )}
              </>
            );
          })() : estado === 'equipavel' ? (
            <button
              onClick={(e) => equiparAgora(item, e.currentTarget)}
              className={`w-full py-2 rounded-xl font-bold text-[12.5px] cursor-pointer ${
                equipado ? 'bg-good-soft text-good-ink' : 'bg-accent text-accent-contrast hover:brightness-110'
              }`}
            >
              {equipado
                ? <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" aria-hidden /> {TEXTOS.emUso}</span>
                : item.tipo === 'estudio' ? 'Abrir o Estúdio'
                : equipavel(item) ? <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" aria-hidden /> {TEXTOS.equiparAgora}</span>
                : <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" aria-hidden /> usar no Meu visual</span>}
            </button>
          ) : (
            item.precoCreditos !== undefined ? (
              /* PREMIUM: uma via só, e a tela diz qual. Nível e Seeds não abrem — como o
                 exclusivo de conquista, misturar as moedas apagaria a diferença entre
                 "ganhei estudando" e "paguei". */
              <>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
                  <span className="inline-flex items-center gap-1 font-mono font-bold text-[13px] text-premium tabular-nums">
                    <Coins className="w-3.5 h-3.5" aria-hidden /> {item.precoCreditos}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-faint">
                    <Crown className="w-3 h-3" aria-hidden /> ou no Passe
                  </span>
                </div>
                {carteira.disponivel ? (
                  <button
                    onClick={(e) => void comprarComCreditos(item, e.currentTarget)}
                    disabled={comprando === item.id}
                    className="w-full py-2 rounded-xl bg-premium hover:brightness-110 text-white font-bold text-[12.5px] shadow-btn cursor-pointer disabled:opacity-60"
                  >
                    {comprando === item.id ? 'Comprando…'
                      : (carteira.creditos ?? 0) < item.precoCreditos ? `Faltam ${item.precoCreditos - (carteira.creditos ?? 0)}`
                      : 'Comprar com Créditos'}
                  </button>
                ) : (
                  <div className="w-full py-2 rounded-xl bg-canvas border border-border-subtle text-center text-[11.5px] font-bold text-ink-muted">
                    Sem compra nesta instalação
                  </div>
                )}
              </>
            ) : (
            <>
              {/* OS DOIS CAMINHOS, lado a lado e iconados. Antes viviam colados numa frase
                  ("Nível 9 ou 550 Seeds") dentro de um botão cinza — e o cinza dizia
                  "indisponível" sobre a informação que mais importa numa loja. */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
                {preco !== undefined ? (
                  <span className="inline-flex items-center gap-1 font-mono font-bold text-[13px] text-good tabular-nums">
                    <Sprout className="w-3.5 h-3.5" aria-hidden /> {preco}
                  </span>
                ) : <span className="text-[11.5px] text-ink-faint">só por nível</span>}
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-faint">
                  <Lock className="w-3 h-3" aria-hidden /> nv. {item.nivel}
                </span>
              </div>
              {estado === 'compravel' ? (
                <button
                  onClick={(e) => void comprar(item, e.currentTarget)}
                  disabled={comprando === item.id}
                  className="w-full py-2 rounded-xl bg-good hover:brightness-110 text-white font-bold text-[12.5px] shadow-btn cursor-pointer disabled:opacity-60"
                >
                  {comprando === item.id ? 'Comprando…' : 'Comprar com Seeds'}
                </button>
              ) : (
                <div className="w-full py-2 rounded-xl bg-canvas border border-border-subtle text-center text-[11.5px] font-bold text-ink-muted">
                  {preco !== undefined && falta > 0 ? `Faltam ${falta} Seeds` : `Chega no nível ${item.nivel}`}
                </div>
              )}
            </>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto custom-scrollbar" aria-label="Personalizar">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in duration-300">
      {/* ── CABEÇALHO DE TEMPORADA (protótipo aprovado 01/09) ──
             O herói anterior era um cartão de configuração: título em `font-marca` (a família
             fora do tema que fazia esta tela parecer de outro app), dois blobs e três parágrafos
             de explicação. Passe de jogo abre com temporada, carteira e barra — e a explicação
             desce para onde a dúvida aparece. A "próxima recompensa" saiu daqui porque o Passe
             agora responde isso melhor: a casa atual vem com anel e a página abre nela. */}
      <CabecalhoDeTemporada
        progress={progress}
        saldo={saldo}
        carteira={carteira}
        temporada={{ numero: 1, nome: 'Fundação' }}
        aoComprarCreditos={() => setAba('loja')}
      />

      <Abas
        rotuloDoGrupo="Áreas de Personalizar"
        ativo={aba}
        aoTrocar={setAba}
        itens={[
          { id: 'passe', rotulo: 'Passe', icone: <Ticket className="w-4 h-4" /> },
          // "Meu visual", não "Biblioteca": biblioteca já é a tela de mídias (rota /biblioteca)
          // — mesmo nome para dois lugares confundia (ux-v2 §1.2); o cabeçalho desta tela já
          // chama o que é seu de "Meu visual".
          { id: 'personalizar', rotulo: `Meu visual · ${colecao.possuidos.length}`, icone: <Shirt className="w-4 h-4" /> },
          { id: 'loja', rotulo: `Loja · ${colecao.compraveis.length + colecao.porNivel.length}`, icone: <ShoppingBag className="w-4 h-4" /> },
          { id: 'conquistas', rotulo: `Desafios · ${colecao.porConquista.length}`, icone: <Trophy className="w-4 h-4" /> },
        ]}
      />

      <PainelDeAba id="passe" ativo={aba}>
      {semConta ? <CartaoDeConvite view="passe" onEntrar={() => onEntrar?.()} onVoltar={() => setAba('personalizar')} /> : (
        <PasseDeTemporada progress={progress} ctxEquipar={ctxEquipar} equipadoAtual={equipadoAtual} temPasse={carteira.temPasse}
          aoComprarPasse={carteira.disponivel ? () => { setAba('loja'); setFiltro('tudo'); } : undefined} />
      )}
      </PainelDeAba>

      <PainelDeAba id="personalizar" ativo={aba}>
        <Personalizar
          theme={theme} setTheme={setTheme} fonte={fonte} setFonte={setFonte}
          nivel={nivel} saldo={saldo}
          ageProfile={ageProfile} setAgeProfile={setAgeProfile}
          menuPosition={menuPosition} setMenuPosition={setMenuPosition}
          onOpenStudio={onOpenStudio}
          onIrParaLoja={() => { setAba('loja'); setFiltro('galeria'); }}
        />
      </PainelDeAba>

      <PainelDeAba id="conquistas" ativo={aba}>
      {semConta ? <CartaoDeConvite view="conquistas" onEntrar={() => onEntrar?.()} onVoltar={() => setAba('personalizar')} /> : (
        <Conquistas progress={progress} ctx={ctxConquistas} />
      )}
      </PainelDeAba>

      {/* A antiga aba Progressão (grade nível-a-nível) foi absorvida pelo Passe: mesma
          informação, na apresentação aprovada do protótipo. */}
      <PainelDeAba id="loja" ativo={aba}>
      {semConta ? <CartaoDeConvite view="loja" onEntrar={() => onEntrar?.()} onVoltar={() => setAba('personalizar')} /> : (
      <div className="space-y-8">
      {/* ── AS DUAS MOEDAS, DECLARADAS ────────────────────────────────────────────────
             O dono: "não estamos informando os dois tipos de moeda". A carteira do cabeçalho
             mostra os SALDOS, mas em lugar nenhum a loja dizia o que cada moeda É, de onde ela
             vem e o que ela compra — e essa é a primeira pergunta de quem chega numa loja com
             duas moedas. A linha que separa as duas é a que separa este app de um pay-to-win,
             então ela fica escrita, e não subentendida. */}
      <section className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border-2 border-good/40 bg-good-soft p-4">
          <p className="flex items-center justify-between gap-2 mb-1.5">
            <span className="inline-flex items-center gap-2 font-display font-black text-[15px] text-ink">
              <Sprout className="w-4 h-4 text-good" aria-hidden /> Seeds
            </span>
            <b className="font-mono font-bold text-[17px] text-good tabular-nums">{saldo}</b>
          </p>
          <p className="text-[12px] text-ink-muted leading-relaxed">
            Vêm de <b className="text-ink">estudar</b>: revisar, jogar, aparecer no dia. Compram
            tudo o que está nesta página. <b className="text-ink">Não se compram com dinheiro</b> —
            nunca vão estar à venda.
          </p>
        </div>

        <div className="rounded-2xl border-2 border-premium/40 bg-premium-soft p-4">
          <p className="flex items-center justify-between gap-2 mb-1.5">
            <span className="inline-flex items-center gap-2 font-display font-black text-[15px] text-ink">
              <Coins className="w-4 h-4 text-premium" aria-hidden /> Créditos
            </span>
            <b className="font-mono font-bold text-[17px] text-premium tabular-nums">
              {carteira.disponivel ? carteira.creditos ?? '—' : '—'}
            </b>
          </p>
          <p className="text-[12px] text-ink-muted leading-relaxed">
            Compram-se com dinheiro e pagam o <b className="text-ink">Passe Premium</b> e a
            prateleira paga. <b className="text-ink">Não compram progresso</b>: nível, XP, Seeds e
            conquista só saem estudando.
          </p>
          {!carteira.disponivel && (
            <p className="text-[11.5px] text-ink-faint mt-2 leading-snug">
              Nesta instalação não há compra com dinheiro — sem conta e sem cobrança
              configurada, não existe o que vender.
            </p>
          )}
        </div>
      </section>

      {/* O CAMINHO GRÁTIS, numa linha. Aqui havia uma parede de chips com os 8 itens do
          próximo nível — a mesma informação que o Passe mostra inteira e melhor. A frase fica
          (é ela que lembra que subir de nível entrega coisa sem pagar nada) e o wall vai
          embora, com um atalho para onde ela é desenhada. */}
      {proxima && (
        <p className="text-[12.5px] text-ink-muted flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-accent shrink-0" aria-hidden />
          No nível {proxima.nivel} você libera <b className="text-ink">{proxima.itens.length} peças de graça</b>, só estudando.
          <button onClick={() => setAba('passe')} className="underline text-accent-ink cursor-pointer">Ver no Passe</button>
        </p>
      )}

      {/* ── O DESTAQUE — uma vitrine tem uma peça na frente ────────────────────────────
             Escolhido por regra, não por sorteio: o mais caro que o SALDO paga hoje; sem nada
             ao alcance, o que falta menos. Assim o destaque é sempre acionável ou quase — que é
             o que uma vitrine tem de ser. */}
      {emDestaque && (
        <section>
          <p className="label-mono mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" aria-hidden /> Em destaque
          </p>
          <CartaoDaLoja item={emDestaque} destaque />
        </section>
      )}

      {/* ── FILTROS ── */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer border transition-colors ${
              filtro === f.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-surface border-border-subtle text-ink-muted hover:text-ink hover:border-accent'
            }`}
          >
            {f.nome}
          </button>
        ))}
      </div>

      {itens.length === 0 && (
        <p className="text-center text-[13px] text-ink-muted py-6">Nada para comprar neste filtro: tudo já é seu. Veja em <button onClick={() => setAba('personalizar')} className="underline text-accent-ink cursor-pointer">Meu visual</button>.</p>
      )}

      {/* ── AS DUAS PRATELEIRAS (mudança inventario-e-cromas, tarefa 3.3) ──────────────
             A Loja mostrava 51 itens numa grade só, quase todos trancados: no nível 1 a tela era
             uma parede de cadeados, e conforme a pessoa comprava ela ESVAZIAVA. Separar por "dá
             para levar agora" e "ainda não" resolve os dois lados — a primeira prateleira nunca
             é a mais longa, e a segunda vira vitrine do que vem, que é o que faz querer voltar. */}
      {naPrateleira(podeAgora).length === 0 && podeAgora.length === 0 ? (
        <p className="text-[13px] text-ink-muted flex items-start gap-2 max-w-[70ch]">
          <Sprout className="w-4 h-4 text-good shrink-0 mt-0.5" aria-hidden />
          <span>
            Nada cabe no saldo de {saldo} Seeds agora. Elas vêm de estudar — revisar, jogar,
            aparecer — e o que está logo abaixo é o que falta menos.
          </span>
        </p>
      ) : naPrateleira(podeAgora).length > 0 ? (
        <section>
          <p className="label-mono mb-3 flex items-center gap-1.5">
            <Sprout className="w-3.5 h-3.5 text-good" aria-hidden /> Dá para levar agora · {naPrateleira(podeAgora).length}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {naPrateleira(podeAgora).map((item) => <CartaoDaLoja key={item.id} item={item} />)}
          </div>
        </section>
      ) : null}

      {aindaNao.length > 0 && (
        <section>
          <p className="label-mono mb-3 flex items-center gap-1.5 flex-wrap">
            <Lock className="w-3.5 h-3.5" aria-hidden /> Ainda não · {naPrateleira(aindaNao).length}
            <span className="font-sans normal-case tracking-normal text-ink-faint">
              — o que falta menos vem primeiro; nada aqui expira
            </span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {naPrateleira(aindaNao).map((item) => <CartaoDaLoja key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {/* ── A PRATELEIRA PAGA ─────────────────────────────────────────────────────────
             `ORIGEM.creditos` anunciava "Passe Premium e prateleira paga" desde a régua das
             quatro origens — e a prateleira não existia: nenhum item tinha preço em Créditos, e
             `creditsRepo.debitar` nunca era chamado. Quem pagasse R$ 49,90 recebia um número que
             não comprava nada. Aqui ele passa a comprar. */}
      {premium.length > 0 && (
        <section>
          <p className="label-mono mb-3 flex items-center gap-1.5 flex-wrap">
            <Coins className="w-3.5 h-3.5 text-premium" aria-hidden /> Com Créditos · {premium.length}
            <span className="font-sans normal-case tracking-normal text-ink-faint">
              — vêm de graça no Passe da temporada, ou avulsos aqui
            </span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {premium.map((item) => <CartaoDaLoja key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {/* ── O QUE SE PAGA COM DINHEIRO. Fica DEPOIS de tudo que se ganha estudando, e não
             antes: a ordem da tela é a ordem da prioridade. */}
      <ComprarCreditos />

      {/* O rodapé lê das REGRAS: o que a Loja diz sobre ganhar Seeds é o que o sistema credita. */}
      <p className="text-center text-[11.5px] text-ink-faint pb-4">
        Seeds se ganham fazendo: {REGRAS.filter((r) => r.seeds > 0).slice(0, 4).map((r) => `${r.seeds} ${r.unidade}`).join(' · ')}.
        {' '}<button onClick={() => setAba('conquistas')} className="underline hover:text-accent cursor-pointer">Ver todas as regras</button>. Seeds não se compram com dinheiro: só estudando.
      </p>
      </div>
      )}
      </PainelDeAba>
    </div>
    </div>
  );
}
