/**
 * ONBOARDING DA EDIÇÃO LEVE — uma tela, duas perguntas, zero credencial.
 *
 * O onboarding completo tem sete passos e pede chave de IA, perfil de exibição e modo local/nuvem;
 * faz sentido no self-host, nenhum na versão hospedada sem conta. Aqui só o que muda a experiência
 * na primeira captura: QUE idioma a pessoa quer aprender (vira `settings.targetLanguage`, que a
 * Captura lê como idioma do conteúdo) e PARA QUÊ (grava `ui.goal`; pinta o Início). Tudo no
 * IndexedDB, via o mesmo `saveLangConfig`/`patchUiSettings` que os Ajustes usam.
 */
import { useState } from 'react';
import { Gamepad2, GraduationCap, Briefcase, ArrowRight } from 'lucide-react';
import LangPicker from './LangPicker';
import { DEFAULT_LANG_CONFIG, saveLangConfig } from '../lib/langConfig';
import { patchUiSettings } from '../data/api';

export type ObjetivoLeve = 'jogos' | 'estudos' | 'trabalho';

const OBJETIVOS: Array<{ id: ObjetivoLeve; icone: React.ReactNode; titulo: string; sub: string }> = [
  { id: 'jogos', icone: <Gamepad2 className="w-5 h-5" />, titulo: 'Jogos e vídeos', sub: 'Entender o que falam no Discord, na live, na série.' },
  { id: 'estudos', icone: <GraduationCap className="w-5 h-5" />, titulo: 'Estudos', sub: 'Aulas, palestras, documentários — e revisar o vocabulário depois.' },
  { id: 'trabalho', icone: <Briefcase className="w-5 h-5" />, titulo: 'Trabalho', sub: 'Reuniões e chamadas em outro idioma, sem perder o fio.' },
];

export default function OnboardingLeve({ onComplete }: { onComplete: () => void }) {
  const [idioma, setIdioma] = useState<string>(DEFAULT_LANG_CONFIG.studying);
  const [objetivo, setObjetivo] = useState<ObjetivoLeve>('jogos');
  const [salvando, setSalvando] = useState(false);

  const concluir = async () => {
    setSalvando(true);
    try {
      await saveLangConfig({ studying: idioma });
      await patchUiSettings({ goal: objetivo, onboarded: true });
    } finally {
      setSalvando(false);
      onComplete();
    }
  };

  return (
    <div className="min-h-screen w-full bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-lg card-panel bg-surface p-8">
        <p className="label-mono mb-2">Babel Play</p>
        <h1 className="font-display font-black text-2xl text-ink tracking-tight">Duas perguntas e você já está ouvindo com legenda.</h1>
        <p className="mt-2 text-[13px] text-ink-muted">Tudo fica no seu navegador. Dá para mudar depois em Ajustes.</p>

        <section className="mt-7">
          <h2 className="font-bold text-[14px] text-ink mb-2">Que idioma você quer aprender?</h2>
          <LangPicker value={idioma} onPick={(v) => { if (v.code) setIdioma(v.code); }} />
        </section>

        <section className="mt-6">
          <h2 className="font-bold text-[14px] text-ink mb-2">Para quê, principalmente?</h2>
          <div className="grid gap-2" role="radiogroup" aria-label="Objetivo">
            {OBJETIVOS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={objetivo === o.id}
                onClick={() => setObjetivo(o.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                  objetivo === o.id ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-canvas hover:border-accent'
                }`}
              >
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${objetivo === o.id ? 'bg-accent text-white' : 'bg-surface text-ink-muted'}`}>{o.icone}</span>
                <span className="min-w-0">
                  <span className="block font-bold text-[13.5px] text-ink">{o.titulo}</span>
                  <span className="block text-[12px] text-ink-muted leading-snug">{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <button type="button" onClick={concluir} disabled={salvando} className="btn-ink w-full justify-center mt-7 disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Começar'} <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
  );
}
