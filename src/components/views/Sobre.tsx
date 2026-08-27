/**
 * SOBRE, a história do projeto, quem faz, e por que apoiar. (v3, 2026-08-27)
 *
 * A v2 empilhava tudo numa coluna central estreita; o dono achou o resultado "centralizado e
 * amador" para a tela que conta a história. A v3 é EDITORIAL: largura maior (max-w-5xl), herói
 * em duas colunas (identidade à esquerda, manifesto e portas à direita), a história com uma
 * lateral de fatos que acompanha o texto, e cada seção alternando o ritmo (texto largo, grade,
 * duas colunas) em vez de repetir card-atrás-de-card. Os efeitos (blobs, anel) continuam, mas a
 * hierarquia agora vem do layout, não só deles. Dados do autor: `lib/criador.ts` (placeholders
 * `*_AQUI` ficam ocultos).
 */
import { useState } from 'react';
import {
  Github, Globe, Linkedin, Mail, Copy, Check, Heart, MessageSquare, Headphones,
  ShieldCheck, Sparkles, Gamepad2, Star, Code2, Rocket, Quote,
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

const FATOS = [
  'Grátis e sem conta',
  'Código 100% aberto',
  'Roda inteiro no navegador',
  'Seu áudio nunca sai do PC',
  'Feito por uma pessoa só',
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
    <div className="relative max-w-5xl mx-auto px-4 sm:px-8 py-10 space-y-16 animate-in fade-in duration-300">
      {/* ── HERÓI: identidade à esquerda, manifesto à direita ── */}
      <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface px-6 py-10 sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="sobre-blob absolute -top-16 -left-16 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
          <span className="sobre-blob sobre-blob-2 absolute -bottom-20 -right-10 w-72 h-72 rounded-full bg-warn/20 blur-3xl" />
          <span className="sobre-blob sobre-blob-3 absolute top-8 right-1/3 w-40 h-40 rounded-full bg-good/15 blur-3xl" />
        </div>
        <div className="relative grid md:grid-cols-[auto_1fr] gap-8 md:gap-12 items-center">
          <div className="flex md:flex-col items-center md:items-start gap-5 shrink-0">
            <span className="sobre-anel relative inline-flex rounded-full p-1 shrink-0">
              <img
                src={CRIADOR.foto}
                alt={`Foto de ${CRIADOR.nome}`}
                className="w-28 h-28 md:w-36 md:h-36 rounded-full object-cover border-4 border-surface shadow-card"
                loading="lazy"
              />
            </span>
            <div className="md:text-left">
              <p className="font-marca font-bold text-xl md:text-2xl text-ink leading-tight">{CRIADOR.nome}</p>
              <p className="text-[13px] text-ink-muted mt-1">{CRIADOR.papel}</p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="label-mono mb-2">A pessoa por trás do app</p>
            <h1 className="font-marca font-bold text-2xl sm:text-3xl text-ink tracking-tight leading-tight">
              Oi! Eu construo o Babel Play sozinho, nas noites e fins de semana.
            </h1>
            <p className="text-[15px] text-ink-muted leading-relaxed mt-4 max-w-2xl">
              Porque acredito numa ideia simples: <b className="text-ink">a melhor aula de idioma é
              o conteúdo que você já ama assistir</b>. Esta página conta como isso virou um app, e
              como você pode fazer parte.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-6">
              <LinkDoCriador href={CRIADOR.portfolio} icone={<Globe className="w-4 h-4" />} rotulo="Meu portfólio" destaque />
              <LinkDoCriador href={CRIADOR.github} icone={<Github className="w-4 h-4" />} rotulo="GitHub" />
              <LinkDoCriador href={CRIADOR.linkedin} icone={<Linkedin className="w-4 h-4" />} rotulo="LinkedIn" />
              <LinkDoCriador href={CRIADOR.email} icone={<Mail className="w-4 h-4" />} rotulo="E-mail" />
            </div>
          </div>
        </div>
      </section>

      {/* ── A HISTÓRIA: prosa larga + lateral de fatos ── */}
      <section className="grid lg:grid-cols-[1fr_260px] gap-10">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 font-marca font-bold text-xl sm:text-2xl text-ink mb-5">
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
        </div>
        <aside className="lg:pt-14">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="card-panel bg-surface p-5 border-accent/30">
              <Quote className="w-5 h-5 text-accent mb-2" aria-hidden />
              <p className="font-marca font-bold text-[15px] text-ink leading-snug">
                "A melhor aula é o episódio que você já ia assistir mesmo."
              </p>
            </div>
            <ul className="card-panel bg-canvas p-5 space-y-2.5">
              {FATOS.map((f) => (
                <li key={f} className="flex items-center gap-2 text-[13px] font-bold text-ink">
                  <Check className="w-4 h-4 text-good shrink-0" aria-hidden /> {f}
                </li>
              ))}
            </ul>
          </div>
        </aside>
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

      {/* ── QUEM FAZ: texto + cartão de contato lado a lado ── */}
      <section className="grid md:grid-cols-[1fr_300px] gap-10 items-start">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 font-marca font-bold text-xl sm:text-2xl text-ink mb-5">
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
              idiomas ou projetos independentes, as portas estão logo ali ao lado. Eu respondo.
            </p>
          </div>
        </div>
        <div className="card-panel bg-surface p-5 md:mt-14">
          <div className="flex items-center gap-3 mb-4">
            <img src={CRIADOR.foto} alt="" aria-hidden className="w-10 h-10 rounded-full object-cover" loading="lazy" />
            <div>
              <p className="font-bold text-[13.5px] text-ink leading-tight">Fale comigo</p>
              <p className="text-[11.5px] text-ink-muted">resposta de gente, não de bot</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <LinkDoCriador href={CRIADOR.portfolio} icone={<Globe className="w-4 h-4" />} rotulo="Portfólio" />
            <LinkDoCriador href={CRIADOR.github} icone={<Github className="w-4 h-4" />} rotulo="GitHub" />
            <LinkDoCriador href={CRIADOR.linkedin} icone={<Linkedin className="w-4 h-4" />} rotulo="LinkedIn" />
            <LinkDoCriador href={CRIADOR.email} icone={<Mail className="w-4 h-4" />} rotulo="E-mail" />
          </div>
        </div>
      </section>

      {/* ── APOIO ── */}
      <section className="relative overflow-hidden rounded-3xl border border-accent/40 bg-surface p-6 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="sobre-blob absolute -top-10 right-0 w-52 h-52 rounded-full bg-accent/15 blur-3xl" />
          <span className="sobre-blob sobre-blob-2 absolute -bottom-16 left-10 w-56 h-56 rounded-full bg-warn/15 blur-3xl" />
        </div>
        <div className="relative grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="flex items-center gap-2.5 font-marca font-bold text-xl sm:text-2xl text-ink">
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
          </div>
          <div className="space-y-3">
            {preenchido(CRIADOR.pix) && (
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate px-4 py-3 rounded-xl bg-canvas border border-border-subtle text-[13px] text-ink">{CRIADOR.pix}</code>
                <button
                  onClick={copiarPix}
                  className="shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-xl bg-accent hover:bg-accent-ink text-white text-[13px] font-bold shadow-btn cursor-pointer"
                >
                  {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado!' : 'Copiar Pix'}
                </button>
              </div>
            )}
            <div className="grid sm:grid-cols-1 gap-2">
              <LinkDoCriador href={CRIADOR.comentarios} icone={<MessageSquare className="w-4 h-4" />} rotulo="Deixar um comentário" />
              <LinkDoCriador href={CRIADOR.issues} icone={<Github className="w-4 h-4" />} rotulo="Reportar um problema" />
              <LinkDoCriador href={CRIADOR.github + '/babel-play'} icone={<Star className="w-4 h-4" />} rotulo="Dar uma estrela no GitHub" />
            </div>
          </div>
        </div>
      </section>

      <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-faint pb-6">
        <Rocket className="w-3.5 h-3.5" aria-hidden /> Babel Play · feito com teimosia por um dev independente 🇧🇷
      </p>
    </div>
  );
}
