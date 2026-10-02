import { Accessibility, Check, Eye, Gamepad2, Palette, PanelLeft, Sparkles, Type, Undo2, Zap } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { applyCustomColors, FONTE_OPTIONS, type FonteType, THEME_OPTIONS, type ThemeType } from '../../lib/appearance';
import { celebrarEscolha } from '../../lib/comemoracao';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { acessoAoEstilo, faltaParaOPerfil } from '../../lib/galeria/acesso';
import { estaEquipado } from '../../lib/galeria/equipar';
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
import { t } from '../../lib/i18n';
import type { ItemDaLoja } from '../../lib/loja';
import { PARTICULAS_OPTIONS, readParticulas, setParticulas } from '../../lib/particulas';
import { readRastro, setRastro } from '../../lib/rastroDoMouse';
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
  /** Recompensas v2: a prévia ao vivo (Coleção) e o que vai acima do inventário (o painel dela). */
  aoPrever?: (item: ItemDaLoja, el: HTMLElement) => void;
  itemEmPrevia?: string | null;
  tiposComPrevia?: ReadonlySet<string>;
  topo?: ReactNode;
}

const POSICAO_DO_MENU: Record<MenuPositionType, string> = {
  left: 'À esquerda',
  top: 'No topo',
  right: 'À direita',
  bottom: 'Embaixo',
};

