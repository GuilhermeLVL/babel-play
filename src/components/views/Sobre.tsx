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
import {
Check, Code2, Copy, Gamepad2,   Github, Globe, Headphones,
Heart, Linkedin, Mail, MessageSquare, Quote,
Rocket,   ShieldCheck, Sparkles, Star, } from 'lucide-react';
import { useState } from 'react';

import { PRECO_DO_PASSE_CENTAVOS } from '../../core/creditos';
import { menorPrecoDeAssinatura } from '../../core/planos';
import { CRIADOR, preenchido } from '../../lib/criador';
import { precoEmReais } from '../../lib/i18n';
import { planoAnunciavel } from '../CardDePlanos';

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
          /* `text-white` aqui é enganoso e sobrevive só porque `index.css:1133-1140` o anula com
             `!important`. Este é o link que o axe de fato encontrou em `/sobre` (o do Pix, abaixo,
             nem renderiza com a chave em placeholder). Trocado pelo token real: o mesmo valor que
             a rede de segurança já aplicava, agora dito onde se lê. */
          ? 'bg-accent text-accent-contrast border-accent shadow-btn hover:brightness-110'
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
    titulo: 'Privado por padrão',
    texto: 'No plano grátis, transcrição e tradução rodam no seu computador: sem conta, sem envio de áudio, sem rastreio. Quem escolhe a qualidade de nuvem sabe o que está mandando, e por quê. É verificável: o código é aberto.',
  },
];

/* PROMESSA CORRIGIDA (31/08). Esta lista dizia "Grátis e sem conta", "Roda inteiro no navegador" e
   "Seu áudio nunca sai do PC" — verdades do plano grátis apresentadas como verdades do app. Com o
   Essencial mandando a tradução e o Pro mandando o áudio para o servidor, virou promessa que o
   próprio produto desmente. A régua nova: dizer o que é grátis PARA SEMPRE, e não fingir que não
   existe o que é pago. */
const FATOS = [
  'Aprender é grátis, sem conta',
  'Código 100% aberto',
  'O grátis roda no seu navegador',
  'Seu áudio só sai se você pedir',
  'Feito por uma pessoa só',
];

