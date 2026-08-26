/**
 * AJUSTES DA EDIÇÃO LEVE — transcrição: rápida ou precisa.
 *
 * Substitui, na versão hospedada, o painel de motores (perfis de IA, credenciais, teste ao vivo):
 * sem servidor, a única decisão que existe é quanto de precisão a pessoa quer pagar em tempo. O
 * roteador (`sttRouter.ts`) lê `babel.sttQuality`: `auto` = tiny (inglês) / base (resto);
 * `accurate` = small com WebGPU, base sem. O download só acontece na próxima captura.
 */
import { useState } from 'react';
import { Gauge, Sparkles } from 'lucide-react';
import { getSttQuality, MODEL_DOWNLOAD_MB, WHISPER_MODELS } from '../gateway/sttRouter';

const CHAVE = 'babel.sttQuality';

export default function TranscricaoLeve() {
  const [qualidade, setQualidade] = useState<'auto' | 'accurate'>(() => (getSttQuality() === 'accurate' ? 'accurate' : 'auto'));
  const temGpu = typeof navigator !== 'undefined' && !!(navigator as unknown as { gpu?: unknown }).gpu;
  const escolher = (q: 'auto' | 'accurate') => {
    setQualidade(q);
    try { localStorage.setItem(CHAVE, q); } catch { /* sem storage */ }
  };
  const opcoes = [
    { id: 'auto' as const, icone: <Gauge className="w-4 h-4" />, titulo: 'Rápida (padrão)', sub: `Legenda em segundos em qualquer máquina. Modelo pequeno (${MODEL_DOWNLOAD_MB[WHISPER_MODELS.tiny]}–${MODEL_DOWNLOAD_MB[WHISPER_MODELS.base]} MB).` },
    { id: 'accurate' as const, icone: <Sparkles className="w-4 h-4" />, titulo: 'Precisa', sub: temGpu ? `Melhor em sotaques e ruído; mais lenta e baixa ~${MODEL_DOWNLOAD_MB[WHISPER_MODELS.small]} MB (usa a GPU).` : `Sem WebGPU neste navegador: usa o modelo médio (~${MODEL_DOWNLOAD_MB[WHISPER_MODELS.base]} MB).` },
  ];
  return (
    <section>
      <div className="flex items-center gap-2 mb-4 text-ink">
        <Gauge className="w-5 h-5" />
        <h2 className="font-display font-bold text-lg">Transcrição</h2>
      </div>
      <div className="card-panel p-5">
        <p className="text-[12px] text-ink-muted mb-3">Tudo roda no seu navegador; nada de áudio sai do computador. A escolha vale a partir da próxima captura.</p>
        <div className="grid gap-2" role="radiogroup" aria-label="Qualidade da transcrição">
          {opcoes.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={qualidade === o.id} onClick={() => escolher(o.id)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${qualidade === o.id ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-canvas hover:border-accent'}`}>
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${qualidade === o.id ? 'bg-accent text-white' : 'bg-surface text-ink-muted'}`}>{o.icone}</span>
              <span className="min-w-0">
                <span className="block font-bold text-[13.5px] text-ink">{o.titulo}</span>
                <span className="block text-[12px] text-ink-muted leading-snug">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ink-faint mt-3">Fonte de captura (aba, tela ou dispositivo de loopback) escolhe-se na própria tela de Capturar. O som inteiro do computador sem configurar nada só existe na versão instalada.</p>
      </div>
    </section>
  );
}