/* Os três perfis de exibição: os mesmos na tela de sempre e na do headset. */
const PERFIS_DE_EXIBICAO = [
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
];

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
  aoPrever,
  itemEmPrevia,
  tiposComPrevia,
  topo,
}: PersonalizarProps) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const saldoAgora = saldo;
  /* No Meta Quest (telas novas) o inventário mostra uma seção por vez, e o que mora aqui embaixo (a letra
     e o perfil de exibição) entra nele como mais uma seção, com as peças do desenho do headset. */
  const questNovo = useQuestNovo();

  const paletaAtiva = lerPaletaAtiva();
  const estiloDaPaleta = (id: string) => paletaPorId(id)?.estilo;
  const ctxAcesso = { nivel, saldo: saldoAgora, estiloDaPaleta };

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
    setRastro(p.rastro);
    celebrarEscolha(el ?? null, p.nome);
    toast.ok(`Perfil "${p.nome}" aplicado.`);
    rerender();
  };

  const salvarAtual = (nome: string) => {
    const nomeFinal = nome.trim() || `Meu perfil ${perfisSalvos().length + 1}`;
    salvarPerfil({
      nome: nomeFinal,
      icone: 'brilho',
      desc: 'Montado por você.',
      ...(theme === 'custom' && paletaAtiva ? { paleta: paletaAtiva } : { tema: theme }),
      fonte,
      particulas: readParticulas(),
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

  /** Grava o nome novo. No headset o nome vem de um diálogo com campo (o teclado do sistema sobe nele). */
  const renomearPara = (p: Perfil, nome: string) => {
    if (renomearPerfil(p.id, nome)) {
      toast.ok(`Perfil renomeado para "${nome.trim()}".`);
      rerender();
    } else toast.warn('O nome não pode ficar vazio.');
  };
  const renomear = (p: Perfil) => {
    // prompt nativo: um campo, teclado-acessível, sem estado novo — suficiente para um nome.
    const nome = window.prompt(`Novo nome para "${p.nome}":`, p.nome);
    if (nome === null) return;
    renomearPara(p, nome);
  };

  const temaNome =
    theme === 'custom' && paletaAtiva
      ? (paletaPorId(paletaAtiva)?.nome ?? 'Paleta')
      : (THEME_OPTIONS.find((t) => t.id === theme)?.name ?? theme);
  /* Meus perfis primeiro: o que a pessoa montou vale mais do que o que veio de fábrica. */
  const perfis = [...perfisSalvos(), ...PRESETS];

  /* ACESSIBILIDADE NO HEADSET: a letra e o perfil de exibição em linhas de 72 px. A posição do menu não
     vira controle: no Quest o menu é o trilho, e a tela diz isso em vez de oferecer um botão sem efeito. */
  const acessibilidadeNoQuest = questNovo ? (
    <>
      <section className="q-secao" data-bloco="acessibilidade-e-layout">
        <header>
          <div>
            <h3>{t('Letra')}</h3>
            <p>{t('A letra é sua desde o começo: não custa Seeds nem pede nível.')}</p>
          </div>
        </header>
        <div className="q-grade g3">
          {FONTE_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="q-linha"
              aria-pressed={fonte === f.id}
              onClick={() => setFonte(f.id)}
            >
              <span>
                <b>{f.name}</b>
                <small>{f.desc}</small>
              </span>
              {fonte === f.id && (
                <span className="q-fim">
                  <Check aria-hidden />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
      <div className="q-aviso" role="note" data-testid="menu-no-quest">
        <span>
          {t(
            'No headset o menu é o trilho de ícones, sempre no mesmo lugar. A posição do menu ({posicao}) vale no computador e no celular.',
            { posicao: POSICAO_DO_MENU[menuPosition] ?? menuPosition },
          )}
        </span>
      </div>
      <section className="q-secao">
        <header>
          <div>
            <h3>{t('Perfil de exibição')}</h3>
            <p>
              {t(
                'Muda a linguagem e a densidade das telas. Não muda o tema nem esconde recurso nenhum. Isto é acessibilidade: sempre grátis.',
              )}
            </p>
          </div>
        </header>
        <div className="q-grade g3">
          {PERFIS_DE_EXIBICAO.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="q-linha"
              aria-pressed={ageProfile === opt.id}
              onClick={() => setAgeProfile(opt.id)}
            >
              <span className="q-ic">
                <opt.icon aria-hidden />
              </span>
              <span>
                <b>{opt.label}</b>
                <small>{opt.desc}</small>
              </span>
              {ageProfile === opt.id && (
                <span className="q-fim">
                  <Check aria-hidden />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
    </>
  ) : null;

  const inventario = (
    <Inventario
      nivel={nivel}
      saldo={saldoAgora}
      ctx={{ setTheme, setFonte, setMenuPosition, onOpenStudio, nivel, saldo: saldoAgora }}
      equipadoAtual={(i) => estaEquipado(i, { theme, fonte, menuPosition })}
      /* Os do protótipo, na ordem dele (Tema, Partículas, Fonte, Menu). Cursor e Emojis saíram nas
         recompensas v2. O rastro equipado aparece no próprio cartão, com "Equipado". */
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
        {
          chave: 'menu',
          rotulo: 'Menu',
          // No headset o menu é o trilho de ícones: a posição escolhida não vale ali.
          valor: questNovo ? t('Trilho do headset') : (POSICAO_DO_MENU[menuPosition] ?? menuPosition),
          icone: PanelLeft,
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
      aoPrever={aoPrever}
      itemEmPrevia={itemEmPrevia}
      tiposComPrevia={tiposComPrevia}
      /* DIREITO, não recompensa: desfazer o visual nunca depende de nível nem de Seeds. */
      acaoDosPerfis={
        questNovo ? (
          <button type="button" className="q-chip" onClick={voltarAoOriginal}>
            <Undo2 aria-hidden /> {t('Voltar ao visual original')}
          </button>
        ) : (
          <button type="button" className="link" onClick={voltarAoOriginal}>
            <Undo2 aria-hidden /> Voltar ao visual original
          </button>
        )
      }
      aoRenomearPerfilPara={questNovo ? renomearPara : undefined}
      secoesExtras={
        questNovo
          ? [
              {
                id: 'acessibilidade',
                titulo: t('Acessibilidade'),
                icone: Accessibility,
                conteudo: acessibilidadeNoQuest,
              },
            ]
          : undefined
      }
    />
  );

  if (questNovo)
    return (
      <>
        {topo}
        {inventario}
      </>
    );

  return (
    <>
      {topo}
      {inventario}

      {/* ── ACESSIBILIDADE E LAYOUT (recompensas v2, 27/09): letra e posição do menu saíram do
             catálogo. São legibilidade e layout — livres desde o nível 1, sem preço e sem cadeado. ── */}
      <section className="secao" data-bloco="acessibilidade-e-layout">
        <TituloDeSecao
          icone={Type}
          titulo={t('Acessibilidade e layout')}
          desc={t('A letra e a posição do menu são suas desde o começo: não custam Seeds nem pedem nível.')}
        />
        <p className="label-mono" style={{ margin: '0 0 8px' }}>
          {t('Letra')}
        </p>
        <div className="g3">
          {FONTE_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`cartao opcao ${fonte === f.id ? 'sel' : ''}`}
              aria-pressed={fonte === f.id}
              onClick={() => setFonte(f.id)}
            >
              <span className="radio" aria-hidden="true" />
              <span style={{ flex: 1 }}>
                <h3>{f.name}</h3>
                <p>{f.desc}</p>
              </span>
            </button>
          ))}
        </div>
        <p className="label-mono" style={{ margin: '16px 0 8px' }}>
          {t('Posição do menu')}
        </p>
        <div className="g3">
          {(Object.keys(POSICAO_DO_MENU) as MenuPositionType[]).map((pos) => (
            <button
              key={pos}
              type="button"
              className={`cartao opcao ${menuPosition === pos ? 'sel' : ''}`}
              aria-pressed={menuPosition === pos}
              onClick={() => setMenuPosition(pos)}
            >
              <span className="radio" aria-hidden="true" />
              <IconeEmBloco icone={PanelLeft} />
              <span style={{ flex: 1 }}>
                <h3>{POSICAO_DO_MENU[pos]}</h3>
              </span>
            </button>
          ))}
        </div>
      </section>

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
          {PERFIS_DE_EXIBICAO.map((opt) => (
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
