/**
 * SOBRE — a história do projeto, quem faz, e por que apoiar. (v2, 2026-08-27)
 *
 * A primeira versão era uma ficha; o dono pediu uma tela que CONTE a história e convença: o
 * problema que motivou o app, a solução, quem está por trás, e um pedido de apoio com motivo.
 * O visual acompanha: herói com blobs de cor desfocados flutuando, anel de brilho no avatar,
 * cards que levantam no hover. Tudo com tokens do tema (funciona no claro e no escuro) e tudo
 * desligável pelas guardas globais de animação. Nenhum número inventado: onde não há métrica,
 * há história.
 *
 * Os dados do autor vêm de `lib/criador.ts`; campos placeholder (`*_AQUI`) ficam ocultos.
 */
import { useState } from 'react';
import {
  Github, Globe, Linkedin, Mail, Copy, Check, Heart, MessageSquare, Headphones,
  ShieldCheck, Sparkles, Gamepad2, Star, Code2, Rocket,
} from 'lucide-react';
import { CRIADOR, preenchido } from '../../lib/criador';

function LinkDoCriador({ href, icone, rotulo, destaque = false }: {
  href: string; icone: React.ReactNode; rotulo: string; destaque?: boolean;
}) {
  if (!preenchido(href)) return null;
  return (
    <a
      href={href.includes('@') && !href.startsWith('http') ? `mailto:${href}` : href}
      target="_blank"
      rel="noreferrer noopener"
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-bold transition-all hover:-translate-y-0.5 cursor-pointer ${
        destaque
          ? 'bg-accent text-white border-accent shadow-btn hover:brightness-110'
          : 'bg-surface text-ink border-border-subtle hover:border-accent'
      }`}
    >
      <span className={destaque ? '' : 'text-accent'}>{icone}</span> {rotulo}
    </a>
  );
}

const PILARES = [
  {
    icone: <Headphones className="w-5 h-5" />,
    titulo: 'Ouça qualquer coisa',
    texto: 'Vídeo, aula, jogo, chamada: o som do que você já assiste vira legenda ao vivo, com tradução do lado.',
  },
  {
    icone: <Gamepad2 className="w-5 h-5" />,
    titulo: 'Aprenda jogando',
    texto: 'As palavras que você ouviu viram o SEU baralho: revisão espaçada e minijogos com o seu próprio conteúdo, não listas prontas.',
  },
  {
    icone: <ShieldCheck className="w-5 h-5" />,
    titulo: 'Privado de verdade',
    texto: 'Transcrição e tradução rodam no seu computador. Sem conta, sem envio de áudio, sem rastreio. É verificável: o código é aberto.',
  },
];

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
    <div className="relative max-w-3xl mx-auto px-4 py-8 space-y-14 animate-in fade-in duration-300">
      {/* ── HERÓI ── */}
      <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface px-6 py-12 sm:py-14 text-center">
        {/* Blobs de cor desfocados, flutuando devagar atrás do conteúdo. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="sobre-blob absolute -top-16 -left-16 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
          <span className="sobre-blob sobre-blob-2 absolute -bottom-20 -right-10 w-72 h-72 rounded-full bg-warn/20 blur-3xl" />
          <span className="sobre-blob sobre-blob-3 absolute top-8 right-1/4 w-40 h-40 rounded-full bg-good/15 blur-3xl" />
        </div>
        <div className="relative">
          <span className="sobre-anel relative inline-flex rounded-full p-1">
            <img
              src={CRIADOR.foto}
              alt={`Foto de ${CRIADOR.nome}`}
              className="w-28 h-28 rounded-full object-cover border-4 border-surface shadow-card"
              loading="lazy"
            />
          </span>
          <h1 className="font-marca font-extrabold text-3xl sm:text-4xl text-ink mt-5 tracking-tight">
            Oi, eu sou o {CRIADOR.nome}.
          </h1>
          <p className="text-[14px] text-ink-muted mt-1">{CRIADOR.papel}</p>
          <p className="text-[15px] text-ink-muted leading-relaxed max-w-xl mx-auto mt-5">
            Eu construo o Babel Play sozinho, nas noites e fins de semana, porque acredito numa
            ideia simples: <b className="text-ink">a melhor aula de idioma é o conteúdo que você
            já ama assistir</b>. Esta tela conta essa história.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            <LinkDoCriador href={CRIADOR.portfolio} icone={<Globe className="w-4 h-4" />} rotulo="Meu portfólio" destaque />
            <LinkDoCriador href={CRIADOR.github} icone={<Github className="w-4 h-4" />} rotulo="GitHub" />
            <LinkDoCriador href={CRIADOR.linkedin} icone={<Linkedin className="w-4 h-4" />} rotulo="LinkedIn" />
            <LinkDoCriador href={CRIADOR.email} icone={<Mail className="w-4 h-4" />} rotulo="E-mail" />
          </div>
        </div>
      </section>

      {/* ── A HISTÓRIA ── */}
      <section className="space-y-5">
        <h2 className="flex items-center gap-2.5 font-marca font-extrabold text-2xl text-ink">
          <Sparkles className="w-6 h-6 text-accent" /> Por que isso existe
        </h2>
        <div className="space-y-4 text-[15px] text-ink-muted leading-relaxed">
          <p>
            Tudo começou com uma frustração minha: eu passava horas assistindo a vídeos, lives e
            jogando com gente do mundo inteiro, e <b className="text-ink">entendia metade</b>. As
            ferramentas que existiam pediam assinatura, pediam conta, mandavam meu áudio para um
            servidor de alguém, ou simplesmente não funcionavam com o que EU queria assistir.
          </p>
          <p>
            Então resolvi construir a ferramenta que eu queria usar: aperta o play em qualquer
            coisa, e o Babel Play escuta junto com você. A fala vira legenda na hora, a tradução
            aparece do lado, e cada palavra nova que passa pela sua tela pode virar
            <b className="text-ink"> material de estudo seu</b>, para revisar e jogar depois.
          </p>
          <p>
            E uma decisão que eu não abro mão: <b className="text-ink">tudo roda no seu
            navegador</b>. Os modelos de transcrição e tradução são baixados uma vez e trabalham
            no seu computador. Por isso o app é grátis, funciona sem conta, e o seu áudio nunca
            sai da sua máquina. Não é promessa de marketing: o código é aberto e qualquer pessoa
            pode conferir.
          </p>
        </div>
      </section>

      {/* ── OS TRÊS PILARES ── */}
      <section>
        <div className="grid sm:grid-cols-3 gap-4">
          {PILARES.map((p) => (
            <div
              key={p.titulo}
              className="card-panel bg-surface p-5 transition-all hover:-translate-y-1 hover:border-accent hover:shadow-card"
            >
              <span className="w-11 h-11 rounded-2xl bg-accent-soft text-accent-ink flex items-center justify-center">{p.icone}</span>
              <h3 className="font-bold text-[15px] text-ink mt-3">{p.titulo}</h3>
              <p className="text-[13px] text-ink-muted leading-relaxed mt-1.5">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── QUEM FAZ ── */}
      <section className="space-y-5">
        <h2 className="flex items-center gap-2.5 font-marca font-extrabold text-2xl text-ink">
          <Code2 className="w-6 h-6 text-accent" /> Quem está por trás
        </h2>
        <div className="space-y-4 text-[15px] text-ink-muted leading-relaxed">
          <p>
            Sou o {CRIADOR.nome}, desenvolvedor brasileiro, apaixonado por inteligência artificial
            e por transformar tecnologia difícil em coisa que qualquer pessoa consegue usar. O
            Babel Play é o meu projeto mais pessoal: pesquisa, código, design, testes e até esta
            página, tudo feito por uma pessoa só, aprendendo em público e publicando cada passo
            no GitHub.
          </p>
          <p>
            Se você quiser ver o que mais eu construo, ou trocar uma ideia sobre tecnologia,
            idiomas ou projetos independentes, as portas estão no topo desta página. Eu respondo.
          </p>
        </div>
      </section>

      {/* ── APOIO ── */}
      <section className="relative overflow-hidden rounded-3xl border border-accent/40 bg-surface p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="sobre-blob absolute -top-10 right-0 w-52 h-52 rounded-full bg-accent/15 blur-3xl" />
        </div>
        <div className="relative">
          <h2 className="flex items-center gap-2.5 font-marca font-extrabold text-2xl text-ink">
            <Heart className="w-6 h-6 text-error" /> Ajude este projeto a continuar
          </h2>
          <div className="space-y-4 text-[15px] text-ink-muted leading-relaxed mt-4">
            <p>
              O Babel Play não tem empresa, investidor nem anúncio. O que ele tem é uma pessoa
              pagando domínio e ferramentas do próprio bolso e investindo as horas livres para
              cada versão ficar melhor que a anterior.
            </p>
            <p>
              Se ele te ajudou a entender um vídeo, a ganhar uma partida, ou a aprender uma
              palavra nova, <b className="text-ink">qualquer gesto mantém o projeto vivo</b>: um
              Pix do tamanho de um café, uma estrela no GitHub, um comentário contando como você
              usa, ou simplesmente mostrar o app para alguém.
            </p>
          </div>
          {preenchido(CRIADOR.pix) && (
            <div className="flex items-center gap-2 mt-5">
              <code className="flex-1 min-w-0 truncate px-4 py-3 rounded-xl bg-canvas border border-border-subtle text-[13px] text-ink">{CRIADOR.pix}</code>
              <button
                onClick={copiarPix}
                className="shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-xl bg-accent hover:bg-accent-ink text-white text-[13px] font-bold shadow-btn cursor-pointer"
              >
                {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado!' : 'Copiar Pix'}
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <LinkDoCriador href={CRIADOR.comentarios} icone={<MessageSquare className="w-4 h-4" />} rotulo="Deixar um comentário" />
            <LinkDoCriador href={CRIADOR.issues} icone={<Github className="w-4 h-4" />} rotulo="Reportar um problema" />
            <LinkDoCriador href={CRIADOR.github + '/babel-play'} icone={<Star className="w-4 h-4" />} rotulo="Dar uma estrela" />
          </div>
        </div>
      </section>

      <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-faint pb-4">
        <Rocket className="w-3.5 h-3.5" aria-hidden /> Babel Play · feito com teimosia por um dev independente 🇧🇷
      </p>
    </div>
  );
}
