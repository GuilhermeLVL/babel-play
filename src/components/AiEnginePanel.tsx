import type { Capability } from '@core';
import {
  AlertTriangle,
  Check,
  Cloud,
  FlaskConical,
  HardDrive,
  Languages,
  ListChecks,
  Loader2,
  Server,
  Zap,
} from 'lucide-react';
import { type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { buildGateway } from '../gateway';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID, getBuiltinProfile } from '../gateway/profiles';
import { t } from '../lib/i18n';
import { IconeEmBloco, TituloDeSecao } from './ui';

const PROFILE_STORAGE_KEY = 'babel.activeProfileId';

const PROFILE_META: Record<string, { desc: string; icone: LucideIcon; badge: string; badgeClass: string }> = {
  'free-web': {
    desc: 'APIs gratuitas e nativas do navegador. Sem chave, sem custo.',
    icone: Languages,
    badge: 'Grátis',
    badgeClass: 'ok',
  },
  'local-private': {
    desc: 'Sua IA local (Ollama/LM Studio). Nada sai da máquina.',
    icone: HardDrive,
    badge: 'Privado',
    badgeClass: 'ok',
  },
  'cloud-quality': {
    desc: 'Provedores de nuvem com sua chave (BYO). Melhor qualidade. A chave fica cifrada no servidor.',
    icone: Cloud,
    badge: 'BYO key',
    badgeClass: 'rare',
  },
};

const CAPS: Capability[] = ['stt', 'mt', 'tts', 'llm', 'embed', 'vlm'];

/**
 * A sigla traduzida para o que a pessoa vê acontecer na tela.
 *
 * `onde` não é enfeite: "Traduzir" sozinho não deixa ninguém decidir se pode viver sem, mas
 * "legendas ao vivo e palavras do caderno" deixa. É a diferença entre uma lista de siglas e uma
 * lista sobre a qual dá para escolher.
 */
const CAPACIDADE: Record<Capability, { titulo: string; onde: string }> = {
  stt: { titulo: 'Escrever o que foi falado', onde: 'nas gravações e nos jogos de áudio' },
  mt: { titulo: 'Traduzir', onde: 'legendas ao vivo e palavras do caderno' },
  tts: { titulo: 'Ler em voz alta', onde: 'ouvir palavras e frases' },
  llm: { titulo: 'Explicar e corrigir', onde: 'julgar respostas parecidas' },
  embed: { titulo: 'Procurar por sentido', onde: 'achar uma gravação pelo assunto' },
  vlm: { titulo: 'Ler imagens', onde: 'texto dentro de foto ou print' },
};

/**
 * ONDE AS CONTAS RODAM — a aba "Processamento" de Ajustes, na marcação do protótipo aprovado
 * (`.cartao.opcao` com `.radio`, linhas `.ajuste`).
 *
 * UM SELETOR, UM DONO (auditoria de UX, 31/08). O painel aceita ser CONTROLADO
 * (`activeId`/`onSelect`/`bloqueados`) — o Settings injeta a persistência e o gate — e o modo
 * interno fica só como fallback para uso avulso.
 *
 * O protótipo desenha duas opções (aparelho / sua chave); o app tem três perfis reais, e os três
 * aparecem. A lista do que cada perfil consegue fazer e o teste ao vivo são do app e ficam, abaixo.
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
  const [text, setText] = useState('Good morning, my friend. How are you today?');
  const [result, setResult] = useState<{ text: string; engine: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const profile = getBuiltinProfile(activeId);
  const gateway = useMemo(
    () => buildGateway({ profile: getBuiltinProfile(activeId), cloudConsent: () => true }),
    [activeId],
  );

  const selectProfile = (id: string) => {
    if (bloqueados.includes(id)) return;
    if (onSelect) {
      onSelect(id);
    } else {
      setInternoId(id);
      localStorage.setItem(PROFILE_STORAGE_KEY, id);
    }
    setResult(null);
    setStatus('idle');
    setError('');
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

  return (
    <>
      <section>
        <TituloDeSecao
          icone={Server}
          titulo={t('Onde as contas rodam')}
          desc={t('Você pode mudar quando quiser. Trocar não apaga nada: suas gravações e palavras ficam.')}
        />
        <div className="pilha">
          {BUILTIN_PROFILES.map((p) => {
            const meta = PROFILE_META[p.id];
            const active = p.id === activeId;
            const bloqueado = bloqueados.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProfile(p.id)}
                disabled={bloqueado}
                aria-disabled={bloqueado}
                aria-pressed={active}
                className={`cartao opcao ${active ? 'sel' : ''}`}
                style={bloqueado ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
              >
                <span className="radio" aria-hidden />
                <IconeEmBloco icone={meta?.icone ?? Server} />
                <span style={{ flex: 1 }}>
                  <h3>
                    {p.name}{' '}
                    <span className={`badge ${meta?.badgeClass ?? 'ok'}`} style={{ marginLeft: 6 }}>
                      {bloqueado ? 'Pro' : meta?.badge}
                    </span>
                  </h3>
                  <p>{meta?.desc}</p>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── O QUE ESTE JEITO CONSEGUE FAZER ──────────────────────────────────────────────────
          Cada linha diz a capacidade em português, o que ela alimenta na tela, e o VEREDITO. O
          veredito sai do PERFIL, não de uma tabela escrita à mão: sem binding declarado, a
          capacidade não roda. O nome técnico do motor fica à direita, para quem depura. */}
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

      {/* Teste ao vivo pelo gateway. Que o teste não grava nada é a pergunta silenciosa de quem
          escolheu um perfil local por privacidade. */}
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
              {status === 'loading' ? <Loader2 className="animate-spin" aria-hidden /> : <Zap aria-hidden />}
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
                <p className="mut" style={{ fontSize: 12, marginTop: 4 }}>
                  O perfil “Grátis/Web” traduz via MyMemory sem chave. Perfis local/nuvem exigem Ollama rodando ou uma
                  credencial, configurada em Ajustes.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
