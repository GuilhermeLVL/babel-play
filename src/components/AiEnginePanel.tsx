import React, { useMemo, useState } from 'react';
import { Zap, Check, AlertTriangle, Loader2, ShieldCheck, Cloud, HardDrive, Languages } from 'lucide-react';
import { buildGateway } from '../gateway';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID, getBuiltinProfile } from '../gateway/profiles';
import type { Capability } from '@core';

const PROFILE_STORAGE_KEY = 'babel.activeProfileId';

const PROFILE_META: Record<string, { desc: string; icon: React.ReactNode; badge: string; badgeClass: string }> = {
  'free-web': {
    desc: 'APIs gratuitas e nativas do navegador. Sem chave, sem custo.',
    icon: <Languages className="w-4 h-4" />,
    badge: 'Grátis',
    badgeClass: 'ok',
  },
  'local-private': {
    desc: 'Sua IA local (Ollama/LM Studio). Nada sai da máquina.',
    icon: <HardDrive className="w-4 h-4" />,
    badge: 'Privado',
    badgeClass: 'rare',
  },
  'cloud-quality': {
    desc: 'Provedores de nuvem com sua chave (BYO). Melhor qualidade.',
    icon: <Cloud className="w-4 h-4" />,
    badge: 'Nuvem',
    badgeClass: 'acc',
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

export default function AiEnginePanel() {
  const [activeId, setActiveId] = useState<string>(
    () => localStorage.getItem(PROFILE_STORAGE_KEY) ?? DEFAULT_PROFILE_ID
  );
  const [text, setText] = useState('Good morning, my friend. How are you today?');
  const [result, setResult] = useState<{ text: string; engine: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const profile = getBuiltinProfile(activeId);
  const gateway = useMemo(
    () => buildGateway({ profile: getBuiltinProfile(activeId), cloudConsent: () => true }),
    [activeId]
  );

  const selectProfile = (id: string) => {
    setActiveId(id);
    localStorage.setItem(PROFILE_STORAGE_KEY, id);
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
    if (!first) return '—';
    const where = first.baseUrl ? ' · local' : first.credentialId ? ' · nuvem' : '';
    return first.adapterId + where;
  };

  return (
    <div className="card-panel">
      <div className="p-5 bg-surface-hover border-b border-border-subtle flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-muted">
          Escolha o <strong className="text-ink">perfil</strong> que alimenta cada capacidade. Provider-agnóstico:
          troque de motor sem perder nada.
        </p>
        <span className="badge-tag acc shrink-0">
          <ShieldCheck className="w-3 h-3" /> Sem lock-in
        </span>
      </div>

      {/* Seletor de perfil */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-border-subtle">
        {BUILTIN_PROFILES.map((p) => {
          const meta = PROFILE_META[p.id];
          const active = p.id === activeId;
          return (
            <button
              key={p.id}
              onClick={() => selectProfile(p.id)}
              className={`p-4 border-2 rounded-xl text-left transition-colors ${
                active ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-2 font-bold text-[13.5px] text-ink">
                  {meta?.icon}
                  {p.name}
                </span>
                <span className={`badge-tag ${meta?.badgeClass ?? 'ok'}`}>{meta?.badge}</span>
              </div>
              <p className="text-[12px] text-ink-muted">{meta?.desc}</p>
            </button>
          );
        })}
      </div>

      {/* ── O QUE ESTE JEITO CONSEGUE FAZER ──────────────────────────────────────────────────
          Antes esta grade dizia `STT · whisper-local`, `VLM · —`. Os dois lados eram opacos: a
          sigla não diz o que a capacidade FAZ, e o travessão não diz que a coisa não funciona
          naquele perfil — parecia campo vazio, não recurso ausente. Quem escolhia "Privado/Local"
          descobria que a busca por sentido não funcionava ao tentar usá-la.

          Agora cada linha diz a capacidade em português, o que ela alimenta na tela, e o VEREDITO.
          O nome técnico do motor continua ali, à direita: era a informação útil da versão antiga e
          continua sendo — para quem depura, é a única que importa. */}
      <div className="p-5 border-b border-border-subtle">
        <div className="label-mono mb-3">O que este jeito consegue fazer</div>
        <ul className="flex flex-col gap-1.5">
          {CAPS.map((cap) => {
            const meta = CAPACIDADE[cap];
            const motor = bindingLabel(cap);
            /* O veredito sai do PERFIL, não de uma tabela escrita à mão: sem binding declarado, a
               capacidade não roda — e é isso que a linha diz. Uma tabela paralela sairia de sincronia
               com `gateway/profiles.ts` no primeiro perfil novo. */
            const atende = motor !== '—';
            return (
              <li
                key={cap}
                className="flex items-center justify-between gap-3 bg-surface border border-border-subtle rounded-lg px-3 py-2.5"
              >
                <span className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${atende ? 'bg-good' : 'bg-warn'}`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block font-bold text-[13px] text-ink">{meta.titulo}</span>
                    <span className="block text-[11.5px] text-ink-muted leading-snug">{meta.onde}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-[12px] font-bold ${atende ? 'text-good-ink' : 'text-warn-ink'}`}>
                    {atende ? 'funciona aqui' : 'não dá neste jeito'}
                  </span>
                  {atende && (
                    <span className="block text-[10.5px] font-mono text-ink-faint truncate max-w-[16ch]" title={motor}>
                      {motor}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Teste ao vivo pelo gateway */}
      <div className="p-5">
        <div className="label-mono mb-1 flex items-center gap-1.5">
          <Languages className="w-3.5 h-3.5" /> Testar antes de confiar · Tradução EN → PT
        </div>
        {/* Que o teste não grava nada é a pergunta silenciosa de quem escolheu um perfil local por
            privacidade. Responder aqui custa uma linha; não responder custa o teste não ser feito. */}
        <p className="text-[11.5px] text-ink-muted mb-2">
          Traduza uma frase agora e veja o que este jeito devolve. Nada é salvo no seu caderno.
        </p>
        {/* C2 — o rótulo acima é um `div`, não um `<label for>`: visualmente identifica o campo,
            para o leitor de tela não identifica nada. `aria-label` fecha a lacuna sem mexer no
            layout (axe: regra `label`, WCAG 4.1.2). */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          aria-label="Texto em inglês para testar a tradução ao vivo"
          className="w-full bg-canvas border border-border-subtle rounded-xl p-3 text-[13px] outline-none focus:border-accent transition-colors resize-none"
        />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={runTest} disabled={status === 'loading' || !text.trim()} className="btn-solid py-2 disabled:opacity-50">
            {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Traduzir pelo gateway
          </button>
          <span className="text-[11.5px] text-ink-faint font-mono">perfil: {profile.name}</span>
        </div>

        {result && (
          <div className="mt-4 ap-result-correct text-left">
            <div className="ap-validation-label text-good mb-1.5">
              <Check className="w-3.5 h-3.5" /> Resultado · engine: {result.engine}
            </div>
            <p className="text-[15px] text-ink font-medium">{result.text}</p>
          </div>
        )}
        {status === 'error' && (
          <div className="mt-4 ap-result-error text-left">
            <div className="ap-validation-label text-error mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Falhou
            </div>
            <p className="text-[13px] text-ink-muted break-words">{error}</p>
            <p className="text-[11.5px] text-ink-faint mt-1">
              O perfil “Grátis/Web” traduz via MyMemory sem chave. Perfis local/nuvem exigem Ollama rodando ou uma
              credencial, configurada em Ajustes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
