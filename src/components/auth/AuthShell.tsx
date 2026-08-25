/**
 * Casca das telas de autenticação (front-door "split"): painel-marca à esquerda + o conteúdo
 * (formulário) à direita. No mobile o painel-marca some e sobra só o form. Usa os tokens do design
 * system (`bg-ink`/`text-canvas` para o painel escuro, `accent` para o brilho de assinatura).
 */
import React from 'react'

export interface AuthHero { title?: React.ReactNode; subtitle?: string }

export default function AuthShell({ children, hero }: { children: React.ReactNode; hero?: AuthHero }) {
  return (
    <div className="flex min-h-screen w-full bg-canvas">
      {/* Painel-marca — a "assinatura" da porta de entrada. Escondido no mobile. */}
      <aside className="auth-hero relative hidden w-1/2 flex-col justify-between overflow-hidden bg-ink p-12 md:flex">
        <div className="font-display text-2xl font-black tracking-tight text-canvas">Babel Play</div>
        <div className="relative z-10">
          <h2 className="font-display text-4xl font-extrabold leading-[1.1] text-canvas">
            {hero?.title ?? (<>Capture.<br />Traduza.<br />Aprenda.</>)}
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-canvas/70">
            {hero?.subtitle ?? 'Vídeos, reuniões, podcasts: cada conversa vira prática de idioma, no seu ritmo.'}
          </p>
        </div>
        <div className="relative z-10 text-xs text-canvas/50">Sua conta, seus dados — isolados e seguros.</div>
        {/* Brilho accent (assinatura sutil) */}
        <div className="pointer-events-none absolute -right-32 -top-24 h-80 w-80 rounded-full bg-accent/40 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-rare/30 blur-3xl" aria-hidden="true" />
      </aside>

      {/* Formulário */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Marca no mobile (painel some) */}
          <div className="mb-8 font-display text-xl font-black text-ink md:hidden">Babel Play</div>
          {children}
        </div>
      </main>
    </div>
  )
}