export default function Sobre({ onVerPlanos }: { onVerPlanos?: (view: string) => void } = {}) {
  const [copiado, setCopiado] = useState(false);
  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(CRIADOR.pix);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* clipboard bloqueado: o texto está visível para copiar à mão */ }
  };

  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto custom-scrollbar" aria-label="Sobre">
    <div className="relative max-w-5xl mx-auto px-4 sm:px-8 py-10 space-y-16 animate-in fade-in duration-300">
      {/* ── HERÓI: identidade à esquerda, manifesto à direita ── */}
      <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface px-6 py-10 sm:px-10 sm:py-12">
        {/* DECORAÇÃO SÓ ONDE ELA CABE. Os blobs são `aria-hidden`, mas cor por baixo de texto não é
            invisível para quem lê: em 375px não há margem lateral sobrando, e o blob de
            `-left-16 w-64` cobre de −64px a 192px — exatamente onde ficam o kicker (x=47), o
            nome e o papel. O texto é `--ink-muted`, que passa AA sobre `--surface` limpo e cai
            abaixo de 4,5:1 sobre `surface + accent/20`. O axe pegou os três em `mobile-375`.
            No desktop os blobs ficam nas bordas, longe do texto, e continuam valendo. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
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
            <div className="md:text-start">
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
            {/* Este parágrafo acusava "ferramentas que pediam assinatura e mandavam seu áudio para
                um servidor" — que é a descrição do plano Pro do próprio app. A queixa real nunca foi
                a cobrança: era ter de pagar ANTES de saber se serve, e não funcionar com o conteúdo
                que a pessoa já assiste. É isso que o texto diz agora. */}
            <p>
              Tudo começou com uma frustração minha: eu passava horas assistindo a vídeos, lives e
              jogando com gente do mundo inteiro, e <b className="text-ink">entendia metade</b>. As
              ferramentas que existiam cobravam antes de eu saber se serviam, exigiam conta para
              qualquer coisa, ou simplesmente não funcionavam com o que EU queria assistir.
            </p>
            <p>
              Então resolvi construir a ferramenta que eu queria usar: aperta o play em qualquer
              coisa, e o Babel Play escuta junto com você. A fala vira legenda na hora, a tradução
              aparece do lado, e cada palavra nova que passa pela sua tela pode virar
              <b className="text-ink"> material de estudo seu</b>, para revisar e jogar depois.
            </p>
            <p>
              E uma decisão que eu não abro mão: <b className="text-ink">aprender aqui é grátis, e
              vai continuar</b>. Gravar, traduzir, jogar e revisar funcionam sem conta e sem pagar
              nada — os modelos são baixados uma vez e trabalham no seu computador, então o seu
              áudio não sai da sua máquina. Não é promessa de marketing: o código é aberto e
              qualquer pessoa pode conferir.
            </p>
            <p>
              O que custa dinheiro é o que custa dinheiro para mim. Se você quiser a{' '}
              <b className="text-ink">tradução da nuvem</b>, que é bem melhor que a local, ela roda
              num servidor que eu pago — e aí sim o que você manda para lá sai do seu computador,
              com a sua permissão e sabendo o motivo. E tem o <b className="text-ink">enfeite</b>:
              temas, efeitos, o Passe de Temporada. Nada disso ensina nada. É só bonito, e é o que
              ajuda a manter o resto de pé.
            </p>
            {/* O PREÇO E O CAMINHO (mudança vender-onde-se-ve). O parágrafo acima citava o Passe
                e os planos como coisas à venda, sem dizer quanto custam e sem levar a lugar
                nenhum — anunciar sem preço e sem porta é a versão educada de não anunciar. */}
            {planoAnunciavel() && onVerPlanos && (
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <button onClick={() => onVerPlanos('planos')} className="btn-outline !py-2 !text-[12.5px]">
                  Planos a partir de R$ {menorPrecoDeAssinatura()}/mês
                </button>
                <button onClick={() => onVerPlanos('loja')} className="btn-outline !py-2 !text-[12.5px]">
                  Passe de Temporada · {precoEmReais(PRECO_DO_PASSE_CENTAVOS)}
                </button>
              </p>
            )}
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
        {/* DECORAÇÃO SÓ ONDE ELA CABE. Os blobs são `aria-hidden`, mas cor por baixo de texto não é
            invisível para quem lê: em 375px não há margem lateral sobrando, e o blob de
            `-left-16 w-64` cobre de −64px a 192px — exatamente onde ficam o kicker (x=47), o
            nome e o papel. O texto é `--ink-muted`, que passa AA sobre `--surface` limpo e cai
            abaixo de 4,5:1 sobre `surface + accent/20`. O axe pegou os três em `mobile-375`.
            No desktop os blobs ficam nas bordas, longe do texto, e continuam valendo. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
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
                O Babel Play não tem empresa, investidor nem publicidade de terceiros. O que ele tem é uma
                pessoa pagando domínio e servidor do próprio bolso e investindo as horas livres para
                cada versão ficar melhor que a anterior — e, agora, uns planos e enfeites à venda
                para essa conta fechar.
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
                  /* Era `bg-accent hover:bg-accent-ink text-white`, escrito à mão.
                     REGISTRO HONESTO DO QUE ISTO CONSERTA E DO QUE NÃO: o `text-white` NÃO estava
                     pintando branco — `index.css:1133-1140` tem uma rede de segurança global
                     (`a.bg-accent { color: var(--accent-contrast) !important }`) posta porque o
                     projeto já cometeu esse erro duas vezes. Então não havia 3,61:1 na tela, e este
                     botão sequer renderiza enquanto `CRIADOR.pix` for o placeholder `PIX_AQUI`
                     (`lib/criador.ts:28`).
                     O que muda é a fragilidade: escrever a classe errada e depender de um
                     `!important` a 850 linhas de distância para desfazê-la é uma armadilha para
                     quem copiar este trecho. `btn-solid` resolve na origem e acompanha o tema. */
                  className="shrink-0 btn-solid px-5 py-3 text-[13px]"
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

      <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-faint">
        <Rocket className="w-3.5 h-3.5" aria-hidden /> Babel Play · feito com teimosia por um dev independente 🇧🇷
      </p>
      {/* E5 — os documentos legais existem e precisam ser ENCONTRÁVEIS, não só existir. */}
      <p className="flex items-center justify-center gap-3 text-[12px] text-ink-faint pb-6">
        <a href="/privacidade.html" className="underline hover:text-ink">Política de privacidade</a>
        <span aria-hidden>·</span>
        <a href="/termos.html" className="underline hover:text-ink">Termos de uso</a>
      </p>
    </div>
    </div>
  );
}
