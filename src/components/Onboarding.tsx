import React, { useEffect, useState } from 'react';
import {
  HardDrive, Cloud, Check, Loader2, AlertTriangle, ArrowLeft, KeyRound,
  AudioLines, Languages, ScanText, GraduationCap, ShieldCheck, Repeat,
  ChevronLeft, ChevronRight, Mic, Gamepad2, Zap, Eye, UserRound,
} from 'lucide-react';
import { createCredential, testProvider, saveSettings, patchUiSettings } from '../data/api';
import type { AgeProfileType } from '../lib/profile';
import { setProviderChoice, getActiveProfile } from '../gateway/activeProfile';
import { routeStt, getSttQuality, MODEL_DOWNLOAD_MB, MODEL_DOWNLOAD_MEDIDO } from '../gateway/sttRouter';

/**
 * Tela de PRIMEIRA EXECUÇÃO (sem contas/login). O usuário escolhe, com consentimento
 * explícito, entre:
 *  - LOCAL: baixar o modelo e rodar on-device (sem chave, offline). O download em si
 *    (com progresso) acontece na captura/preparação (fase de entrega do modelo).
 *  - NUVEM: fornecer a própria chave de API. A chave é cifrada no servidor (vault
 *    existente) e nunca volta ao navegador; guardamos só o `credentialId`.
 * A escolha é persistida em `settings.ui` (+ espelho no localStorage).
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

type Step = 'welcome' | 'profile' | 'how' | 'privacy' | 'choose' | 'cloud' | 'download';

// Ordem dos passos que compõem a barra de progresso (a apresentação + a decisão).
// `cloud`/`download` são sub-fluxos e não aparecem na barra.
const PROGRESS_STEPS: Step[] = ['welcome', 'profile', 'how', 'privacy', 'choose'];

/**
 * PERFIL DE EXIBIÇÃO — perguntado aqui, e não escondido num popover.
 *
 * Sem este passo o padrão era `pro` para todo mundo: uma criança de 9 anos instalava a app e caía
 * no modo executivo, com CEFR, FSRS e doze exercícios de uma vez. Todo o sistema de perfis existia
 * e era invisível para quem chegava.
 *
 * Os rótulos descrevem a SITUAÇÃO, não a idade. "Sou idoso" é um rótulo que ninguém escolhe de
 * bom grado; "leitura tranquila, letras maiores" é uma preferência que qualquer um assume.
 */
