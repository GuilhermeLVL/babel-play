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
import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Sprout, Lock, Check, Sparkles, Palette, Type, Gamepad2, PanelRight, Wand2, Trophy, Shirt, Ticket } from 'lucide-react';
import { Abas, PainelDeAba } from '../ui';
import Conquistas from './Conquistas';
import PasseDeTemporada from './passe/PasseDeTemporada';
import Personalizar from './Personalizar';
import { REGRAS, type ContextoDeConquistas } from '@core';
import {
  CATALOGO_DA_LOJA, COR_DA_RARIDADE, estadoDoItem, marcarPosse, type ItemDaLoja,
} from '../../lib/loja';
import { proximaRecompensa, estadoDaColecao, emojiDoItem } from '../../lib/galeria/progressao';
import { equiparItem, equipavel, type ContextoDeEquipar } from '../../lib/galeria/equipar';
import { TEXTOS } from '../../lib/galeria/textos';
import ComprarCreditos from './loja/ComprarCreditos';
import CabecalhoDeTemporada from './loja/CabecalhoDeTemporada';
import { useCarteira } from '../../lib/carteira';
import { gastarSeeds } from '../../data/api';
import { toast } from '../Toast';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { readParticulas, readPack, PACKS_DE_EMOJI } from '../../lib/particulas';
import { readCursor, CURSORES } from '../../lib/cursores';
import { readRastro } from '../../lib/rastroDoMouse';
import {
  nivelDoAprimoramento, custoDoProximoNivel, registrarAprimoramento, progressoDoAprimoramento,
  NIVEL_MAXIMO, lerIntensidade, setIntensidade, intensidadeMaxima, type Intensidade,
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
  /** Contexto das conquistas (montado no App). A aba "Conquistas" mora aqui na edição leve,
   *  onde o Perfil não existe. */
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
}

const ICONE_DO_TIPO: Record<string, React.ReactNode> = {
  tema: <Palette className="w-3.5 h-3.5" />,
  fonte: <Type className="w-3.5 h-3.5" />,
  particulas: <Sparkles className="w-3.5 h-3.5" />,
  posicao: <PanelRight className="w-3.5 h-3.5" />,
  estudio: <Wand2 className="w-3.5 h-3.5" />,
};

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
const ABAS_VALIDAS = ['passe', 'personalizar', 'loja', 'conquistas'] as const;
const ALIAS_DE_ABA: Record<string, string> = { progressao: 'passe' };

