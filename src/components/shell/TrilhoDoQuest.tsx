/* O CSS das telas do Quest chega junto com o trilho (que só o headset baixa): fora do CSS inicial de
   todo mundo, e sempre presente quando as telas novas estão ligadas, porque o trilho está sempre montado. */
import '../../styles/quest.css';

import { Activity, Ellipsis, LifeBuoy, Moon, Sun, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { t } from '../../lib/i18n';
import type { ViewType } from '../../types';
import { type AgeProfileType, NAV_ITEMS, navLabel } from './navItems';
import { MarcaBabel } from './ShellBits';

/** Os cinco destinos do trilho (decisão do dono na maquete de 01/10/2026). O resto mora em "Mais". */
const NO_TRILHO: ViewType[] = ['hub', 'capture', 'interprete', 'play', 'library'];
/**
 * SEM CONTA (e no site sem servidor), a Biblioteca abre só o cartão "isto precisa de conta": no trilho
 * ela seria um destino de primeira linha que não funciona. Ela continua no menu, em "Mais" (a regra da
 * casa é mostrar e explicar, nunca esconder), e o trilho fica com o que roda inteiro no aparelho.
 */
const NO_TRILHO_SEM_CONTA: ViewType[] = ['hub', 'capture', 'interprete', 'play'];

interface TrilhoDoQuestProps {
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  ageProfile: AgeProfileType;
  /** Quem está sem conta: o que exige conta sai do trilho e fica em "Mais". */
  semConta?: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
}

/**
 * O MENU NO META QUEST — um trilho de ícones no lugar do menu de 220 px com dez itens.
 *
 * Cinco destinos com alvo de 64 px e rótulo curto; o resto (Vocabulário, Estatísticas, Personalizar,
 * Sobre, Ajustes, perfil, ajuda, diagnóstico) e os dois interruptores que o rodapé do menu tinha
 * (claro/escuro e som) ficam num painel no centro da tela, aberto por "Mais". Nada abre por hover e
 * nada desliza pela lateral. Com a janela estreita (ao lado de um jogo), o trilho deita embaixo.
 */
export default function TrilhoDoQuest({
  activeView,
  onChangeView,
  ageProfile,
  semConta = false,
  darkMode,
  toggleDarkMode,
  soundEnabled,
  toggleSound,
}: TrilhoDoQuestProps) {
  const [maisAberto, setMaisAberto] = useState(false);
  const noTrilho = semConta ? NO_TRILHO_SEM_CONTA : NO_TRILHO;
  const principais = noTrilho.map((id) => NAV_ITEMS.find((i) => i.id === id)).filter((i) => !!i);
  const outros = NAV_ITEMS.filter((i) => !noTrilho.includes(i.id));
  const foraDoTrilho = !noTrilho.includes(activeView);

  useEffect(() => setMaisAberto(false), [activeView]);
  useEffect(() => {
    if (!maisAberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setMaisAberto(false);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [maisAberto]);

  const ir = (id: ViewType) => {
    setMaisAberto(false);
    onChangeView(id);
  };

  return (
    <>
      <nav className="q-trilho" data-shell="trilho-do-quest" aria-label={t('Navegação principal')}>
        <MarcaBabel className="q-logo" />
        {principais.map((item) => {
          const Icone = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="q-item"
              onClick={() => ir(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
            >
              <Icone aria-hidden />
              <span>{navLabel(item, ageProfile, true)}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="q-item q-mais-botao"
          aria-haspopup="dialog"
          aria-expanded={maisAberto}
          aria-current={foraDoTrilho ? 'page' : undefined}
          onClick={() => setMaisAberto((v) => !v)}
        >
          <Ellipsis aria-hidden />
          <span>{t('Mais')}</span>
        </button>
      </nav>

      {maisAberto && (
        <div className="q-mais-fundo" onClick={(e) => e.target === e.currentTarget && setMaisAberto(false)}>
          <div className="q-mais" role="dialog" aria-modal="true" aria-label={t('Mais destinos')}>
            <div className="q-cab">
              <h2>{t('Mais')}</h2>
              <button type="button" className="q-ctl" onClick={() => setMaisAberto(false)} aria-label={t('Fechar')}>
                <X aria-hidden />
              </button>
            </div>
            <div className="q-grade g3">
              {outros.map((item) => {
                const Icone = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="q-tile em-linha"
                    onClick={() => ir(item.id)}
                    aria-current={activeView === item.id ? 'page' : undefined}
                  >
                    <span className="q-ic">
                      <Icone aria-hidden />
                    </span>
                    <b>{navLabel(item, ageProfile)}</b>
                  </button>
                );
              })}
              <button type="button" className="q-tile em-linha" onClick={() => ir('profile')}>
                <span className="q-ic">
                  <UserRound aria-hidden />
                </span>
                <b>{t('Seu perfil')}</b>
              </button>
              <button type="button" className="q-tile em-linha" onClick={() => ir('ajuda')}>
                <span className="q-ic">
                  <LifeBuoy aria-hidden />
                </span>
                <b>{t('Ajuda e suporte')}</b>
              </button>
              <button type="button" className="q-tile em-linha" onClick={() => ir('diagnostico')}>
                <span className="q-ic">
                  <Activity aria-hidden />
                </span>
                <b>{t('Diagnóstico do aparelho')}</b>
              </button>
            </div>
            <div className="q-faixa" style={{ margin: 0 }}>
              <button type="button" className="q-ctl" onClick={toggleDarkMode}>
                {darkMode ? <Moon aria-hidden /> : <Sun aria-hidden />}
                {darkMode ? t('Tema escuro') : t('Tema claro')}
              </button>
              <button type="button" className="q-ctl" onClick={toggleSound}>
                {soundEnabled ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
                {soundEnabled ? t('Som dos toques: ligado') : t('Som dos toques: desligado')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