const PROFILE_CHOICES: Array<{
  id: AgeProfileType;
  icon: React.ReactNode;
  title: string;
  desc: string;
}> = [
  {
    id: 'kids',
    icon: <Gamepad2 className="w-5 h-5" />,
    title: 'Jogo e vídeos',
    desc: 'Roblox, YouTube, Discord. Desafios, recompensas e linguagem de jogo.'
  },
  {
    id: 'pro',
    icon: <Zap className="w-5 h-5" />,
    title: 'Trabalho e estudo',
    desc: 'Tudo à mão, densidade alta e os termos técnicos sem rodeio.'
  },
  {
    id: 'senior',
    icon: <Eye className="w-5 h-5" />,
    title: 'Leitura tranquila',
    desc: 'Passo a passo, letras e botões maiores, sem sigla nenhuma.'
  }
];

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [ageProfile, setAgeProfile] = useState<AgeProfileType>('pro');
  const [kind, setKind] = useState<keyof typeof PROVIDERS>('openai');
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.openai.baseUrl);
  const [model, setModel] = useState(PROVIDERS.openai.model);
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'ok'>('idle');
  const [message, setMessage] = useState('');
  const [busyLocal, setBusyLocal] = useState(false);

  const pickKind = (k: keyof typeof PROVIDERS) => {
    setKind(k);
    setBaseUrl(PROVIDERS[k].baseUrl);
    setModel(PROVIDERS[k].model);
  };

  // Navegação da apresentação. Nenhuma destas funções persiste nada: percorrer o
  // tour (inclusive ao "Rever apresentação") só troca de tela — a escolha
  // local/nuvem já feita só é sobrescrita se o usuário clicar de novo em chooseLocal/saveCloud.
  const inTour = step === 'welcome' || step === 'profile' || step === 'how' || step === 'privacy';
  const goNext = () => {
    if (step === 'welcome') setStep('profile');
    else if (step === 'profile') setStep('how');
    else if (step === 'how') setStep('privacy');
    else if (step === 'privacy') setStep('choose');
  };
  const goBack = () => {
    if (step === 'profile') setStep('welcome');
    else if (step === 'how') setStep('profile');
    else if (step === 'privacy') setStep('how');
    else if (step === 'choose') setStep('privacy');
  };
  const skipTour = () => setStep('choose');

  /**
   * Escolher o perfil aplica NA HORA (o `<html>`/`<main>` já reagem à classe `age-*`), para o
   * usuário ver o efeito antes de confirmar, e persiste nos dois lugares: o espelho local que o
   * App lê no arranque e o blob `settings.ui` no servidor — sem o servidor, a preferência se
   * perderia ao trocar de máquina, que é justamente o caso de quem configura o app para outra pessoa.
   */
  const chooseProfile = (id: AgeProfileType) => {
    setAgeProfile(id);
    localStorage.setItem('babel.age_profile', id);
    void patchUiSettings({ ageProfile: id });
  };

  // Atalhos de teclado durante a apresentação: setas para navegar, Esc para pular.
  useEffect(() => {
    if (!inTour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goBack();
      else if (e.key === 'Escape') skipTour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    /* `goNext`/`goBack` ficam fora das deps DE PROPÓSITO. Elas são recriadas a cada render, então
       incluí-las faria este efeito remover e registrar o listener de `keydown` em cada render — e
       `step`/`inTour`, que já estão aqui, são o único estado que as duas leem. O listener sempre
       enxerga a versão da render atual porque o efeito é reexecutado quando esse estado muda. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, inTour]);

  /**
   * O ONBOARDING NÃO BAIXA MAIS NADA — e isso é a correção de A-P0-3, não uma omissão.
   *
   * Antes, `runDownload` chamava `preloadModel()` sem definir rota, então caía no default
   * `whisper-tiny` (33 MB). Mas a primeira captura chama `routeStt()` e, na configuração padrão
   * (detecção automática + nuvem disponível), pede `whisper-base` (85 MB). O usuário baixava um
   * modelo no onboarding e via a barra de novo na primeira captura, baixando OUTRO. Os 33 MB eram
   * desperdício integral.
   *
   * Com o download acontecendo num único lugar — a captura, que sempre consulta o roteador — o
   * modelo errado deixa de ser baixável por construção.
   *
   * MEDIÇÃO que decidiu adiar em vez de rotear aqui: 0,44 MB/s medidos contra o CDN do HF
   * (mediana de 3 amostras de 8 MiB). O menor modelo já leva 75 s, e a configuração padrão
   * (base + opus-mt) levaria ~7,5 min — muito acima do limiar de 60 s. Prender o onboarding nisso
   * é pior que preparar na primeira captura, com o tamanho declarado antes de começar.
   */
  const tamanhoEstimado = React.useMemo(() => {
    const rota = routeStt({
      contentLang: DEFAULT_LISTEN,
      autoDetect: true,
      quality: getSttQuality(),
      hasWebGpu: !!(navigator as any).gpu,
      cloudAvailable: false,
      profileId: getActiveProfile().id,
    });
    return { mb: MODEL_DOWNLOAD_MB[rota.localModel] ?? null, medido: !!MODEL_DOWNLOAD_MEDIDO[rota.localModel] };
  }, []);
  const tamanhoMedido = tamanhoEstimado.medido;
  const tamanhoEstimadoMb = tamanhoEstimado.mb;

  const chooseLocal = async () => {
    setBusyLocal(true);
    await persistChoice('local', 'free-web');
    setStep('download');
  };

  const saveCloud = async () => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas text-ink p-6 overflow-y-auto">
      <div className="w-full max-w-2xl">
        {/* Barra de progresso: pontos para as telas de apresentação + a decisão final. */}
        {PROGRESS_STEPS.includes(step) && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {PROGRESS_STEPS.map((s, i) => {
              const active = s === step;
              const done = PROGRESS_STEPS.indexOf(step) > i;
              return (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${active ? 'w-8 bg-accent' : done ? 'w-4 bg-accent/40' : 'w-4 bg-border-subtle'}`}
                />
              );
            })}
            <span className="ml-2 text-[11px] font-mono text-ink-faint tabular-nums">
              {PROGRESS_STEPS.indexOf(step) + 1} de {PROGRESS_STEPS.length}
            </span>
          </div>
        )}

        {step === 'welcome' && (
          <TourSlide
            icon={<AudioLines className="w-6 h-6" />}
            kicker="Bem-vindo"
            title="Babel Play"
            onBack={null}
            onNext={goNext}
            onSkip={skipTour}
          >
            <p className="text-ink text-[15px] leading-relaxed">
              Aprenda idiomas com o conteúdo que você já assiste. O Babel Play captura
              o <strong className="text-ink">som do seu computador</strong> (vídeos, chamadas, jogos — sem configurar nada,
              quando rodando localmente) ou de <strong className="text-ink">uma aba do navegador</strong>, transcreve a fala,
              traduz e transforma tudo em material de estudo.
            </p>
            <p className="text-[13px] text-ink-muted leading-relaxed mt-3">
              Também dá para <strong className="text-ink">importar</strong>: link do YouTube, artigo da web, PDF/DOCX ou um áudio seu —
              tudo vira uma sessão com vocabulário, exercícios e leitura narrada. E as legendas ao vivo podem flutuar
              numa <strong className="text-ink">janelinha sempre-no-topo</strong> por cima do jogo ou da chamada.
            </p>
          </TourSlide>
        )}

        {step === 'profile' && (
          <TourSlide
            icon={<UserRound className="w-6 h-6" />}
            kicker="Para quem é"
            title="Como você prefere usar?"
            onBack={goBack}
            onNext={goNext}
            onSkip={skipTour}
          >
            <p className="text-[13.5px] text-ink-muted leading-relaxed mb-4">
              Isso ajusta a linguagem e quanta coisa aparece de uma vez. <strong className="text-ink">Nenhum
              recurso é removido</strong> — o que sai da primeira tela fica sempre a um clique. Dá para trocar
              quando quiser, em Configurações.
            </p>
            <div className="space-y-2.5">
              {PROFILE_CHOICES.map((opt) => {
                const active = ageProfile === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => chooseProfile(opt.id)}
                    aria-pressed={active}
                    className={`w-full flex items-start gap-3.5 p-4 rounded-xl border-2 text-left cursor-pointer transition-colors ${
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-border-subtle bg-canvas hover:border-accent'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-xl ${
                        active ? 'bg-accent text-accent-contrast' : 'bg-surface-hover text-ink-muted'
                      }`}
                      aria-hidden
                    >
                      {opt.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-bold text-[14.5px] ${active ? 'text-accent-ink' : 'text-ink'}`}>
                        {opt.title}
                      </span>
                      <span className="block text-[12.5px] text-ink-muted leading-snug mt-0.5">{opt.desc}</span>
                    </span>
                    {active && <Check className="w-5 h-5 text-accent-ink shrink-0 mt-0.5" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </TourSlide>
        )}

        {step === 'how' && (
          <TourSlide
            icon={<Repeat className="w-6 h-6" />}
            kicker="Como funciona"
            title="Um laço em quatro passos"
            onBack={goBack}
            onNext={goNext}
            onSkip={skipTour}
          >
            <div className="grid sm:grid-cols-2 gap-3 mt-1">
              <LoopStep n={1} icon={<Mic className="w-4 h-4" />} title="Capturar ou importar"
                desc="Som do computador, aba do navegador, microfone — ou importe YouTube, artigo, documento e áudio." />
              <LoopStep n={2} icon={<Languages className="w-4 h-4" />} title="Transcrever & traduzir"
                desc="A fala vira texto com tradução ao lado, em tempo real; legendas podem flutuar sobre qualquer app." />
              <LoopStep n={3} icon={<ScanText className="w-4 h-4" />} title="Analisar"
                desc="Vocabulário clicável, ritmo de fala, métricas reais e um tutor (iChat) que enxerga a sua tela." />
              <LoopStep n={4} icon={<GraduationCap className="w-4 h-4" />} title="Estudar"
                desc="Deck com repetição espaçada (FSRS), 8 exercícios e modo leitura narrado." />
            </div>
          </TourSlide>
        )}

        {step === 'privacy' && (
          <TourSlide
            icon={<ShieldCheck className="w-6 h-6" />}
            kicker="Privacidade"
            title="Por padrão, tudo no seu dispositivo"
            onBack={goBack}
            onNext={goNext}
            onSkip={skipTour}
            nextLabel="Escolher como rodar"
          >
            <p className="text-ink text-[15px] leading-relaxed">
              O áudio do <strong className="text-ink">sistema</strong> é transcrito (Whisper) e traduzido (opus-mt)
              <strong className="text-ink"> localmente, no seu dispositivo</strong> — esse áudio não sai da sua máquina.
            </p>
            <p className="text-[13px] text-ink-muted leading-relaxed mt-3">
              Sendo honestos com as exceções do modo grátis: o <strong className="text-ink">microfone</strong> usa por padrão o
              reconhecimento do navegador (que envia a fala ao provedor do navegador — troque para “Whisper local” nos ajustes
              se preferir 100% offline), e quando a tradução local não cobre o par de idiomas usamos um serviço web como reserva.
            </p>
            <p className="text-[13px] text-ink-muted leading-relaxed mt-3">
              Se você preferir usar a nuvem para ganhar qualidade, fornece sua própria chave de API:
              ela é <strong className="text-ink">cifrada no servidor</strong> e nunca volta ao navegador — guardamos só uma referência.
            </p>
          </TourSlide>
        )}

        {step === 'choose' && (
          <>
            <div className="text-center mb-6">
              <button onClick={() => setStep('privacy')} className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink cursor-pointer mb-3">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </button>
              <h1 className="font-display font-black text-2xl tracking-tight">Como você quer rodar a IA?</h1>
              <p className="text-ink-muted mt-2 text-sm">Você pode mudar depois em Configurações.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={chooseLocal}
                disabled={busyLocal}
                className="text-left p-6 rounded-2xl border-2 border-border-subtle bg-surface hover:border-accent transition-all disabled:opacity-60 cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-2 text-accent"><HardDrive className="w-5 h-5" /><span className="font-bold">Rodar local</span></div>
                <p className="text-[13px] text-ink-muted leading-relaxed">
                  Baixa o modelo e roda 100% no seu dispositivo. Sem chave, sem custo, funciona offline.
                  O download (~alguns MB) acontece com barra de progresso ao preparar a captura.
                </p>
                <span className="inline-block mt-3 text-[11px] font-mono uppercase bg-good-soft text-good-ink border border-good/20 px-2 py-0.5 rounded">Grátis · Privado</span>
              </button>

              <button
                onClick={() => setStep('cloud')}
                className="text-left p-6 rounded-2xl border-2 border-border-subtle bg-surface hover:border-accent transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-2 text-accent"><Cloud className="w-5 h-5" /><span className="font-bold">Usar minha chave (nuvem)</span></div>
                <p className="text-[13px] text-ink-muted leading-relaxed">
                  Use sua própria chave de API (OpenAI, Groq, OpenRouter…). Melhor qualidade, sem baixar modelo.
                  A chave é cifrada no servidor e nunca aparece no navegador.
                </p>
                <span className="inline-block mt-3 text-[11px] font-mono uppercase bg-accent-soft text-accent-ink border border-accent/20 px-2 py-0.5 rounded">BYO Key</span>
              </button>
            </div>
          </>
        )}

        {step === 'cloud' && (
          <div className="p-6 rounded-2xl border border-border-subtle bg-surface space-y-4">
            <button onClick={() => setStep('choose')} className="flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </button>
            <div className="flex items-center gap-2 text-ink font-bold"><KeyRound className="w-4 h-4 text-accent" /> Conectar provedor de nuvem</div>

            <label className="block text-[12px] font-medium text-ink-muted">Provedor
              <select id="onboarding-provider-kind" name="onboarding-provider-kind" value={kind} onChange={(e) => pickKind(e.target.value as keyof typeof PROVIDERS)} className="mt-1 w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink text-sm">
                {Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>

            <label className="block text-[12px] font-medium text-ink-muted">URL base
              <input id="onboarding-base-url" name="onboarding-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.exemplo.com/v1" className="mt-1 w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink text-sm font-mono" />
            </label>

            <label className="block text-[12px] font-medium text-ink-muted">Modelo (opcional)
              <input id="onboarding-model" name="onboarding-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" className="mt-1 w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink text-sm font-mono" />
            </label>

            <label className="block text-[12px] font-medium text-ink-muted">Chave de API
              <input id="onboarding-api-key" name="onboarding-api-key" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="sk-…" className="mt-1 w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink text-sm font-mono" />
            </label>

            {status === 'error' && (
              <div className="flex items-start gap-2 text-[12px] text-error bg-error-soft/10 border border-error/20 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{message}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveCloud}
                disabled={status === 'saving'}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-sm disabled:opacity-60 cursor-pointer"
              >
                {status === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : status === 'ok' ? <Check className="w-4 h-4" /> : null}
                Testar e salvar
              </button>
              <button onClick={chooseLocal} className="text-[12px] text-ink-muted hover:text-ink underline cursor-pointer">Prefiro rodar local</button>
            </div>
          </div>
        )}

        {step === 'download' && (
          <div className="p-6 rounded-2xl border border-border-subtle bg-surface space-y-4">
            <div className="flex items-center gap-2 text-ink font-bold"><HardDrive className="w-4 h-4 text-accent" /> Tudo pronto para rodar local</div>
            <p className="text-[13px] text-ink-muted leading-relaxed">
              O modelo de transcrição é preparado na sua <strong className="text-ink">primeira captura</strong>,
              com barra de progresso em MB{tamanhoEstimadoMb ? <> — {tamanhoMedido ? '' : 'cerca de '}<strong className="text-ink">{tamanhoEstimadoMb} MB</strong></> : null}.
              Depois disso ele fica no seu navegador e roda offline.
            </p>
            <p className="text-[11px] text-ink-muted">
              Baixar só na captura evita preparar um modelo que a sua configuração não vai usar.
            </p>
            <div className="flex justify-end pt-1">
              <button onClick={onComplete} className="btn-solid px-4 py-2 text-[13px] cursor-pointer">Começar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Um cartão da apresentação: ícone + kicker + título + conteúdo + navegação. */
function TourSlide({
  icon, kicker, title, children, onBack, onNext, onSkip, nextLabel = 'Avançar',
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  children: React.ReactNode;
  onBack: (() => void) | null;
  onNext: () => void;
  onSkip: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="p-6 md:p-8 rounded-2xl border border-border-subtle bg-surface">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-accent-soft text-accent-ink mb-5">
        {icon}
      </div>
      <div className="label-mono text-ink-faint mb-1">{kicker}</div>
      <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-4">{title}</h1>
      <div>{children}</div>

      <div className="flex items-center justify-between gap-3 mt-7">
        <button onClick={onSkip} className="text-[12px] text-ink-muted hover:text-ink underline cursor-pointer">
          Pular apresentação
        </button>
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="btn-outline flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          )}
          <button onClick={onNext} className="btn-solid flex items-center gap-1">
            {nextLabel} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Passo numerado do laço "Como funciona". */
function LoopStep({ n, icon, title, desc }: { n: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3 p-3.5 rounded-xl border border-border-subtle bg-canvas">
      <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-accent-soft text-accent-ink">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-bold text-[13.5px] text-ink flex items-center gap-1.5">
          <span className="text-ink-faint font-mono text-[11px]">{n}</span> {title}
        </div>
        <p className="text-[12px] text-ink-muted leading-snug mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