export default function Loja({ progress, theme, setTheme, fonte, setFonte, menuPosition, setMenuPosition, onOpenStudio, ctxConquistas, ageProfile, setAgeProfile, abaInicial, aoTrocarDeAba, equiparCtx }: LojaProps) {
  // A tela ÚNICA abre no Meu visual: personalizar é o uso; comprar e conquistar são os caminhos.
  const normalizarAba = (a: string | undefined | null): string | null => {
    const alvo = a ? (ALIAS_DE_ABA[a] ?? a) : null;
    return alvo && ABAS_VALIDAS.includes(alvo as never) ? alvo : null;
  };
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
  const podeAgora = itens.filter((i) => { const c = custoDe(i); return c !== null && saldo >= c; });
  const aindaNao = itens
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
   * UM CARTÃO DA PRATELEIRA. Virou função para a Loja poder desenhar DUAS prateleiras com
   * o mesmo desenho: o que dá para levar agora e o que ainda não dá. Enquanto era um map
   * único, os dois estados se misturavam e a tela lia como uma parede de cadeados.
   */
  const CartaoDaLoja = ({ item }: { item: ItemDaLoja }) => {
      const { estado, motivo } = estadoDoItem(item, nivel, saldo);
      const raridade = COR_DA_RARIDADE[item.raridade];
      const equipado = estado === 'equipavel' && equipadoAtual(item);
      return (
        <div
          key={item.id}
          className={`card-panel overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-card border-2 ${raridade.borda} ${estado === 'bloqueado' ? 'opacity-80' : ''}`}
          onMouseEnter={(e) => {
            // Prévia VIVA: partículas soltam uma amostra ao passar o mouse no card delas.
            if (item.tipo === 'particulas' && estado !== 'bloqueado') {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              emitBurst(r.left + r.width / 2, r.top + r.height / 3, 'xp');
            }
          }}
        >
          {/* Prévia */}
          <div className={`h-24 flex items-center justify-center gap-2 ${raridade.fundo} border-b ${raridade.borda}`}>
            {item.previa ? (
              <span className="flex -space-x-1.5">
                {item.previa.map((c, i) => (
                  <span key={i} className="w-9 h-9 rounded-full border-2 border-surface shadow-sm shrink-0" style={{ backgroundColor: c }} />
                ))}
              </span>
            ) : item.tipo === 'particulas' ? (
              <span className="font-display font-black text-3xl select-none" aria-hidden>
                {item.alvo === 'coracoes' ? '💛🧡❤️' : item.alvo === 'estrelas' ? '⭐✨🌟' : item.alvo === 'confete' ? '🎊🎉' : item.alvo === 'emoji' ? PACKS_DE_EMOJI.find((pk) => pk.id === readPack())?.emojis.slice(0, 3).join('') : '🟧🟨🟩'}
              </span>
            ) : item.tipo === 'pack' ? (
              <span className="font-display font-black text-2xl select-none tracking-wider" aria-hidden>
                {PACKS_DE_EMOJI.find((pk) => pk.id === item.alvo)?.emojis.slice(0, 4).join(' ')}
              </span>
            ) : item.tipo === 'cursor' ? (
              <span className="font-display font-black text-4xl select-none" aria-hidden>
                {CURSORES.find((c) => c.id === item.alvo)?.emoji}
              </span>
            ) : item.tipo === 'rastro' ? (
              <span className="font-display font-black text-3xl select-none" aria-hidden>
                {item.alvo === 'off' ? '🚫' : item.alvo === 'coracoes' ? '🖱️💨❤️' : item.alvo === 'estrelas' ? '🖱️💨⭐' : item.alvo === 'emoji' ? '🖱️💨🦆' : '🖱️💨✨'}
              </span>
            ) : item.tipo === 'aprimoramento' ? (
              <span className="font-display font-black text-4xl select-none" aria-hidden>
                {item.alvo === 'sorte' ? '🎲' : '💥'}
              </span>
            ) : item.tipo === 'estudio' ? (
              <Wand2 className="w-10 h-10 text-warn" aria-hidden />
            ) : item.tipo === 'galeria' ? (
              <span className="font-display font-black text-3xl select-none" aria-hidden>
                {item.alvo.startsWith('estilo:') ? '🎨' : item.alvo === 'editor-pack' ? '✏️' : item.alvo === 'cursor-emoji' ? '🖱️' : (item.desc.match(/\p{Extended_Pictographic}+/gu) ?? ['✨']).slice(0, 3).join('')}
              </span>
            ) : (
              <Gamepad2 className="w-10 h-10 text-ink-muted" aria-hidden />
            )}
          </div>

          <div className="p-4 flex flex-col gap-2 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-[14px] text-ink leading-tight">{item.nome}</h3>
              <span className={`shrink-0 text-[9.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${raridade.borda} ${raridade.fundo} text-ink`}>
                {raridade.rotulo}
              </span>
            </div>
            <p className="text-[12px] text-ink-muted leading-snug flex-1">{item.desc}</p>

            {item.tipo === 'aprimoramento' ? (
              (() => {
                const nv = nivelDoAprimoramento(item.alvo);
                const custo = custoDoProximoNivel(item.alvo);
                const pct = progressoDoAprimoramento(item.alvo);
                return (
                  <div className="space-y-2">
                    {/* A barra de progressão do upgrade — o "battle pass" do item. */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-black mb-1">
                        <span className="text-ink">Nv. {nv} / {NIVEL_MAXIMO}</span>
                        <span className="text-ink-muted tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-canvas border border-border-subtle overflow-hidden">
                        <div className="h-full rounded-full bg-warn transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {custo === null ? (
                      <div className="w-full py-2 rounded-xl bg-warn/15 border border-warn text-center text-[12.5px] font-black text-warn-ink">★ Dominado</div>
                    ) : (
                      <button
                        onClick={(e) => void aprimorar(item, e.currentTarget)}
                        disabled={comprando === item.id || saldo < custo}
                        className="w-full py-2.5 rounded-xl bg-warn hover:brightness-110 text-white font-bold text-[13px] shadow-btn transition-all cursor-pointer disabled:opacity-50"
                      >
                        <span className="inline-flex items-center gap-1.5"><Sprout className="w-4 h-4" /> {comprando === item.id ? 'Aprimorando…' : `Aprimorar · ${custo} Seeds`}</span>
                      </button>
                    )}
                    {item.alvo === 'particulas' && nv > 0 && (
                      <div>
                        <p className="text-[10.5px] uppercase tracking-wider font-black text-ink-faint mb-1">Intensidade (sua escolha)</p>
                        <div className="grid grid-cols-3 gap-1 p-1 bg-canvas border border-border-subtle rounded-xl">
                          {(['pequena', 'media', 'grande'] as Intensidade[]).map((intz) => {
                            const teto = intensidadeMaxima(nv);
                            const permitida = ['pequena', 'media', 'grande'].indexOf(intz) <= ['pequena', 'media', 'grande'].indexOf(teto);
                            return (
                              <button
                                key={intz}
                                disabled={!permitida}
                                onClick={(e) => {
                                  setIntensidade(intz);
                                  force((n) => n + 1);
                                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  emitBurst(r.left + r.width / 2, r.top, 'xp');
                                }}
                                aria-pressed={lerIntensidade() === intz}
                                className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  lerIntensidade() === intz ? 'bg-accent text-accent-contrast' : 'text-ink-muted hover:text-ink'
                                }`}
                                title={permitida ? undefined : `Requer Nv. ${intz === 'grande' ? 2 : 1}`}
                              >
                                {intz === 'pequena' ? 'Pequena' : intz === 'media' ? 'Média' : 'Grande'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : estado === 'equipavel' ? (
              /* Recém-comprado: "Equipar agora" pelo caminho único; capacidade da galeria leva ao Meu visual. */
              <button
                onClick={(e) => equiparAgora(item, e.currentTarget)}
                className={`w-full py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer ${
                  equipado ? 'bg-good-soft text-good-ink' : 'bg-accent text-accent-contrast hover:brightness-110'
                }`}
              >
                {equipado
                  ? <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> {TEXTOS.emUso}</span>
                  : item.tipo === 'estudio' ? 'Abrir o Estúdio'
                  : equipavel(item) ? <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> {TEXTOS.liberado} · {TEXTOS.equiparAgora}</span>
                  : <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> {TEXTOS.liberado} · usar no Meu visual</span>}
              </button>
            ) : estado === 'compravel' ? (
              <button
                onClick={(e) => void comprar(item, e.currentTarget)}
                disabled={comprando === item.id}
                className="w-full py-2.5 rounded-xl bg-good hover:brightness-110 text-white font-bold text-[13px] shadow-btn transition-all cursor-pointer disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Sprout className="w-4 h-4" /> {comprando === item.id ? 'Comprando…' : TEXTOS.obter(item.precoSeeds!)}
                </span>
              </button>
            ) : (
              <div className="w-full py-2.5 rounded-xl bg-canvas border border-border-subtle text-center text-[12.5px] font-bold text-ink-muted">
                <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {motivo}</span>
              </div>
            )}
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
        <PasseDeTemporada progress={progress} ctxEquipar={ctxEquipar} equipadoAtual={equipadoAtual} temPasse={carteira.temPasse}
          aoComprarPasse={carteira.disponivel ? () => { setAba('loja'); setFiltro('tudo'); } : undefined} />
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
        <Conquistas progress={progress} ctx={ctxConquistas} />
      </PainelDeAba>

      {/* A antiga aba Progressão (grade nível-a-nível) foi absorvida pelo Passe: mesma
          informação, na apresentação aprovada do protótipo. */}
      <PainelDeAba id="loja" ativo={aba}>
      <div className="space-y-8">
      {/* ── NO PRÓXIMO NÍVEL: o motivo de continuar ── */}
      {proxima && (
        <section className="card-panel bg-canvas border-accent/30 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-accent-ink mb-3">
            <Sparkles className="w-4 h-4" /> No nível {proxima.nivel} você libera de graça
          </p>
          <div className="flex flex-wrap gap-2">
            {proxima.itens.map((i) => (
              <span key={i.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12.5px] font-bold text-ink ${COR_DA_RARIDADE[i.raridade].borda} ${COR_DA_RARIDADE[i.raridade].fundo}`}>
                {ICONE_DO_TIPO[i.tipo] ?? <span aria-hidden>{emojiDoItem(i)}</span>} {i.nome}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── FILTROS ── */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`px-4 py-2 rounded-xl text-[12.5px] font-bold cursor-pointer border transition-colors ${
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

      {/* ── PRATELEIRAS ── */}
      {/* ── AS DUAS PRATELEIRAS (mudança inventario-e-cromas, tarefa 3.3) ──────────────
             A Loja mostrava 51 itens numa grade só, quase todos trancados: no nível 1 a tela era
             uma parede de cadeados, e conforme a pessoa comprava ela ESVAZIAVA. Separar por "dá
             para levar agora" e "ainda não" resolve os dois lados — a primeira prateleira nunca
             é a mais longa, e a segunda vira vitrine do que vem, que é o que faz querer voltar. */}
      {podeAgora.length === 0 ? (
        <p className="text-[13px] text-ink-muted flex items-start gap-2 max-w-[70ch]">
          <Sprout className="w-4 h-4 text-good shrink-0 mt-0.5" aria-hidden />
          <span>
            Nada cabe no saldo de {saldo} Seeds agora. Elas vêm de estudar — revisar, jogar,
            aparecer — e o que está logo abaixo é o que falta menos.
          </span>
        </p>
      ) : (
        <section>
          <p className="label-mono mb-3 flex items-center gap-1.5">
            <Sprout className="w-3.5 h-3.5 text-good" aria-hidden /> Dá para levar agora · {podeAgora.length}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {podeAgora.map((item) => <CartaoDaLoja key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {aindaNao.length > 0 && (
        <section>
          <p className="label-mono mb-3 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" aria-hidden /> Ainda não · {aindaNao.length}
            <span className="font-sans normal-case tracking-normal text-ink-faint">
              — o que falta menos vem primeiro; nada aqui expira
            </span>
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {aindaNao.map((item) => <CartaoDaLoja key={item.id} item={item} />)}
          </div>
        </section>
      )}


      {/* A PRATELEIRA PAGA (economia-legivel-e-moedas). Fica DEPOIS de tudo que se ganha
          estudando, e não antes: a ordem da tela é a ordem da prioridade — primeiro o que a
          pessoa conquista, por último o que ela pode comprar. */}
      <ComprarCreditos />

      {/* O rodapé lê das REGRAS: o que a Loja diz sobre ganhar Seeds é o que o sistema credita. */}
      <p className="text-center text-[11.5px] text-ink-faint pb-4">
        Seeds se ganham fazendo: {REGRAS.filter((r) => r.seeds > 0).slice(0, 4).map((r) => `${r.seeds} ${r.unidade}`).join(' · ')}.
        {' '}<button onClick={() => setAba('conquistas')} className="underline hover:text-accent cursor-pointer">Ver todas as regras</button>. Seeds não se compram com dinheiro: só estudando.
      </p>
      </div>
      </PainelDeAba>
    </div>
    </div>
  );
}
