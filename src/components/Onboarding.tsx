import {
  ArrowRight,
  AudioLines,
  BookOpenText,
  Briefcase,
  Cpu,
  Gamepad2,
  KeyRound,
  Languages,
  Loader2,
  type LucideIcon,
  Mic,
  Repeat,
  Rocket,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useState } from 'react';

import { createCredential, patchUiSettings, saveSettings, testProvider } from '../data/api';
import { getActiveProfile, setProviderChoice } from '../gateway/activeProfile';
import { getSttQuality, MODEL_DOWNLOAD_MB, MODEL_DOWNLOAD_MEDIDO, routeStt } from '../gateway/sttRouter';
import { t } from '../lib/i18n';
import { DEFAULT_LANG_CONFIG, idiomasDaInterfaceOferecidos, saveLangConfig } from '../lib/langConfig';
import type { AgeProfileType } from '../lib/profile';
import LangPicker from './LangPicker';
import { DialogoBase, IconeEmBloco } from './ui';

/**
 * Tela de PRIMEIRA EXECUÇÃO (sem contas/login). Desenho: a apresentação em seis passos do
 * protótipo aprovado (`onboarding()` da rodada 10) — um `<dialog class="medio">` com a cena animada
 * no topo (`.onb-palco`), a barra de segmentos, o passo que desliza e o rodapé de sempre.
 *
 * O usuário escolhe, com consentimento explícito, entre:
 *  - LOCAL: rodar on-device (sem chave, offline). O download acontece na primeira captura.
 *  - NUVEM: fornecer a própria chave de API. A chave é cifrada no servidor (vault existente) e
 *    nunca volta ao navegador; guardamos só o `credentialId`.
 * A escolha é persistida em `settings.ui` (+ espelho no localStorage).
 *
 * Diferenças do protótipo, de propósito:
 *  - O idioma da INTERFACE continua sendo perguntado aqui (auditoria de 2026-09-07, A38): quem não
 *    abrisse Ajustes ficava com o palpite para sempre. Os outros idiomas de estudo ficam em Ajustes.
 *  - A privacidade diz as exceções do modo grátis (microfone pelo navegador, tradução web de
 *    reserva): "nada sai daqui" sem elas seria falso.
 *  - O último passo não tem "Pular": sem uma escolha de IA o app não tem como rodar.
 *  - "Usar minha chave" abre o formulário da chave (provedor, URL, modelo, chave) no mesmo diálogo.
 */

// Provedores OpenAI-compatíveis (o proxy do servidor fala /chat/completions).
const PROVIDERS: Record<string, { label: string; baseUrl: string; model: string }> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: '' },
  custom: { label: 'Personalizado (OpenAI-compatível)', baseUrl: '', model: '' },
};

async function persistChoice(mode: 'local' | 'cloud', profileId: string, credentialId?: string) {
  setProviderChoice({ mode, profileId, credentialId: credentialId ?? null });
  await saveSettings({
    activeProfileId: profileId,
    ui: { onboarded: true, providerMode: mode, credentialId: credentialId ?? null },
  });
}

// Idioma de conteúdo assumido para ESTIMAR o tamanho do modelo mostrado no onboarding.
// O download em si acontece na captura, já com o idioma real escolhido pelo usuário.
const DEFAULT_LISTEN = 'en';

type Passo = 'welcome' | 'idioma' | 'perfil' | 'laco' | 'privacidade' | 'ia';
const PASSOS: Passo[] = ['welcome', 'idioma', 'perfil', 'laco', 'privacidade', 'ia'];

