/**
 * ONBOARDING DA EDIÇÃO LEVE — dois passos, zero credencial.
 *
 * Passo 1 — QUEM FEZ: o app é de um desenvolvedor independente e faz questão de dizer isso na
 * porta de entrada: dá rosto ao projeto, explica por que é grátis e onde falar com o autor.
 * Um clique ("Vamos lá") segue adiante; os links abrem em nova aba sem interromper o fluxo.
 *
 * Passo 2 — O ESSENCIAL: só o que muda a experiência na primeira captura — QUE idioma a pessoa
 * quer aprender (vira `settings.targetLanguage`, que a Captura lê como idioma do conteúdo) e
 * PARA QUÊ (grava `ui.goal`; pinta o Início). Tudo no IndexedDB, via o mesmo
 * `saveLangConfig`/`patchUiSettings` que os Ajustes usam.
 *
 * Os dados do autor vêm de `lib/criador.ts` (fonte única — a tela Sobre lê do mesmo lugar).
 */
import { useState } from 'react';
import { Gamepad2, GraduationCap, Briefcase, ArrowRight, Github, Globe, Linkedin } from 'lucide-react';
import LangPicker from './LangPicker';
import { DEFAULT_LANG_CONFIG, saveLangConfig } from '../lib/langConfig';
import { patchUiSettings } from '../data/api';
import { CRIADOR, preenchido } from '../lib/criador';

export type ObjetivoLeve = 'jogos' | 'estudos' | 'trabalho';

const OBJETIVOS: Array<{ id: ObjetivoLeve; icone: React.ReactNode; titulo: string; sub: string }> = [
  { id: 'jogos', icone: <Gamepad2 className="w-5 h-5" />, titulo: 'Jogos e vídeos', sub: 'Entender o que falam no Discord, na live, na série.' },
  { id: 'estudos', icone: <GraduationCap className="w-5 h-5" />, titulo: 'Estudos', sub: 'Aulas, palestras, documentários — e revisar o vocabulário depois.' },
  { id: 'trabalho', icone: <Briefcase className="w-5 h-5" />, titulo: 'Trabalho', sub: 'Reuniões e chamadas em outro idioma, sem perder o fio.' },
];

function LinkExterno({ href, icone, rotulo }: { href: string; icone: React.ReactNode; rotulo: string }) {
  if (!preenchido(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-canvas hover:border-accent transition-colors text-[12px] font-bold text-ink cursor-pointer"
    >
      <span className="text-accent">{icone}</span> {rotulo}
    </a>
  );
}

export default function OnboardingLeve({ onComplete }: { onComplete: () => void }) {
  const [passo, setPasso] = useState<1 | 2>(1);
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
        {/* Pontinhos de progresso: dois passos, sem mistério. */}
        <div className="flex items-center gap-1.5 mb-5" aria-label={`Passo ${passo} de 2`}>
          <span className={`h-1.5 rounded-full transition-all ${passo === 1 ? 'w-6 bg-accent' : 'w-3 bg-accent/40'}`} />
          <span className={`h-1.5 rounded-full transition-all ${passo === 2 ? 'w-6 bg-accent' : 'w-3 bg-border-subtle'}`} />
        </div>

        {passo === 1 ? (
          <div className="animate-in fade-in duration-300">
            <p className="label-mono mb-2">Babel Play</p>
            <div className="flex items-center gap-4">
              <img
                src={CRIADOR.foto}
                alt={`Foto de ${CRIADOR.nome}`}
                className="w-16 h-16 rounded-full border-2 border-accent-soft object-cover shrink-0"
                loading="lazy"
              />
              <div className="min-w-0">
                <h1 className="font-display font-black text-xl text-ink tracking-tight leading-tight">Oi! Eu sou o {CRIADOR.nome}.</h1>
                <p className="text-[12px] text-ink-muted mt-0.5">{CRIADOR.papel}</p>
              </div>
            </div>
            <p className="mt-4 text-[13.5px] text-ink-muted leading-relaxed">
              Fiz o Babel Play sozinho, como projeto independente e de código aberto: legendas ao
              vivo e tradução do que você assiste, joga e ouve — <b className="text-ink">de graça,
              sem conta, e sem o seu áudio sair do computador</b>.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <LinkExterno href={CRIADOR.github} icone={<Github className="w-3.5 h-3.5" />} rotulo="GitHub" />
              <LinkExterno href={CRIADOR.portfolio} icone={<Globe className="w-3.5 h-3.5" />} rotulo="Portfólio" />
              <LinkExterno href={CRIADOR.linkedin} icone={<Linkedin className="w-3.5 h-3.5" />} rotulo="LinkedIn" />
            </div>
            <p className="mt-4 text-[11.5px] text-ink-faint">
              Depois, em Ajustes → Ajuda e recomeço, tem a tela "Sobre" com contato e como apoiar o projeto.
            </p>
            <button type="button" onClick={() => setPasso(2)} className="btn-ink w-full justify-center mt-6">
              Vamos lá <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
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
        )}
      </div>
    </div>
  );
}
