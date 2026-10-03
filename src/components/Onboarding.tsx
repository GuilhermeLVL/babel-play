/* A apresentação aparece ANTES da casca (com conta) e o CSS do headset chega com o trilho, que ainda
   não existe: ela traz as duas folhas consigo. Só agem com `<html data-quest-novo="true">`. */
import '../styles/quest.css';
import '../styles/questBase.css';

import {
  ArrowRight,
  AudioLines,
  BookOpenText,
  Briefcase,
  Gamepad2,
  Languages,
  type LucideIcon,
  Mic,
  Repeat,
  Rocket,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';

import { patchUiSettings, saveSettings } from '../data/api';
import { setProviderChoice } from '../gateway/activeProfile';
import { t } from '../lib/i18n';
import { DEFAULT_LANG_CONFIG, idiomasDaInterfaceOferecidos, saveLangConfig } from '../lib/langConfig';
import type { AgeProfileType } from '../lib/profile';
import LangPicker from './LangPicker';
import { DialogoBase, IconeEmBloco } from './ui';

/**
 * Tela de PRIMEIRA EXECUÇÃO. Desenho: a apresentação do protótipo aprovado (`onboarding()` da
 * rodada 10) — um `<dialog class="medio">` com a cena animada no topo (`.onb-palco`), a barra de
 * segmentos, o passo que desliza e o rodapé de sempre.
 *
 * SEM O PASSO "COMO RODAR A IA" (pedido do dono, 02/10/2026): escolher entre rodar no aparelho e usar
 * a própria chave não mudava nada para quem chegava — o app já decide o motor pelo aparelho e pelo
 * plano. Quem tem chave a cadastra em Ajustes → Motor de IA. "Começar" grava o modo local, o padrão
 * do passo removido. Tudo o que a tela diz passa pelo `t()` NA HORA de desenhar: o idioma da
 * interface escolhido no passo 2 muda a apresentação inteira, não só a frase de baixo.
 *
 * Diferenças do protótipo, de propósito:
 *  - O idioma da INTERFACE continua sendo perguntado aqui (auditoria de 2026-09-07, A38): quem não
 *    abrisse Ajustes ficava com o palpite para sempre. Os outros idiomas de estudo ficam em Ajustes.
 *  - A privacidade diz as exceções do modo grátis (microfone pelo navegador, tradução web de
 *    reserva): "nada sai daqui" sem elas seria falso.
 *  - "Pular apresentação" (e o Esc) leva ao último passo, que entra com "Começar".
 */

/** Entra no app no modo local — o padrão de sempre; a chave própria fica em Ajustes. */
async function concluir() {
  setProviderChoice({ mode: 'local', profileId: 'free-web', credentialId: null });
  await saveSettings({
    activeProfileId: 'free-web',
    ui: { onboarded: true, providerMode: 'local', credentialId: null },
  });
}

type Passo = 'welcome' | 'idioma' | 'perfil' | 'laco' | 'privacidade';
const PASSOS: Passo[] = ['welcome', 'idioma', 'perfil', 'laco', 'privacidade'];

type Cena = 'ondas' | 'orbita' | 'perfil' | 'laco' | 'escudo';
const DO_PASSO: Record<Passo, { icone: LucideIcon; sob: string; titulo: string; desc: string; cena: Cena }> = {
  welcome: {
    icone: AudioLines,
    sob: 'Bem-vindo',
    titulo: 'Babel Play',
    desc: 'Aprenda idiomas com o que você já assiste. O app ouve o som do computador, transcreve, traduz e transforma tudo em jogo e revisão.',
    cena: 'ondas',
  },
  idioma: {
    icone: Languages,
    sob: 'Seu idioma',
    titulo: 'Que idioma você quer aprender?',
    desc: 'Dá para trocar e somar outros depois, em Ajustes.',
    cena: 'orbita',
  },
  perfil: {
    icone: UserRound,
    sob: 'Seu jeito',
    titulo: 'Como você prefere usar?',
    desc: 'Muda o tom dos textos e o tamanho das coisas. Não trava nada.',
    cena: 'perfil',
  },
  laco: { icone: Repeat, sob: 'Como funciona', titulo: 'Um laço em quatro passos', desc: '', cena: 'laco' },
  privacidade: {
    icone: ShieldCheck,
    sob: 'Privacidade',
    titulo: 'Por padrão, tudo no seu dispositivo',
    desc: 'O áudio do sistema é transcrito e traduzido no seu computador, e o vocabulário fica aqui.',
    cena: 'escudo',
  },
};

/** Os seis idiomas de estudo mais pedidos, como no protótipo; os outros ficam em Ajustes. */
const IDIOMAS: Array<[code: string, bandeira: string, nome: string]> = [
  ['en-US', '🇺🇸', 'Inglês'],
  ['es-ES', '🇪🇸', 'Espanhol'],
  ['fr-FR', '🇫🇷', 'Francês'],
  ['de-DE', '🇩🇪', 'Alemão'],
  ['it-IT', '🇮🇹', 'Italiano'],
  ['ja-JP', '🇯🇵', 'Japonês'],
];
const base = (code: string) => code.toLowerCase().split('-')[0];

/**
 * PERFIL DE EXIBIÇÃO — perguntado aqui, e não escondido num popover.
 *
 * Sem este passo o padrão era `pro` para todo mundo: uma criança de 9 anos instalava a app e caía
 * no modo executivo. Os rótulos descrevem a SITUAÇÃO, não a idade.
 */
const PERFIS: Array<[AgeProfileType, LucideIcon, string, string]> = [
  ['kids', Gamepad2, 'Jogo e vídeos', 'Mais cor, textos curtos'],
  ['pro', Briefcase, 'Trabalho e estudo', 'Direto ao ponto, atalhos'],
  ['senior', BookOpenText, 'Leitura tranquila', 'Letra maior, menos pressa'],
];

const LACO: Array<[LucideIcon, string, string]> = [
  [Mic, 'Capturar ou importar', 'o som do computador, um vídeo, um PDF'],
  [Languages, 'Transcrever e traduzir', 'no seu aparelho, frase a frase'],
  [Search, 'Analisar', 'palavras novas, pronúncia, nível'],
  [Gamepad2, 'Estudar', 'jogos e revisão espaçada'],
];

/** A cena animada do topo — `cenaOnb()` do protótipo. Só decoração. */
function CenaDoPasso({ passo }: { passo: Passo }) {
  const { cena, icone } = DO_PASSO[passo];
  const ondas = (opacidade?: number) => (
    <div className="ondas-onb" style={opacidade ? { opacity: opacidade } : undefined}>
      {Array.from({ length: 22 }, (_, i) => (
        <i key={i} style={{ '--i': i } as React.CSSProperties} />
      ))}
    </div>
  );
  const orbita = (nomes: string[]) => (
    <div className="orbita">
      {nomes.map((n) => (
        <span key={n}>{n}</span>
      ))}
    </div>
  );
  return (
    <div className="onb-palco" aria-hidden>
      {cena === 'ondas' && ondas()}
      {cena === 'escudo' && ondas(0.25)}
      {cena === 'orbita' && orbita(IDIOMAS.slice(0, 4).map(([, b, n]) => `${b} ${t(n)}`))}
      {cena === 'laco' && orbita([t('Capturar'), t('Traduzir'), t('Analisar'), t('Estudar')])}
      <IconeEmBloco icone={icone} />
    </div>
  );
}

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [passo, setPasso] = useState<Passo>('welcome');
  /** Sentido da última troca: o passo desliza para a esquerda ao avançar e volta ao recuar. */
  const [volta, setVolta] = useState(false);
  const idTitulo = useId();

  /**
   * OS DOIS IDIOMAS, PERGUNTADOS NA PORTA: o que se estuda e o idioma da tela. Gravam NA HORA —
   * a interface muda sob os pés de quem escolheu, que é a confirmação mais direta.
   */
  const [estudando, setEstudando] = useState(DEFAULT_LANG_CONFIG.studying);
  const [idiomaDaTela, setIdiomaDaTela] = useState(DEFAULT_LANG_CONFIG.daInterface);
  const [ageProfile, setAgeProfile] = useState<AgeProfileType>('pro');
  const [entrando, setEntrando] = useState(false);

  const i = PASSOS.indexOf(passo);
  const ultimo = i === PASSOS.length - 1;
  const irPara = (p: Passo) => {
    setVolta(PASSOS.indexOf(p) < i);
    setPasso(p);
  };
  const avancar = () => !ultimo && irPara(PASSOS[i + 1]);
  const recuar = () => i > 0 && irPara(PASSOS[i - 1]);
  const pular = () => irPara(PASSOS[PASSOS.length - 1]);

  const escolherEstudando = (code: string) => {
    setEstudando(code);
    void saveLangConfig({ studying: code });
  };
  const escolherIdiomaDaTela = (code: string) => {
    setIdiomaDaTela(code);
    void saveLangConfig({ daInterface: code });
  };
  /** O perfil aplica NA HORA e persiste no espelho local e no `settings.ui` do servidor. */
  const escolherPerfil = (id: AgeProfileType) => {
    setAgeProfile(id);
    localStorage.setItem('babel.age_profile', id);
    void patchUiSettings({ ageProfile: id });
  };

  const comecar = async () => {
    setEntrando(true);
    await concluir();
    onComplete();
  };

  // Setas navegam a apresentação (fora de campos de texto e da lista de idiomas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) return;
      if (e.key === 'ArrowRight') avancar();
      else if (e.key === 'ArrowLeft') recuar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    /* `avancar`/`recuar` ficam fora das deps DE PROPÓSITO: são recriadas a cada render, e o passo,
       que já está aqui, é o único estado que as duas leem. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo]);

  const s = DO_PASSO[passo];

  return (
    <>
      {/* O app ainda não existe atrás da apresentação: o fundo é a tela vazia. */}
      <div className="fixed inset-0 bg-canvas" aria-hidden />
      <DialogoBase
        classe="medio"
        rotuloId={idTitulo}
        aoFechar={() => undefined}
        // Esc pula a apresentação (como antes): leva ao último passo, que entra com "Começar".
        aoCancelar={pular}
      >
        <div className="dlg-corpo" style={{ padding: '24px 24px 8px' }}>
          <CenaDoPasso passo={passo} />
          <div
            className="linha"
            style={{ gap: 6, marginBottom: 14 }}
            aria-label={t('Etapa {n} de {total}', { n: i + 1, total: PASSOS.length })}
          >
            {PASSOS.map((p, k) => (
              <span key={p} className="onb-seg">
                <span style={{ transform: `scaleX(${k <= i ? 1 : 0})` }} />
              </span>
            ))}
            <span className="mut" style={{ fontSize: 12, marginLeft: 6 }}>
              {t('{n} de {total}', { n: i + 1, total: PASSOS.length })}
            </span>
          </div>

          <div key={passo} className={`onb-passo ${volta ? 'volta' : ''}`}>
            <span className="sobrancelha">{t(s.sob)}</span>
            <h2 id={idTitulo} style={{ fontSize: 26, fontWeight: 900, margin: '6px 0 8px' }}>
              {t(s.titulo)}
            </h2>
            {s.desc && (
              <p className="mut" style={{ fontSize: 14.5 }}>
                {t(s.desc)}
              </p>
            )}

            {passo === 'idioma' && (
              <>
                <div className="chips" role="radiogroup" aria-label={t('Estou aprendendo')} style={{ marginTop: 14 }}>
                  {IDIOMAS.map(([code, bandeira, nome]) => (
                    <button
                      key={code}
                      type="button"
                      className="pill"
                      role="radio"
                      aria-checked={base(estudando) === base(code)}
                      onClick={() => escolherEstudando(code)}
                    >
                      {bandeira} {t(nome)}
                    </button>
                  ))}
                </div>
                <div className="form-l" style={{ marginTop: 16, marginBottom: 6 }}>
                  <label htmlFor="onboarding-ui-lang">{t('Idioma da interface')}</label>
                  <LangPicker
                    id="onboarding-ui-lang"
                    ariaLabel={t('Idioma da interface')}
                    block
                    somente={idiomasDaInterfaceOferecidos()}
                    value={idiomaDaTela}
                    onPick={({ code }) => {
                      if (code) escolherIdiomaDaTela(code);
                    }}
                  />
                  <small className="mut" style={{ fontSize: 12 }}>
                    {t(
                      'Dá para trocar quando quiser, em Ajustes. O idioma que você aprende decide as palavras que vão para o seu baralho; o da interface decide só os textos da tela.',
                    )}
                  </small>
                </div>
              </>
            )}

            {passo === 'perfil' && (
              <div className="g-onb" role="radiogroup" aria-label={t('Como você prefere usar?')}>
                {PERFIS.map(([id, Icone, titulo, desc]) => (
                  <button
                    key={id}
                    type="button"
                    className="cartao opcao-onb"
                    role="radio"
                    aria-checked={ageProfile === id}
                    onClick={() => escolherPerfil(id)}
                  >
                    <IconeEmBloco icone={Icone} />
                    <b>{t(titulo)}</b>
                    <small className="mut">{t(desc)}</small>
                  </button>
                ))}
              </div>
            )}

            {passo === 'laco' && (
              <ol className="laco-onb">
                {LACO.map(([Icone, titulo, desc], k) => (
                  <li key={titulo} style={{ '--i': k } as React.CSSProperties}>
                    <IconeEmBloco icone={Icone} />
                    <div>
                      <b>{t(titulo)}</b>
                      <small className="mut">{t(desc)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {passo === 'privacidade' && (
              <p className="mut" style={{ fontSize: 13, marginTop: 8 }}>
                {t(
                  'As exceções do modo grátis: o microfone usa o reconhecimento do navegador, que envia o áudio ao Google/Microsoft (troque para a transcrição local em Ajustes para ficar 100% offline) e, quando o tradutor local não cobre o par de idiomas, a tradução usa um serviço web. A sua chave de nuvem, se usar uma, é cifrada no servidor.',
                )}
              </p>
            )}
          </div>
        </div>

        <div className="dlg-pe">
          {!ultimo && (
            <button type="button" className="link" style={{ marginRight: 'auto' }} onClick={pular}>
              {t('Pular apresentação')}
            </button>
          )}
          {i > 0 && (
            <button
              type="button"
              className="btn btn-outline"
              style={ultimo ? { marginLeft: 'auto' } : undefined}
              onClick={recuar}
            >
              {t('Voltar')}
            </button>
          )}
          {ultimo ? (
            <button
              type="button"
              className="btn btn-solid"
              onClick={() => void comecar()}
              disabled={entrando}
              data-autofocus
            >
              <Rocket aria-hidden /> {t('Começar')}
            </button>
          ) : (
            <button type="button" className="btn btn-solid" onClick={avancar} data-autofocus>
              {t('Continuar')} <ArrowRight aria-hidden />
            </button>
          )}
        </div>
      </DialogoBase>
    </>
  );
}