type Cena = 'ondas' | 'orbita' | 'perfil' | 'laco' | 'escudo' | 'chip';
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
  ia: { icone: Cpu, sob: 'Como rodar a IA', titulo: 'Como você quer rodar a IA?', desc: '', cena: 'chip' },
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
  const orbita = (nomes: string[], estilo?: React.CSSProperties) => (
    <div className="orbita" style={estilo}>
      {nomes.map((n) => (
        <span key={n}>{n}</span>
      ))}
    </div>
  );
  return (
    <div className="onb-palco" aria-hidden>
      {cena === 'ondas' && ondas()}
      {cena === 'escudo' && ondas(0.25)}
      {cena === 'orbita' && orbita(IDIOMAS.slice(0, 4).map(([, b, n]) => `${b} ${n}`))}
      {cena === 'laco' && orbita(['Capturar', 'Traduzir', 'Analisar', 'Estudar'])}
      {cena === 'chip' && orbita(['no aparelho', 'sua chave'], { width: 150, height: 150 })}
      <IconeEmBloco icone={icone} />
    </div>
  );
}

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [passo, setPasso] = useState<Passo>('welcome');
  /** Sentido da última troca: o passo desliza para a esquerda ao avançar e volta ao recuar. */
  const [volta, setVolta] = useState(false);
  /** O formulário da chave, aberto por "Usar minha chave" no último passo. */
  const [naChave, setNaChave] = useState(false);
  const idTitulo = useId();

  /**
   * OS DOIS IDIOMAS, PERGUNTADOS NA PORTA: o que se estuda e o idioma da tela. Gravam NA HORA —
   * a interface muda sob os pés de quem escolheu, que é a confirmação mais direta.
   */
  const [estudando, setEstudando] = useState(DEFAULT_LANG_CONFIG.studying);
  const [idiomaDaTela, setIdiomaDaTela] = useState(DEFAULT_LANG_CONFIG.daInterface);
  const [ageProfile, setAgeProfile] = useState<AgeProfileType>('pro');
  const [ia, setIa] = useState<'local' | 'nuvem'>('local');
  const [kind, setKind] = useState<keyof typeof PROVIDERS>('openai');
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.openai.baseUrl);
  const [model, setModel] = useState(PROVIDERS.openai.model);
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'ok'>('idle');
  const [message, setMessage] = useState('');
  const [busyLocal, setBusyLocal] = useState(false);

  const i = PASSOS.indexOf(passo);
  const ultimo = i === PASSOS.length - 1;
  // Navegar não persiste nada: percorrer o tour (inclusive ao "Rever apresentação") só troca de
  // passo — a escolha local/nuvem já feita só é sobrescrita ao confirmar de novo.
  const irPara = (p: Passo) => {
    setVolta(PASSOS.indexOf(p) < i);
    setPasso(p);
  };
  const avancar = () => !ultimo && irPara(PASSOS[i + 1]);
  const recuar = () => (naChave ? setNaChave(false) : i > 0 && irPara(PASSOS[i - 1]));
  const pular = () => irPara('ia');

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

  // Setas navegam a apresentação (fora de campos de texto e da lista de idiomas).
  useEffect(() => {
    if (ultimo || naChave) return;
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
  }, [passo, ultimo, naChave]);

  /**
   * O ONBOARDING NÃO BAIXA NADA — correção de A-P0-3. O download acontece num lugar só, a primeira
   * captura, que sempre consulta o roteador; aqui só se ESTIMA o tamanho para dizer antes.
   */
  const tamanho = useMemo(() => {
    const rota = routeStt({
      contentLang: DEFAULT_LISTEN,
      autoDetect: true,
      quality: getSttQuality(),
      hasWebGpu: !!(navigator as Navigator & { gpu?: unknown }).gpu,
      cloudAvailable: false,
      profileId: getActiveProfile().id,
    });
    return { mb: MODEL_DOWNLOAD_MB[rota.localModel] ?? null, medido: !!MODEL_DOWNLOAD_MEDIDO[rota.localModel] };
  }, []);

  const pickKind = (k: keyof typeof PROVIDERS) => {
    setKind(k);
    setBaseUrl(PROVIDERS[k].baseUrl);
    setModel(PROVIDERS[k].model);
  };

  const escolherLocal = async () => {
    setBusyLocal(true);
    await persistChoice('local', 'free-web');
    onComplete();
  };

  const salvarNuvem = async () => {
    setStatus('saving');
    setMessage('');
    if (!baseUrl || !secret) {
      setStatus('error');
      setMessage('Informe a URL base e a chave de API.');
      return;
    }
    const cred = await createCredential({
      label: PROVIDERS[kind].label,
      kind,
      baseUrl,
      defaultModel: model || undefined,
      secret,
    });
    if (!cred) {
      setStatus('error');
      setMessage('Não foi possível salvar a credencial.');
      return;
    }
    const test = await testProvider({ credentialId: cred.id });
    if (!test.ok) {
      setStatus('error');
      setMessage(`A chave não passou no teste: ${test.message ?? 'falha'}. Você pode revisar e tentar de novo.`);
      return;
    }
    await persistChoice('cloud', 'cloud-quality', cred.id);
    setStatus('ok');
    setTimeout(onComplete, 400);
  };

  const comecar = () => (ia === 'local' ? void escolherLocal() : setNaChave(true));
  const s = DO_PASSO[passo];
  const download = tamanho.mb
    ? `download único de ${tamanho.medido ? '' : 'cerca de '}${tamanho.mb} MB na primeira captura`
    : 'download único na primeira captura';

  return (
    <>
      {/* O app ainda não existe atrás da apresentação: o fundo é a tela vazia. */}
      <div className="fixed inset-0 bg-canvas" aria-hidden />
      <DialogoBase
        classe="medio"
        rotuloId={idTitulo}
        aoFechar={() => undefined}
        // Esc pula a apresentação (como antes); na escolha da IA ele não fecha: sem ela o app não roda.
        aoCancelar={() => (naChave ? setNaChave(false) : !ultimo && pular())}
      >
        <div className="dlg-corpo" style={{ padding: '24px 24px 8px' }}>
          <CenaDoPasso passo={passo} />
          <div className="linha" style={{ gap: 6, marginBottom: 14 }} aria-label={`Etapa ${i + 1} de ${PASSOS.length}`}>
            {PASSOS.map((p, k) => (
              <span key={p} className="onb-seg">
                <span style={{ transform: `scaleX(${k <= i ? 1 : 0})` }} />
              </span>
            ))}
            <span className="mut" style={{ fontSize: 12, marginLeft: 6 }}>
              {i + 1} de {PASSOS.length}
            </span>
          </div>

          {naChave ? (
            <div key="chave" className="onb-passo">
              <span className="sobrancelha">Usar minha chave</span>
              <h2 id={idTitulo} style={{ fontSize: 26, fontWeight: 900, margin: '6px 0 8px' }}>
                Conectar provedor de nuvem
              </h2>
              <p className="mut" style={{ fontSize: 14.5, marginBottom: 14 }}>
                A chave é cifrada no servidor e nunca volta ao navegador.
              </p>
              <div className="form-l">
                <label htmlFor="onboarding-provider-kind">Provedor</label>
                <select
                  className="campo"
                  id="onboarding-provider-kind"
                  name="onboarding-provider-kind"
                  value={kind}
                  onChange={(e) => pickKind(e.target.value as keyof typeof PROVIDERS)}
                >
                  {Object.entries(PROVIDERS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-l">
                <label htmlFor="onboarding-base-url">URL base</label>
                <input
                  className="campo"
                  id="onboarding-base-url"
                  name="onboarding-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.exemplo.com/v1"
                />
              </div>
              <div className="form-l">
                <label htmlFor="onboarding-model">Modelo (opcional)</label>
                <input
                  className="campo"
                  id="onboarding-model"
                  name="onboarding-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                />
              </div>
              <div className="form-l">
                <label htmlFor="onboarding-api-key">Chave de API</label>
                <input
                  className="campo"
                  id="onboarding-api-key"
                  name="onboarding-api-key"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="sk-…"
                />
              </div>
              {status === 'error' && (
                <div className="aviso-info warn" role="alert" style={{ marginBottom: 14 }}>
                  <TriangleAlert aria-hidden />
                  <span>{message}</span>
                </div>
              )}
            </div>
          ) : (
            <div key={passo} className={`onb-passo ${volta ? 'volta' : ''}`}>
              <span className="sobrancelha">{s.sob}</span>
              <h2 id={idTitulo} style={{ fontSize: 26, fontWeight: 900, margin: '6px 0 8px' }}>
                {s.titulo}
              </h2>
              {s.desc && (
                <p className="mut" style={{ fontSize: 14.5 }}>
                  {s.desc}
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
                        {bandeira} {nome}
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
                <div className="g-onb" role="radiogroup" aria-label="Como você prefere usar">
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
                      <b>{titulo}</b>
                      <small className="mut">{desc}</small>
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
                        <b>{titulo}</b>
                        <small className="mut">{desc}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {passo === 'privacidade' && (
                <p className="mut" style={{ fontSize: 13, marginTop: 8 }}>
                  As exceções do modo grátis: o microfone usa o reconhecimento do navegador (troque para o Whisper local
                  em Ajustes para ficar 100% offline) e, quando o tradutor local não cobre o par de idiomas, a tradução
                  usa um serviço web. A sua chave de nuvem, se usar uma, é cifrada no servidor.
                </p>
              )}

              {passo === 'ia' && (
                <div className="g-onb dois" role="radiogroup" aria-label="Como rodar a IA">
                  {(
                    [
                      ['local', Cpu, 'Rodar local', 'Grátis · privado · funciona sem internet', download],
                      [
                        'nuvem',
                        KeyRound,
                        'Usar minha chave',
                        'Mais preciso em nomes próprios',
                        'o áudio vai para o provedor que você escolher',
                      ],
                    ] as const
                  ).map(([v, Icone, titulo, desc, nota]) => (
                    <button
                      key={v}
                      type="button"
                      className="cartao opcao-onb"
                      role="radio"
                      aria-checked={ia === v}
                      onClick={() => setIa(v)}
                    >
                      <IconeEmBloco icone={Icone} />
                      <b>{titulo}</b>
                      <small className="mut">{desc}</small>
                      <small className="mut" style={{ fontSize: 11.5 }}>
                        {nota}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dlg-pe">
          {naChave ? (
            <>
              <button
                type="button"
                className="link"
                style={{ marginRight: 'auto' }}
                onClick={() => void escolherLocal()}
                disabled={busyLocal}
              >
                Prefiro rodar local
              </button>
              <button type="button" className="btn btn-outline" onClick={recuar}>
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-solid"
                onClick={() => void salvarNuvem()}
                disabled={status === 'saving'}
              >
                {status === 'saving' && <Loader2 aria-hidden className="animate-spin" />} Testar e salvar
              </button>
            </>
          ) : (
            <>
              {!ultimo && (
                <button type="button" className="link" style={{ marginRight: 'auto' }} onClick={pular}>
                  Pular apresentação
                </button>
              )}
              {i > 0 && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={ultimo ? { marginLeft: 'auto' } : undefined}
                  onClick={recuar}
                >
                  Voltar
                </button>
              )}
              {ultimo ? (
                <button type="button" className="btn btn-solid" onClick={comecar} disabled={busyLocal} data-autofocus>
                  <Rocket aria-hidden /> Começar
                </button>
              ) : (
                <button type="button" className="btn btn-solid" onClick={avancar} data-autofocus>
                  Continuar <ArrowRight aria-hidden />
                </button>
              )}
            </>
          )}
        </div>
      </DialogoBase>
    </>
  );
}
