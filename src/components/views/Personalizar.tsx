import {
  Accessibility,
  Eye,
  Gamepad2,
  MousePointer2,
  Palette,
  PanelLeft,
  Smile,
  Sparkles,
  Type,
  Undo2,
  Waypoints,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

import { applyCustomColors, FONTE_OPTIONS, type FonteType, THEME_OPTIONS, type ThemeType } from '../../lib/appearance';
import { CURSORES, emojiDoCursor, readCursor, setCursor } from '../../lib/cursores';
import { acessoAoEstilo, faltaParaOPerfil } from '../../lib/galeria/acesso';
import { CATEGORIAS_DE_EMOJI } from '../../lib/galeria/emojis';
import { gravarPaletaAtiva, lerPaletaAtiva, type Paleta, paletaPorId } from '../../lib/galeria/paletas';
import {
  apagarPerfil,
  type Perfil,
  perfisSalvos,
  PRESETS,
  renomearPerfil,
  salvarPerfil,
} from '../../lib/galeria/perfis';
import { restaurarVisualPadrao } from '../../lib/galeria/restaurar';
import { palavraDeNivel } from '../../lib/galeria/textos';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import {
  lerPackCustom,
  PACK_CUSTOM,
  PACKS_DE_EMOJI,
  PARTICULAS_OPTIONS,
  readPack,
  readParticulas,
  setPack,
  setPackCustom,
  setParticulas,
} from '../../lib/particulas';
import { estiloDeRastro, readRastro, setRastro } from '../../lib/rastroDoMouse';
import type { AgeProfileType, MenuPositionType } from '../shell/navItems';
import { toast } from '../Toast';
import { IconeEmBloco, TituloDeSecao } from '../ui';
import Inventario from './personalizar/Inventario';

/**
 * MEU VISUAL — o inventário e o perfil de exibição. Só isso.
 *
 * O inventário (`personalizar/Inventario`) é o desenho do protótipo aprovado: o que está equipado
 * no topo e as peças em seções. Os perfis de visual moram lá, como uma seção.
 *
 * O QUE FICOU AQUI: o PERFIL DE EXIBIÇÃO. Não é peça de catálogo nem cosmético — é
 * acessibilidade, sempre grátis. O protótipo não desenha esta seção em Personalizar; ela fica
 * porque é o único dono do ajuste (desde 2026-08-28), no molde de escolha do protótipo
 * (`.cartao.opcao`), sem cadeado e sem acordeão: direito não se esconde atrás de um clique.
 */
interface PersonalizarProps {
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  nivel: number;
  saldo: number;
  onIrParaLoja: () => void;
  /* Os outros dois destinos que uma rota de aquisição do inventário pode ter. Opcionais: a tela
     de Personalizar pode ser montada fora da Loja, e sem callback o cartão explica a rota sem
     oferecer um botão que não levaria a lugar nenhum. */
  onIrParaPasse?: () => void;
  onIrParaConquistas?: () => void;
  ageProfile: AgeProfileType;
  setAgeProfile: (p: AgeProfileType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
}

const POSICAO_DO_MENU: Record<MenuPositionType, string> = {
  left: 'À esquerda',
  top: 'No topo',
  right: 'À direita',
  bottom: 'Embaixo',
};

export default function Personalizar({
  theme,
  setTheme,
  fonte,
  setFonte,
  nivel,
  saldo,
  onIrParaLoja,
  onIrParaPasse,
  onIrParaConquistas,
  ageProfile,
  setAgeProfile,
  menuPosition,
  setMenuPosition,
  onOpenStudio,
}: PersonalizarProps) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const saldoAgora = saldo;

  const packCustom = lerPackCustom();
  const rastroAtual = readRastro();
  const cursorAtual = readCursor();
  const paletaAtiva = lerPaletaAtiva();
  const estiloDaPaleta = (id: string) => paletaPorId(id)?.estilo;
  const ctxAcesso = { nivel, saldo: saldoAgora, estiloDaPaleta, categorias: CATEGORIAS_DE_EMOJI };

  /* A régua na FUNÇÃO, não só no botão (spec galeria-gating-fechado): qualquer caminho que
     aplique uma paleta — inclusive um perfil salvo — esbarra aqui. */
  const aplicarPaleta = (p: Paleta) => {
    const acesso = acessoAoEstilo(p.estilo, nivel, saldoAgora);
    if (!acesso.liberado) {
      toast.warn(`Estilo ainda trancado — ${acesso.motivo}.`);
      return;
    }
    applyCustomColors({ canvas: p.canvas, surface: p.surface, ink: p.ink, accent: p.accent });
    setTheme('custom');
    gravarPaletaAtiva(p.id);
  };

  const aplicarPerfil = (p: Perfil, el?: HTMLElement | null) => {
    const falta = faltaParaOPerfil(p, ctxAcesso);
    if (falta.length) {
      toast.warn(
        `Falta liberar: ${falta.slice(0, 2).join(' · ')}${falta.length > 2 ? ` e mais ${falta.length - 2}` : ''}.`,
      );
      return;
    }
    if (p.paleta) {
      const pal = paletaPorId(p.paleta);
      if (pal) aplicarPaleta(pal);
    } else if (p.tema) setTheme(p.tema);
    setFonte(p.fonte);
    setParticulas(p.particulas);
    if (Array.isArray(p.pack)) setPackCustom(p.pack);
    else setPack(p.pack);
    setCursor(p.cursor);
    setRastro(p.rastro);
    comemorar('subiuNivel', el ?? null, { texto: p.nome });
    explodirAleatorio(2, 'confete');
    toast.ok(`Perfil "${p.nome}" aplicado.`);
    rerender();
  };

  const salvarAtual = (nome: string) => {
    const nomeFinal = nome.trim() || `Meu perfil ${perfisSalvos().length + 1}`;
    const pack = readPack();
    salvarPerfil({
      nome: nomeFinal,
      emoji: emojiDoCursor(readCursor()) ?? '✨',
      desc: 'Montado por você.',
      ...(theme === 'custom' && paletaAtiva ? { paleta: paletaAtiva } : { tema: theme }),
      fonte,
      particulas: readParticulas(),
      pack: pack === PACK_CUSTOM ? lerPackCustom() : pack,
      cursor: readCursor(),
      rastro: readRastro(),
    });
    toast.ok(`Perfil "${nomeFinal}" salvo.`);
    rerender();
  };

  /* O direito de desfazer (ux-v2 §3): devolve o padrão do app num clique, posse intacta. */
  const voltarAoOriginal = () => {
    const { tema, fonte: fontePadrao } = restaurarVisualPadrao();
    setTheme(tema);
    setFonte(fontePadrao);
    toast.ok('Visual original de volta. Tudo o que você desbloqueou continua seu.');
    rerender();
  };

  const renomear = (p: Perfil) => {
    // prompt nativo: um campo, teclado-acessível, sem estado novo — suficiente para um nome.
    const nome = window.prompt(`Novo nome para "${p.nome}":`, p.nome);
    if (nome === null) return;
    if (renomearPerfil(p.id, nome)) {
      toast.ok(`Perfil renomeado para "${nome.trim()}".`);
      rerender();
    } else toast.warn('O nome não pode ficar vazio.');
  };

  const temaNome =
    theme === 'custom' && paletaAtiva
      ? (paletaPorId(paletaAtiva)?.nome ?? 'Paleta')
      : (THEME_OPTIONS.find((t) => t.id === theme)?.name ?? theme);
  const packNome =
    readPack() === PACK_CUSTOM
      ? `Meu pack (${packCustom.length})`
      : (PACKS_DE_EMOJI.find((p) => p.id === readPack())?.nome ?? 'Clássico');
  /* Meus perfis primeiro: o que a pessoa montou vale mais do que o que veio de fábrica. */
  const perfis = [...perfisSalvos(), ...PRESETS];

  return (
    <>
      <Inventario
        nivel={nivel}
        saldo={saldoAgora}
        ctx={{ setTheme, setFonte, setMenuPosition, onOpenStudio, nivel, saldo: saldoAgora }}
        equipadoAtual={(i) =>
          i.tipo === 'tema'
            ? theme === i.alvo
            : i.tipo === 'fonte'
              ? fonte === i.alvo
              : i.tipo === 'particulas'
                ? readParticulas() === i.alvo
                : i.tipo === 'posicao'
                  ? menuPosition === i.alvo
                  : i.tipo === 'pack'
                    ? readPack() === i.alvo
                    : i.tipo === 'cursor'
                      ? cursorAtual === i.alvo
                      : i.tipo === 'rastro'
                        ? rastroAtual === i.alvo
                        : false
        }
        /* A ordem do protótipo (Tema, Partículas, Fonte, Menu, Cursor, Emojis), mais o Rastro,
           que o protótipo não tem e o app tem. */
        loadout={[
          { chave: 'tema', rotulo: 'Tema', valor: temaNome, icone: Palette },
          {
            chave: 'particulas',
            rotulo: 'Partículas',
            valor: PARTICULAS_OPTIONS.find((o) => o.id === readParticulas())?.name ?? '—',
            icone: Sparkles,
          },
          {
            chave: 'fonte',
            rotulo: 'Fonte',
            valor: FONTE_OPTIONS.find((f) => f.id === fonte)?.name ?? fonte,
            icone: Type,
          },
          { chave: 'menu', rotulo: 'Menu', valor: POSICAO_DO_MENU[menuPosition] ?? menuPosition, icone: PanelLeft },
          {
            chave: 'cursor',
            rotulo: 'Cursor',
            valor: CURSORES.find((c) => c.id === cursorAtual)?.nome ?? 'Emoji',
            icone: MousePointer2,
          },
          { chave: 'pack', rotulo: 'Emojis', valor: packNome, icone: Smile },
          {
            chave: 'rastro',
            rotulo: 'Rastro',
            valor: estiloDeRastro(rastroAtual)?.nome ?? 'sem rastro',
            icone: Waypoints,
          },
        ]}
        onIrParaLoja={onIrParaLoja}
        onIrParaPasse={onIrParaPasse}
        onIrParaConquistas={onIrParaConquistas}
        aoMudar={rerender}
        perfis={perfis}
        faltaDoPerfil={(p) => faltaParaOPerfil(p, ctxAcesso)}
        aoAplicarPerfil={aplicarPerfil}
        aoRenomearPerfil={renomear}
        aoApagarPerfil={(p) => {
          apagarPerfil(p.id);
          rerender();
        }}
        aoSalvarPerfil={salvarAtual}
        /* DIREITO, não recompensa: desfazer o visual nunca depende de nível nem de Seeds. */
        acaoDosPerfis={
          <button type="button" className="link" onClick={voltarAoOriginal}>
            <Undo2 aria-hidden /> Voltar ao visual original
          </button>
        }
      />

      {/* ── PERFIL DE EXIBIÇÃO: DIREITO declarado onde mora (ux-v2 §4.4). ── */}
      <section className="secao">
        <TituloDeSecao
          icone={Accessibility}
          titulo="Perfil de exibição"
          desc={
            <>
              Muda a linguagem e a densidade das telas. Não muda o tema nem esconde recurso nenhum.{' '}
              <b style={{ color: 'var(--ink)' }}>
                Isto é acessibilidade: sempre grátis, em qualquer {palavraDeNivel().toLowerCase()}.
              </b>
            </>
          }
        />
        <div className="g3">
          {[
            {
              id: 'kids' as const,
              icon: Gamepad2,
              label: 'Kids / Gamer',
              desc: 'Missões, recompensas e linguagem de jogo.',
            },
            { id: 'pro' as const, icon: Zap, label: 'Produtividade', desc: 'Densidade alta e vocabulário técnico.' },
            {
              id: 'senior' as const,
              icon: Eye,
              label: 'Leitura ampliada',
              desc: 'Passo a passo, alvos de 48px e mais respiro.',
            },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`cartao opcao ${ageProfile === opt.id ? 'sel' : ''}`}
              aria-pressed={ageProfile === opt.id}
              onClick={() => setAgeProfile(opt.id)}
            >
              <span className="radio" aria-hidden="true" />
              <IconeEmBloco icone={opt.icon} />
              <span style={{ flex: 1 }}>
                <h3>{opt.label}</h3>
                <p>{opt.desc}</p>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
