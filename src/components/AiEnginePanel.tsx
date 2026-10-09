import type { Capability } from '@core';
import { AlertTriangle, Cpu, KeyRound, ListChecks, Loader2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';

import { createCredential, fetchSettings, patchUiSettings, testProvider } from '../data/api';
import { buildGateway } from '../gateway';
import { CREDENTIAL_KEY, setProviderChoice } from '../gateway/activeProfile';
import { webGpuProvavel } from '../gateway/adaptadorWebGpu';
import { DEFAULT_PROFILE_ID, getBuiltinProfile } from '../gateway/profiles';
import { getSttQuality, routeStt, tamanhoDoDownloadMb } from '../gateway/sttRouter';
import { consentiuNuvem } from '../lib/consentimentoDeNuvem';
import { dispositivoDaRota, perfilDoDispositivo } from '../lib/dispositivo/perfil';
import type { SondaDoAparelho } from '../lib/dispositivo/sonda';
import { useSondaGuardada } from '../lib/dispositivo/useSondaGuardada';
import { edicaoEstatica } from '../lib/edicaoEstatica';
import { t } from '../lib/i18n';
import { toast } from './Toast';
import { Dialogo, fecharDialogoDe } from './ui';

const PROFILE_STORAGE_KEY = 'babel.activeProfileId';

const CAPS: Capability[] = ['stt', 'mt', 'tts', 'llm', 'embed', 'vlm'];

/**
 * A sigla traduzida para o que a pessoa vê acontecer na tela.
 */
const CAPACIDADE: Record<Capability, { titulo: string; onde: string }> = {
  stt: { titulo: 'Escrever o que foi falado', onde: 'nas gravações e nos jogos de áudio' },
  mt: { titulo: 'Traduzir', onde: 'legendas ao vivo e palavras do caderno' },
  tts: { titulo: 'Ler em voz alta', onde: 'ouvir palavras e frases' },
  llm: { titulo: 'Explicar e corrigir', onde: 'julgar respostas parecidas' },
  embed: { titulo: 'Procurar por sentido', onde: 'achar uma gravação pelo assunto' },
  vlm: { titulo: 'Ler imagens', onde: 'texto dentro de foto ou print' },
};

/** Provedores OpenAI-compatíveis — os mesmos da apresentação (`Onboarding`). */
const PROVEDORES: Record<string, { rotulo: string; baseUrl: string; modelo: string }> = {
  openai: { rotulo: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelo: 'gpt-4o-mini' },
  groq: { rotulo: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', modelo: 'openai/gpt-oss-120b' },
  openrouter: { rotulo: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', modelo: '' },
  custom: { rotulo: 'Outro', baseUrl: '', modelo: '' },
};

function lerCredencial(): string | null {
  try {
    return localStorage.getItem(CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

/** O tamanho do modelo local, estimado como a apresentação estima (o download é na 1ª captura). */
function mbDoModelo(sonda: SondaDoAparelho | null): number | null {
  try {
    const rota = routeStt({
      contentLang: 'en',
      autoDetect: true,
      quality: getSttQuality(),
      hasWebGpu: webGpuProvavel(),
      cloudAvailable: false,
      profileId: DEFAULT_PROFILE_ID,
      dispositivo: dispositivoDaRota(perfilDoDispositivo(), sonda),
    });
    // O tamanho do DTYPE da rota: no celular/Quest o base vai em q8 (80 MB, não 209).
    return tamanhoDoDownloadMb(rota.localModel, rota.dtype);
  } catch {
    return null;
  }
}

/**
 * ONDE AS CONTAS RODAM — a aba "Processamento" de Ajustes, no desenho do protótipo aprovado
 * (`opcaoIA` de `T.ajustes`): DUAS opções, "Rodar no seu aparelho" e "Usar a sua chave (nuvem)".
 *
 * Por baixo, as duas são a MESMA escolha que a apresentação grava (`providerMode` + perfil +
 * credencial em `settings.ui`): aparelho = perfil `free-web`; nuvem = `cloud-quality` com a chave.
 * Sem chave cadastrada, escolher a nuvem abre o formulário da chave (o mesmo da apresentação:
 * `createCredential` + `testProvider`). A chave anterior fica lembrada: voltar para a nuvem depois
 * não pede de novo.
 *
 * O perfil com IA local do computador (Ollama/LM Studio) continua existindo como uma opção dentro
 * de "Rodar no seu aparelho". A lista do que cada jeito faz e o teste ao vivo ficam num detalhe
 * recolhido, embaixo.
 */
export default function AiEnginePanel({
  activeId: controladoId,
  onSelect,
  bloqueados = [],
}: {
  activeId?: string;
  onSelect?: (id: string) => void;
  bloqueados?: string[];
} = {}) {
  const [internoId, setInternoId] = useState<string>(
    () => localStorage.getItem(PROFILE_STORAGE_KEY) ?? DEFAULT_PROFILE_ID,
  );
  const activeId = controladoId ?? internoId;
  const nuvem = activeId === 'cloud-quality';
  const [pedindoChave, setPedindoChave] = useState(false);
  const [text, setText] = useState('Good morning, my friend. How are you today?');
  const [result, setResult] = useState<{ text: string; engine: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const sonda = useSondaGuardada();
  const mb = useMemo(() => mbDoModelo(sonda), [sonda]);

  const profile = getBuiltinProfile(activeId);
  const gateway = useMemo(
    () => buildGateway({ profile: getBuiltinProfile(activeId), cloudConsent: consentiuNuvem }),
    [activeId],
  );

  const aplicar = (id: string) => {
    if (onSelect) onSelect(id);
    else {
      setInternoId(id);
      localStorage.setItem(PROFILE_STORAGE_KEY, id);
    }
    setResult(null);
    setStatus('idle');
    setError('');
  };

  const escolherAparelho = async (perfil: 'free-web' | 'local-private' = 'free-web') => {
    const cred = lerCredencial();
    setProviderChoice({ mode: 'local', profileId: perfil });
    aplicar(perfil);
    const ok = await patchUiSettings({
      providerMode: 'local',
      credentialId: null,
      ...(cred ? { credencialDaNuvem: cred } : {}),
    });
    if (!ok) toast.warn('Não consegui salvar a escolha. Verifique a conexão e tente de novo.');
  };

  const usarNuvem = async (credentialId: string) => {
    setProviderChoice({ mode: 'cloud', profileId: 'cloud-quality', credentialId });
    aplicar('cloud-quality');
    const ok = await patchUiSettings({ providerMode: 'cloud', credentialId, credencialDaNuvem: credentialId });
    if (!ok) toast.warn('Não consegui salvar a escolha. Verifique a conexão e tente de novo.');
  };

  const escolherNuvem = async () => {
    if (bloqueados.includes('cloud-quality')) return;
    let cred = lerCredencial();
    if (!cred) {
      const s = await fetchSettings();
      try {
        const ui = s?.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {};
        cred = (ui.credencialDaNuvem as string | undefined) ?? (ui.credentialId as string | undefined) ?? null;
      } catch {
        cred = null;
      }
    }
    if (!cred) {
      setPedindoChave(true);
      return;
    }
    await usarNuvem(cred);
  };

  const runTest = async () => {
    setStatus('loading');
    setResult(null);
    setError('');
    try {
      const r = await gateway.mt.translate(text, 'en', 'pt');
      setResult({ text: r.text, engine: r.engine });
      setStatus('idle');
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setStatus('error');
    }
  };

  const bindingLabel = (cap: Capability): string => {
    const first = profile.bindings[cap]?.[0];
    if (!first) return '-';
    const where = first.baseUrl ? ' · local' : first.credentialId ? ' · nuvem' : '';
    return first.adapterId + where;
  };

  const bloqueadaNuvem = bloqueados.includes('cloud-quality');

  /* QUEST: as mesmas duas opções como cartões-alvo, a IA do computador num interruptor, e o detalhe
     (o que este jeito faz, o teste ao vivo) recolhido atrás de um alvo de 60 px. */
  return (
    <>
      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Onde as contas rodam')}</h2>
            <p>{t('Você pode mudar quando quiser. A escolha vale para transcrição e tradução.')}</p>
          </div>
        </header>
        <div className={edicaoEstatica() ? 'q-grade' : 'q-grade g2'}>
          <button
            type="button"
            className="q-tile q-aju-opcao"
            aria-pressed={!nuvem}
            onClick={() => void escolherAparelho(activeId === 'local-private' ? 'local-private' : 'free-web')}
          >
            <span className="q-ic">
              <Cpu aria-hidden />
            </span>
            <b>{t('Rodar no seu aparelho')}</b>
            <span className="q-aju-tags">
              <span className="q-tag">{t('Grátis · privado')}</span>
              {!nuvem && <span className="q-tag">{t('Em uso')}</span>}
            </span>
            <span className="q-d">
              {mb
                ? t(
                    'Baixa o modelo ({mb} MB, uma vez só, com barra de progresso) e roda 100% offline. Sem chave e sem custo.',
                    { mb },
                  )
                : t('Baixa o modelo (uma vez só, com barra de progresso) e roda 100% offline. Sem chave e sem custo.')}
            </span>
          </button>
          {/* Edição estática: a chave ficaria cifrada no SERVIDOR, que ela não tem: sem a opção. */}
          {!edicaoEstatica() && (
            <button
              type="button"
              className="q-tile q-aju-opcao"
              aria-pressed={nuvem}
              disabled={bloqueadaNuvem}
              onClick={() => void escolherNuvem()}
            >
              <span className="q-ic">
                <KeyRound aria-hidden />
              </span>
              <b>{t('Usar a sua chave (nuvem)')}</b>
              <span className="q-aju-tags">
                <span className="q-tag">{bloqueadaNuvem ? t('Premium') : t('Sua chave')}</span>
                {nuvem && <span className="q-tag">{t('Em uso')}</span>}
              </span>
              <span className="q-d">
                {t('OpenAI, Groq, OpenRouter… Melhor qualidade, sem baixar modelo. A chave fica cifrada no servidor.')}
                {bloqueadaNuvem && ` ${t('Disponível no plano Premium.')}`}
              </span>
            </button>
          )}
        </div>
        <div className="q-ajustes">
          {!nuvem && (
            <div className="q-ajuste">
              <div>
                <b>{t('Usar também a IA do computador')}</b>
                <small>{t('Ollama ou LM Studio na sua rede, para explicar e corrigir.')}</small>
              </div>
              <button
                type="button"
                className="q-interruptor"
                role="switch"
                aria-checked={activeId === 'local-private'}
                aria-label={t('Usar também a IA do computador')}
                onClick={() => void escolherAparelho(activeId === 'local-private' ? 'free-web' : 'local-private')}
              />
            </div>
          )}
          {nuvem && (
            <div className="q-ajuste">
              <div>
                <b>{t('Chave de API')}</b>
                <small>{t('A chave fica cifrada no servidor e nunca volta ao navegador.')}</small>
              </div>
              <button type="button" className="q-ctl" onClick={() => setPedindoChave(true)}>
                <KeyRound aria-hidden /> {t('Trocar a chave')}
              </button>
            </div>
          )}
        </div>
      </section>

      <details className="q-aju-detalhe">
        <summary>
          <ListChecks aria-hidden /> {t('Ver o que este jeito consegue fazer e testar uma tradução')}
        </summary>
        <section className="q-secao">
          <header>
            <div>
              <h3>{t('O que este jeito consegue fazer')}</h3>
            </div>
          </header>
          <div className="q-ajustes">
            {CAPS.map((cap) => {
              const meta = CAPACIDADE[cap];
              const motor = bindingLabel(cap);
              const atende = motor !== '-';
              return (
                <div key={cap} className="q-ajuste">
                  <div>
                    <b>{t(meta.titulo)}</b>
                    <small>{t(meta.onde)}</small>
                  </div>
                  {atende && <span className="q-aud-par">{motor}</span>}
                  <span className={atende ? 'q-tag' : 'q-tag off'}>
                    {atende ? t('funciona aqui') : t('não dá neste jeito')}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="q-secao">
          <header>
            <div>
              <h3>{t('Testar antes de confiar')}</h3>
              <p>
                {t(
                  'Traduza uma frase agora (inglês → português) e veja o que este jeito devolve. Nada é salvo no seu caderno.',
                )}
              </p>
            </div>
          </header>
          <div className="q-cartao">
            <label className="q-campo">
              <span>{t('Frase em inglês')}</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                aria-label={t('Texto em inglês para testar a tradução ao vivo')}
              />
            </label>
            <div className="q-acoes">
              <button type="button" className="q-ctl" onClick={runTest} disabled={status === 'loading' || !text.trim()}>
                {status === 'loading' ? <Loader2 className="gira" aria-hidden /> : <Zap aria-hidden />}
                {status === 'loading' ? t('Traduzindo…') : t('Traduzir pelo gateway')}
              </button>
              <span className="q-aud-par">{t('perfil: {nome}', { nome: profile.name })}</span>
            </div>
            {result && (
              <div className="q-aju-resultado" role="status">
                <span className="q-rotulo">{t('Resultado · motor: {motor}', { motor: result.engine })}</span>
                <p>{result.text}</p>
              </div>
            )}
            {status === 'error' && (
              <div className="q-aju-resultado erro" role="alert">
                <span className="q-rotulo">
                  <AlertTriangle aria-hidden /> {t('Falhou')}
                </span>
                <p>{error}</p>
              </div>
            )}
          </div>
        </section>
      </details>

      {pedindoChave && <DialogoDaChave aoFechar={() => setPedindoChave(false)} aoSalvar={(id) => void usarNuvem(id)} />}
    </>
  );
}

/** O formulário da chave — o mesmo da apresentação, num diálogo do protótipo. */
function DialogoDaChave({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: (credentialId: string) => void }) {
  const [tipo, setTipo] = useState<keyof typeof PROVEDORES>('openai');
  const [baseUrl, setBaseUrl] = useState(PROVEDORES.openai.baseUrl);
  const [modelo, setModelo] = useState(PROVEDORES.openai.modelo);
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const escolher = (k: keyof typeof PROVEDORES) => {
    setTipo(k);
    setBaseUrl(PROVEDORES[k].baseUrl);
    setModelo(PROVEDORES[k].modelo);
  };

  const salvar = async (el: HTMLElement) => {
    setErro('');
    if (!baseUrl || !chave) return setErro('Informe a URL base e a chave de API.');
    setOcupado(true);
    try {
      const cred = await createCredential({
        label: PROVEDORES[tipo].rotulo,
        kind: tipo,
        baseUrl,
        defaultModel: modelo || undefined,
        secret: chave,
      });
      if (!cred) return setErro('Não foi possível salvar a chave.');
      const teste = await testProvider({ credentialId: cred.id });
      if (!teste.ok)
        return setErro(`A chave não passou no teste: ${teste.message ?? 'falha'}. Revise e tente de novo.`);
      toast.ok('Chave salva e testada. A nuvem está ligada.');
      aoSalvar(cred.id);
      fecharDialogoDe(el);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      icone={KeyRound}
      titulo="Usar a sua chave"
      sub="A chave fica cifrada no servidor e nunca volta ao navegador."
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        <div className="seg" role="radiogroup" aria-label="Provedor" style={{ marginBottom: 12 }}>
          {(Object.keys(PROVEDORES) as Array<keyof typeof PROVEDORES>).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={tipo === k} onClick={() => escolher(k)}>
              {PROVEDORES[k].rotulo}
            </button>
          ))}
        </div>
        <div className="form-l">
          <label htmlFor="ch-url">URL base</label>
          <input className="campo" id="ch-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="form-l">
          <label htmlFor="ch-modelo">Modelo</label>
          <input className="campo" id="ch-modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </div>
        <div className="form-l">
          <label htmlFor="ch-chave">Chave de API</label>
          <input
            className="campo"
            id="ch-chave"
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
          />
        </div>
        {erro && (
          <p className="erro-auth" role="alert">
            {erro}
          </p>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-solid"
          disabled={ocupado}
          onClick={(e) => void salvar(e.currentTarget)}
        >
          {ocupado && <Loader2 className="gira" aria-hidden />} Salvar e testar
        </button>
      </div>
    </Dialogo>
  );
}
