/**
 * SOBRE — quem fez, por que existe, e como apoiar.
 *
 * A tela existe para o app ter um rosto: projeto de UM desenvolvedor independente, código aberto,
 * rodando no navegador de quem usa. Três blocos: o autor (foto + links), o projeto (o que é, de
 * graça, privacidade), e o apoio (Pix com copiar + canais de comentário). Os dados vêm todos de
 * `lib/criador.ts` — esta tela não conhece nenhum link diretamente.
 */
import { useState } from 'react';
import { Github, Globe, Linkedin, Mail, Copy, Check, Heart, MessageSquare, Sparkles } from 'lucide-react';
import { CRIADOR, preenchido } from '../../lib/criador';

function LinkDoCriador({ href, icone, rotulo }: { href: string; icone: React.ReactNode; rotulo: string }) {
  if (!preenchido(href)) return null;
  return (
    <a
      href={href.includes('@') && !href.startsWith('http') ? `mailto:${href}` : href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border-subtle bg-surface hover:border-accent hover:-translate-y-0.5 transition-all text-[13px] font-bold text-ink cursor-pointer"
    >
      <span className="text-accent">{icone}</span> {rotulo}
    </a>
  );
}

export default function Sobre() {
  const [copiado, setCopiado] = useState(false);
  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(CRIADOR.pix);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* clipboard bloqueado: o texto está visível para copiar à mão */ }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-300">
      {/* O autor */}
      <section className="card-panel bg-surface p-6 sm:p-8 text-center">
        <img
          src={CRIADOR.foto}
          alt={`Foto de ${CRIADOR.nome}`}
          className="w-24 h-24 rounded-full mx-auto border-4 border-accent-soft shadow-card object-cover"
          loading="lazy"
        />
        <h1 className="font-display font-black text-2xl text-ink mt-4">Feito por {CRIADOR.nome}</h1>
        <p className="text-[13px] text-ink-muted mt-1">{CRIADOR.papel}</p>
        <p className="text-[13.5px] text-ink-muted leading-relaxed max-w-md mx-auto mt-4">
          O Babel Play nasceu de uma pessoa só: eu queria assistir a vídeos e jogar em outro idioma
          entendendo tudo — e aprender no caminho. Não há empresa por trás: é um projeto
          independente, de código aberto, que roda inteiro no seu navegador.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          <LinkDoCriador href={CRIADOR.portfolio} icone={<Globe className="w-4 h-4" />} rotulo="Portfólio" />
          <LinkDoCriador href={CRIADOR.github} icone={<Github className="w-4 h-4" />} rotulo="GitHub" />
          <LinkDoCriador href={CRIADOR.linkedin} icone={<Linkedin className="w-4 h-4" />} rotulo="LinkedIn" />
          <LinkDoCriador href={CRIADOR.email} icone={<Mail className="w-4 h-4" />} rotulo="E-mail" />
        </div>
      </section>

      {/* O projeto */}
      <section className="card-panel bg-surface p-6">
        <h2 className="flex items-center gap-2 font-display font-bold text-lg text-ink mb-3">
          <Sparkles className="w-5 h-5 text-accent" /> O projeto
        </h2>
        <ul className="space-y-2 text-[13.5px] text-ink-muted leading-relaxed">
          <li>· <b className="text-ink">Grátis e sem conta</b> — abriu, funcionou. Suas sessões e palavras ficam no seu navegador.</li>
          <li>· <b className="text-ink">Privado por construção</b> — transcrição e tradução rodam no seu computador; o áudio não sai dele.</li>
          <li>· <b className="text-ink">Código aberto</b> — qualquer pessoa pode ler, auditar e contribuir no GitHub.</li>
        </ul>
      </section>

      {/* Apoio */}
      <section className="card-panel bg-surface p-6">
        <h2 className="flex items-center gap-2 font-display font-bold text-lg text-ink mb-3">
          <Heart className="w-5 h-5 text-error" /> Apoie o projeto
        </h2>
        <p className="text-[13.5px] text-ink-muted leading-relaxed mb-4">
          Manter e evoluir o Babel Play toma noites e fins de semana. Se ele te ajuda, qualquer
          apoio — um Pix, uma estrela no GitHub, um comentário — faz diferença de verdade.
        </p>
        {preenchido(CRIADOR.pix) && (
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 min-w-0 truncate px-3.5 py-2.5 rounded-xl bg-canvas border border-border-subtle text-[13px] text-ink">{CRIADOR.pix}</code>
            <button
              onClick={copiarPix}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-ink text-white text-[13px] font-bold shadow-btn cursor-pointer"
            >
              {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado!' : 'Copiar Pix'}
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <LinkDoCriador href={CRIADOR.comentarios} icone={<MessageSquare className="w-4 h-4" />} rotulo="Deixar um comentário" />
          <LinkDoCriador href={CRIADOR.issues} icone={<Github className="w-4 h-4" />} rotulo="Reportar um problema" />
        </div>
      </section>

      <p className="text-center text-[11px] text-ink-faint">Babel Play · feito com teimosia por um dev independente 🇧🇷</p>
    </div>
  );
}
