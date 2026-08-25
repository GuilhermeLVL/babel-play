import { useState } from 'react';
import { BookOpen, Cpu, ExternalLink, Info, Sparkles, Waves, ChevronDown } from 'lucide-react';

/**
 * PROCEDÊNCIA — de onde veio este dado, e como foi apurado.
 *
 * A app ensina idiomas. Se ela mostra uma nota de pronúncia, uma tradução ou uma explicação sem
 * dizer a origem, o usuário não tem como saber se aprendeu um fato ou uma invenção — e nós não
 * temos como ser cobrados. Este selo é o contrato: TODO conteúdo que a app apresenta como
 * conhecimento carrega origem, método e (quando existe) um link para conferir na fonte.
 *
 * Três tipos, com pesos diferentes de confiança — e o selo DIZ isso:
 *  - `source`    → veio de uma fonte externa citável (Wiktionary). Verificável.
 *  - `computed`  → foi calculado por nós, com um método nomeado (ex.: similaridade de Levenshtein).
 *                  Determinístico, mas com limites — que o campo `limits` explicita.
 *  - `ai`        → foi GERADO por um modelo. Pode estar errado. Nunca apresentado como fato.
 */
type ProvenanceKind = 'source' | 'computed' | 'ai';

export interface ProvenanceProps {
  kind: ProvenanceKind;
  /** Quem produziu: 'Wiktionary', 'Web Speech API (navegador)', 'Llama 3 (local)', 'opus-mt'… */
  origin: string;
  /** Como foi apurado: 'verbete consultado', 'Levenshtein normalizado', 'geração por LLM'… */
  method?: string;
  /** Onde conferir. Sem URL o selo continua válido — só não é clicável. */
  url?: string;
  /**
   * O que este método NÃO garante. É o campo mais importante do selo: é ele que impede a app de
   * ensinar errado por omissão. Renderizado num expansor "o que isso significa".
   */
  limits?: string;
  className?: string;
}

const KIND_META: Record<ProvenanceKind, { label: string; icon: typeof Info; badge: string }> = {
  source:   { label: 'Fonte',           icon: BookOpen, badge: 'badge-tag ok' },
  computed: { label: 'Calculado',       icon: Waves,    badge: 'badge-tag acc' },
  ai:       { label: 'Gerado por IA',   icon: Sparkles, badge: 'badge-tag warn' },
};

export default function Provenance({ kind, origin, method, url, limits, className = '' }: ProvenanceProps) {
  const [open, setOpen] = useState(false);
  const meta = KIND_META[kind];
  const Icon = meta.icon;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
        <span className={meta.badge}>
          <Icon className="w-3 h-3" /> {meta.label}
        </span>

        <span className="font-mono text-ink-muted">{origin}</span>

        {method && (
          <>
            <span className="text-ink-faint" aria-hidden>·</span>
            <span className="font-mono text-ink-muted">{method}</span>
          </>
        )}

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-mono font-bold text-accent-ink hover:underline"
          >
            verificar <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {limits && (
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-0.5 font-mono text-ink-muted hover:text-ink transition-colors cursor-pointer"
            aria-expanded={open}
          >
            o que isso significa
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {limits && open && (
        <p className="text-[11px] text-ink-muted leading-relaxed bg-canvas border border-border-subtle rounded-lg p-2.5 animate-in fade-in duration-150">
          {limits}
        </p>
      )}
    </div>
  );
}

/**
 * Selo de IA em linha, para conteúdo curto (uma sugestão, um feedback de reescrita) onde o selo
 * completo pesaria demais. Continua dizendo o modelo: "IA" sozinho não é procedência.
 */
export function AiBadge({ model, className = '' }: { model?: string; className?: string }) {
  return (
    <span
      className={`badge-tag warn ${className}`}
      title="Conteúdo gerado por um modelo de linguagem. Pode conter erros — confira antes de decorar."
    >
      <Cpu className="w-3 h-3" />
      {model ? `Gerado por IA · ${model}` : 'Gerado por IA'}
    </span>
  );
}
