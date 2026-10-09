import { Check, Crown, Lock, Palette, Sprout, Trophy, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { gastarSeeds } from '../../../data/api';
import { applyCustomColors, readCustomColors, THEME_OPTIONS, type ThemeType } from '../../../lib/appearance';
import {
  type Croma,
  cromaEquipado,
  cromasDaPeca,
  equiparCroma,
  idDoCroma,
  marcarCroma,
  temOCroma,
} from '../../../lib/galeria/cromas';
import { MATIZES } from '../../../lib/galeria/paletas';
import { CATALOGO_DA_LOJA, estadoDoItem, type ItemDaLoja } from '../../../lib/loja';
import { FORMAS_DE_RASTRO, idDeRastroDeCroma, readRastro, setRastro } from '../../../lib/rastroDoMouse';
import { persistTheme } from '../../../lib/theme';
import { toast } from '../../Toast';
import { IconeEmBloco } from '../../ui';
import CoresDoTema, { corCalculada, type CoresLivres } from './CoresDoTema';
import SeletorDePaletas from './SeletorDePaletas';

/**
 * EDITOR CONTEXTUAL DE UM ITEM (mudança inventario-e-cromas; protótipo aprovado em 01/09).
 *
 * ELE ABSORVEU O ACORDEÃO "MONTE O SEU, PEÇA POR PEÇA". Aquelas oito seções ficavam embaixo do
 * inventário e, em sete delas, ofereciam de novo o que a grade já fazia: escolher tema, fonte,
 * partícula, cursor, rastro, posição do menu. Era a mesma decisão em dois lugares com dois
 * desenhos — uma das fontes do "tudo parece mudar demais, nada parece estar ligado".
 *
 * O QUE SOBROU DELAS não era repetição, era PROFUNDIDADE: as 200 paletas e a forma × cor do
 * rastro. (O editor do pack de emojis, o cursor de qualquer emoji, o rastro de emojis escolhidos e
 * a intensidade dos aprimoramentos saíram nas recompensas v2, 27/09.) Isso não some — muda de
 * lugar. Cada um agora abre a partir da SUA peça, que é onde a pergunta nasce: quem quer outra
 * cor de tema clica no tema; quem quer escolher os emojis do rastro clica no rastro.
 *
 * DUAS REGRAS QUE ESTE COMPONENTE MANTÉM:
 *
 * 1. **O controle é do TIPO.** Cada peça abre o que é dela, e o tipo sem parâmetro nenhum não
 *    ganha botão que abriria uma janela vazia (`temPersonalizacao`).
 * 2. **Croma custa, e a compra é explícita.** Clicar num croma trancado NUNCA gasta sozinho:
 *    confere o saldo antes, porque moeda gasta por engano é a reclamação clássica de loja de
 *    jogo. As vias que não são de Seeds (conquista e Premium) dizem de onde saem em vez de
 *    recusar seco.
 */

interface Props {
  item: ItemDaLoja;
  nivel: number;
  /** Saldo de Seeds — o editor precisa dele para saber se a compra cabe ANTES de perguntar. */
  saldo: number;
  aoFechar: () => void;
  /** Aplica a peça (o mesmo caminho único de equipar que a tela usa). */
  aoEquipar: () => void;
  /** Depois de comprar: a tela relê saldo e posse. */
  aoComprar?: () => void;
  /** Paleta aplicada = tema `custom`; quem manda no tema é a tela de fora. */
  setTheme: (t: ThemeType) => void;
  onIrParaLoja?: () => void;
}

/** Peças cuja COR varia: as três que sabem pintar o que mostram. */
export function temCroma(item: ItemDaLoja): boolean {
  return item.tipo === 'particulas' || item.tipo === 'rastro' || item.tipo === 'tema';
}

/** O que cada tipo abre. Vazio = não há o que personalizar (e o botão nem aparece). */
export function temPersonalizacao(item: ItemDaLoja): boolean {
  return temCroma(item);
}

export default function EditorDoItem({
  item,
  nivel,
  saldo,
  aoFechar,
  aoEquipar,
  aoComprar,
  setTheme,
  onIrParaLoja,
}: Props) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  /* O diálogo é largo, com os cromas e as paletas em alvos grandes (`questPersonalizar.css`,
     `.qp-editor`) e sem o desfoque do fundo, que custa caro no headset. */
  const dlgRef = useRef<HTMLDialogElement>(null);
  /* Esc fecha, e o foco entra no diálogo ao abrir (sem showModal: ver o comentário do return). */
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;
  useEffect(() => {
    dlgRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharRef.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);
  const [comprando, setComprando] = useState<string | null>(null);

  const cromas = temCroma(item) ? cromasDaPeca(item.id, item.raridade) : [];
  const equipado = cromaEquipado(item.id);
  /* A forma do rastro vive aqui porque ela é a OUTRA metade da peça: forma × cor são as duas
     escolhas que se combinam, e guardar só a cor faria trocar de croma perder a forma. */
  const [forma, setForma] = useState(() => {
    const partes = readRastro().split(':');
    return partes.length === 3 && (partes[0] === 'croma' || partes[0] === 'gen')
      ? partes[1]
      : FORMAS_DE_RASTRO.some((f) => f.id === item.alvo)
        ? item.alvo
        : FORMAS_DE_RASTRO[0].id;
  });

  /**
   * "EDITAR O TEMA" (protótipo): as quatro cores e os cantos, partindo do que está na tela agora.
   * Aplicar = Tema Customizado com essas cores (peça da Loja — sem ela, a prévia funciona e o botão
   * diz onde liberar).
   */
  const ehTema = item.tipo === 'tema';
  const [cores, setCores] = useState<CoresLivres>(() => ({
    destaque: corCalculada('--accent', '#E8542B'),
    fundo: corCalculada('--canvas', '#F4F1EA'),
    cartao: corCalculada('--surface', '#FBFAF6'),
    texto: corCalculada('--ink', '#26241F'),
    cantos: readCustomColors().cantos ?? 'suaves',
  }));
  const temaCustom = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-custom');
  const podeCoresLivres = !!temaCustom && estadoDoItem(temaCustom, nivel, saldo).estado === 'equipavel';

  const aplicarCores = () => {
    if (!podeCoresLivres) {
      toast.warn('As cores livres vêm com o Tema Customizado. Ele está na Loja.');
      onIrParaLoja?.();
      return;
    }
    persistTheme({
      customColors: {
        canvas: cores.fundo,
        surface: cores.cartao,
        ink: cores.texto,
        accent: cores.destaque,
        cantos: cores.cantos,
      },
    });
    setTheme('custom');
    toast.ok('Tema aplicado. Restaure em Personalizar → Editar o tema.');
    aoFechar();
  };

  const restaurarPadrao = () => {
    const base = THEME_OPTIONS.find((t) => t.id === item.alvo)?.swatches;
    persistTheme({ customColors: { ...readCustomColors(), cantos: undefined } });
    aoEquipar();
    if (base)
      setCores({
        destaque: base.accent.toUpperCase(),
        fundo: base.canvas.toUpperCase(),
        cartao: base.surface.toUpperCase(),
        texto: base.ink.toUpperCase(),
        cantos: 'suaves',
      });
    toast.ok('Tema de volta ao padrão');
  };

  /**
   * O CROMA PRECISA APARECER. Comprar uma cor e não ver nada mudar seria o pior tipo de controle
   * falso — o que cobra. Cada tipo tem o seu caminho de aplicação, e são todos caminhos que já
   * existiam:
   *
   * · PARTÍCULAS: `ParticleCanvas` lê `corDoCromaEquipado('part-<skin>')` na hora do burst. Nada
   *   a fazer aqui: equipar o croma já basta.
   * · RASTRO: o id `croma:<forma>:<matiz>` que `estiloDeRastro` passou a resolver.
   * · TEMA: as cores do PRÓPRIO tema com o acento no matiz do croma. Não vira uma paleta da
   *   galeria de propósito — paleta troca as quatro cores e tem porta própria por estilo; croma
   *   de tema troca só o acento, que é o que "o mesmo tema em outra cor" quer dizer.
   */
  const aplicarCroma = (matiz: string | null, formaAlvo = forma) => {
    if (item.tipo === 'rastro') {
      setRastro(matiz ? idDeRastroDeCroma(formaAlvo, matiz) : item.alvo);
      return;
    }
    if (item.tipo === 'tema') {
      const base = THEME_OPTIONS.find((t) => t.id === item.alvo);
      const m = matiz ? MATIZES.find((x) => x.id === matiz) : null;
      if (!base) return;
      if (!m) {
        aoEquipar();
        return;
      } // sem croma: volta ao tema de fábrica, pelo caminho único
      applyCustomColors({
        canvas: base.swatches.canvas,
        surface: base.swatches.surface,
        ink: base.swatches.ink,
        accent: `hsl(${m.h} 72% 52%)`,
      });
    }
  };

  /**
   * A COMPRA DE UM CROMA. Mesmo funil de `gastarSeeds` da Loja — idempotente por `spendId`, então
   * o duplo clique não cobra duas vezes. A posse local só é marcada DEPOIS do servidor aceitar.
   */
  const comprarCroma = async (c: Croma) => {
    if (c.via === 'conquista') {
      toast.ok(`${c.nome}: sai de conquista — não está à venda.`);
      return;
    }
    if (c.via === 'premium') {
      toast.ok(`${c.nome}: vem no Passe Premium, não com Seeds.`);
      return;
    }
    if (c.via !== 'seeds' || !c.preco) return;
    if (saldo < c.preco) {
      toast.warn(`Faltam ${c.preco - saldo} Seeds. Elas vêm de estudar: revisar, jogar, aparecer.`);
      return;
    }
    const id = idDoCroma(item.id, c.matiz);
    setComprando(c.matiz);
    try {
      const r = await gastarSeeds({ spendId: id, amount: c.preco, reason: id });
      if (r && (r as { ok?: boolean }).ok === false) {
        toast.warn('Não deu para desbloquear agora.');
        return;
      }
      marcarCroma(id);
      equiparCroma(item.id, c.matiz);
      aplicarCroma(c.matiz);
      toast.ok(`${c.nome} desbloqueado e equipado.`);
      aoComprar?.();
      rerender();
    } catch {
      toast.warn('Não deu para desbloquear agora. Tente de novo.');
    } finally {
      setComprando(null);
    }
  };

  const escolher = (c: Croma) => {
    if (temOCroma(c)) {
      // Trocar de croma é grátis e reversível — clicar no equipado tira, como um interruptor.
      const proximo = equipado === c.matiz ? null : c.matiz;
      equiparCroma(item.id, proximo);
      aplicarCroma(proximo);
      rerender();
      return;
    }
    void comprarCroma(c);
  };

  const selo = (c: Croma) => {
    if (temOCroma(c)) return <Check className="w-3 h-3 text-good" aria-hidden />;
    if (c.via === 'conquista') return <Trophy className="w-3 h-3 text-warn" aria-hidden />;
    if (c.via === 'premium') return <Crown className="w-3 h-3 text-premium" aria-hidden />;
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-bold text-good">
        <Sprout className="w-2.5 h-2.5" aria-hidden />
        {c.preco}
      </span>
    );
  };

  const meus = cromas.filter(temOCroma).length;

  /* O DIÁLOGO DO PROTÓTIPO (`dlg()` + `cabDlg()`): `<dialog class="medio">` com `.dlg-cab` (ícone
     em bloco, título, subtítulo, X), `.dlg-corpo` e `.dlg-pe`, sobre o véu escuro do protótipo.
     NÃO é `showModal()` de propósito: o modal nativo sobe para a camada do topo e cobriria os
     avisos (`toast`) que a compra de croma e as paletas mostram enquanto ele está aberto.
     PORTAL PARA O BODY, como `RecompensaDesbloqueada`: dentro da árvore da Loja o `fixed` cairia
     num bloco de contenção. */
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'color-mix(in srgb,#000 55%,transparent)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <dialog
        ref={dlgRef}
        open
        tabIndex={-1}
        className="largo qp-editor"
        aria-modal="true"
        aria-labelledby="dlg-editor-titulo"
        style={{ position: 'relative', margin: 0, maxHeight: 'calc(100% - 40px)', overflowY: 'auto' }}
      >
        <div className="dlg-cab">
          <IconeEmBloco icone={Palette} />
          <div style={{ minWidth: 0 }}>
            <h2 id="dlg-editor-titulo">{ehTema ? 'Editar o tema' : `Personalizar ${item.nome}`}</h2>
            <p className="mut" style={{ fontSize: 13 }}>
              {ehTema ? 'As mudanças aparecem na prévia. Aplicar vale para o app todo.' : item.desc}
            </p>
          </div>
          <button type="button" className="x" aria-label="Fechar" onClick={aoFechar}>
            <X aria-hidden />
          </button>
        </div>
        <div className="dlg-corpo pilha-g">
          {/* ── EDITAR O TEMA: as quatro cores, os cantos, a prévia e o contraste (protótipo) ── */}
          {ehTema && (
            <div className="pilha">
              <CoresDoTema cores={cores} aoMudar={setCores} />
              {!podeCoresLivres && (
                <p className="mut" style={{ fontSize: 12.5 }}>
                  <Lock aria-hidden style={{ width: 13, height: 13, display: 'inline', verticalAlign: -2 }} /> A prévia
                  é livre; aplicar cores livres pede o Tema Customizado (Loja). Os cromas e as paletas abaixo já valem.
                </p>
              )}
            </div>
          )}

          {/* ── CROMAS ─────────────────────────────────────────────────────── */}
          {cromas.length > 0 && (
            <section>
              <p className="label-mono mb-2">
                Cromas — a peça vem com uma cor; as outras você desbloqueia
                <span className="text-ink-faint">
                  {' '}
                  ({meus} de {cromas.length} seus)
                </span>
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-2">
                {cromas.map((c) => {
                  const tem = temOCroma(c);
                  const ativo = equipado === c.matiz || (!equipado && c.via === 'incluso');
                  return (
                    <button
                      key={c.matiz}
                      onClick={() => escolher(c)}
                      disabled={comprando === c.matiz}
                      title={
                        tem
                          ? c.nome
                          : c.via === 'seeds'
                            ? `${c.nome} · ${c.preco} Seeds`
                            : `${c.nome} · ${c.via === 'premium' ? 'Passe Premium' : 'conquista'}`
                      }
                      aria-pressed={ativo}
                      className={`rounded-xl border-2 p-1.5 cursor-pointer flex flex-col items-center gap-1 transition-colors ${
                        ativo ? 'border-accent bg-accent-soft' : 'border-border-subtle hover:border-accent/60'
                      } ${tem ? '' : 'opacity-90'}`}
                    >
                      {/* A COR TRANCADA APARECE INTEIRA. Dessaturar o bloqueado escondia justamente o
                        que se está vendendo — trinta quadrados cinzas idênticos, impossível dizer
                        turquesa de ciano. O que marca o bloqueio é o preço no selo, não apagar a
                        cor: em loja de croma, ver o que falta É o argumento. */}
                      <span
                        className="w-full h-7 rounded-md"
                        style={{ background: `hsl(${c.h} 78% 62%)` }}
                        aria-hidden
                      />
                      <span className="text-[8.5px] font-bold text-ink-muted leading-none truncate w-full text-center">
                        {c.nome}
                      </span>
                      <span className="h-3 flex items-center">{selo(c)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── TEMA: as 200 paletas, a profundidade que o croma não alcança ── */}
          {item.tipo === 'tema' && (
            <section>
              <p className="label-mono mb-2">Paletas prontas — trocar as quatro cores de uma vez</p>
              <SeletorDePaletas
                nivel={nivel}
                saldo={saldo}
                setTheme={setTheme}
                aoAplicar={() => {
                  aoComprar?.();
                  rerender();
                }}
                onIrParaLoja={onIrParaLoja}
              />
            </section>
          )}

          {/* ── RASTRO: forma × cor ─────────────────────────────────────────── */}
          {item.tipo === 'rastro' && (
            <>
              <section>
                <p className="label-mono mb-2">Forma — a outra metade da peça</p>
                <div className="flex flex-wrap gap-2">
                  {FORMAS_DE_RASTRO.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setForma(f.id);
                        aplicarCroma(equipado, f.id);
                        toast.ok(`Rastro ${f.nome} aplicado.`);
                        rerender();
                      }}
                      aria-pressed={forma === f.id}
                      className="pill"
                    >
                      {f.nome}
                    </button>
                  ))}
                </div>
                <p className="text-[11.5px] text-ink-muted mt-2">
                  Forma e cor se combinam: {FORMAS_DE_RASTRO.length} formas × {cromas.length} cores nesta peça. Sem
                  croma, o rastro sai nas cores do tema.
                </p>
              </section>
            </>
          )}
        </div>
        <div className="dlg-pe">
          {ehTema && (
            <button type="button" className="link" style={{ marginRight: 'auto' }} onClick={restaurarPadrao}>
              Restaurar o padrão
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-solid"
            onClick={() => {
              if (ehTema) return aplicarCores();
              aoEquipar();
              aoFechar();
            }}
          >
            <Check aria-hidden /> {ehTema ? 'Aplicar' : 'Aplicar e equipar'}
          </button>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
