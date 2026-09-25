import type { Capability } from '@core';
import { AlertTriangle, Check, Cpu, FlaskConical, KeyRound, ListChecks, Loader2, Server, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';

import { createCredential, fetchSettings, patchUiSettings, testProvider } from '../data/api';
import { buildGateway } from '../gateway';
import { CREDENTIAL_KEY, setProviderChoice } from '../gateway/activeProfile';
import { DEFAULT_PROFILE_ID, getBuiltinProfile } from '../gateway/profiles';
import { getSttQuality, MODEL_DOWNLOAD_MB, routeStt } from '../gateway/sttRouter';
import { consentiuNuvem } from '../lib/consentimentoDeNuvem';
import { t } from '../lib/i18n';
import { toast } from './Toast';
import { Dialogo, fecharDialogoDe, IconeEmBloco, TituloDeSecao } from './ui';

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
function mbDoModelo(): number | null {
  try {
    const rota = routeStt({
      contentLang: 'en',
      autoDetect: true,
      quality: getSttQuality(),
      hasWebGpu: !!(navigator as Navigator & { gpu?: unknown }).gpu,
      cloudAvailable: false,
      profileId: DEFAULT_PROFILE_ID,
    });
    return MODEL_DOWNLOAD_MB[rota.localModel] ?? null;
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
  const mb = useMemo(mbDoModelo, []);

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

  return (
    <>
      <section>
        <TituloDeSecao
          icone={Server}
          titulo={t('Onde as contas rodam')}
          desc="Você pode mudar quando quiser. A escolha vale para transcrição e tradução."
        />
        <div className="pilha">
          <button
            type="button"
            className={`cartao opcao ${!nuvem ? 'sel' : ''}`}
            aria-pressed={!nuvem}
            onClick={() => void escolherAparelho(activeId === 'local-private' ? 'local-private' : 'free-web')}
          >
            <span className="radio" aria-hidden="true" />
            <IconeEmBloco icone={Cpu} />
            <span style={{ flex: 1 }}>
              <h3>
                Rodar no seu aparelho{' '}
                <span className="badge ok" style={{ marginLeft: 6 }}>
                  Grátis · privado
                </span>
              </h3>
              <p>
                Baixa o modelo ({mb ? `${mb} MB, ` : ''}uma vez só, com barra de progresso) e roda 100% offline. Sem
                chave e sem custo.
              </p>
            </span>
          </button>
          <button
            type="button"
            className={`cartao opcao ${nuvem ? 'sel' : ''}`}
            aria-pressed={nuvem}
            disabled={bloqueadaNuvem}
            title={bloqueadaNuvem ? 'Disponível no plano Pro' : undefined}
            onClick={() => void escolherNuvem()}
          >
            <span className="radio" aria-hidden="true" />
            <IconeEmBloco icone={KeyRound} />
            <span style={{ flex: 1 }}>
              <h3>
                Usar a sua chave (nuvem){' '}
                <span className="badge rare" style={{ marginLeft: 6 }}>
                  {bloqueadaNuvem ? 'Pro' : 'BYO key'}
                </span>
              </h3>
              <p>OpenAI, Groq, OpenRouter… Melhor qualidade, sem baixar modelo. A chave fica cifrada no servidor.</p>
            </span>
          </button>
        </div>
        {!nuvem && (
          <label className="check" style={{ marginTop: 12, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={activeId === 'local-private'}
              onChange={(e) => void escolherAparelho(e.target.checked ? 'local-private' : 'free-web')}
            />{' '}
            Usar também a IA do computador (Ollama/LM Studio) para explicar e corrigir
          </label>
        )}
        {nuvem && (
          <button
            type="button"
            className="link"
            style={{ marginTop: 12, fontSize: 13 }}
            onClick={() => setPedindoChave(true)}
          >
            Trocar a chave
          </button>
        )}
      </section>

      {/* O que cada jeito faz e o teste ao vivo: do app, não do protótipo — recolhidos por padrão. */}
      <details className="secao">
        <summary className="link" style={{ fontSize: 13, cursor: 'pointer' }}>
          Ver o que este jeito consegue fazer e testar uma tradução
        </summary>
        <section className="secao">
          <TituloDeSecao icone={ListChecks} titulo={t('O que este jeito consegue fazer')} />
          <div className="cartao">
            {CAPS.map((cap) => {
              const meta = CAPACIDADE[cap];
              const motor = bindingLabel(cap);
              const atende = motor !== '-';
              return (
                <div key={cap} className="ajuste ajuste-l">
                  <div>
                    <h3>{t(meta.titulo)}</h3>
                    <p className="mut">{t(meta.onde)}</p>
                  </div>
                  <span className="linha" style={{ gap: 8 }}>
                    {atende && (
                      <small className="mut" style={{ fontFamily: 'var(--font-mono)' }} title={motor}>
                        {motor}
                      </small>
                    )}
                    <span className={`badge ${atende ? 'ok' : 'warn'}`}>
                      {atende ? t('funciona aqui') : t('não dá neste jeito')}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="secao">
          <TituloDeSecao
            icone={FlaskConical}
            titulo={t('Testar antes de confiar')}
            desc={t(
              'Traduza uma frase agora (inglês → português) e veja o que este jeito devolve. Nada é salvo no seu caderno.',
            )}
          />
          <div className="cartao p5">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              aria-label="Texto em inglês para testar a tradução ao vivo"
              className="campo"
            />
            <div className="linha" style={{ gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={runTest}
                disabled={status === 'loading' || !text.trim()}
                className="btn btn-solid"
              >
                {status === 'loading' ? <Loader2 className="gira" aria-hidden /> : <Zap aria-hidden />}
                {t('Traduzir pelo gateway')}
              </button>
              <small className="mut" style={{ fontFamily: 'var(--font-mono)' }}>
                perfil: {profile.name}
              </small>
            </div>

            {result && (
              <div className="linha" style={{ gap: 12, marginTop: 16, alignItems: 'flex-start' }}>
                <IconeEmBloco icone={Check} tom="good" />
                <div>
                  <span className="label-mono">Resultado · engine: {result.engine}</span>
                  <p style={{ fontSize: 15, marginTop: 2 }}>{result.text}</p>
                </div>
              </div>
            )}
            {status === 'error' && (
              <div className="linha" style={{ gap: 12, marginTop: 16, alignItems: 'flex-start' }}>
                <IconeEmBloco icone={AlertTriangle} tom="warn" />
                <div style={{ minWidth: 0 }}>
                  <span className="label-mono">Falhou</span>
                  <p className="mut" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                    {error}
                  </p>
                </div>
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
