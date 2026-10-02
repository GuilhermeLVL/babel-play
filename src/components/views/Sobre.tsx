/**
 * SOBRE — quem faz o app, por que ele existe e como falar comigo.
 *
 * A marcação é a do protótipo aprovado (`T.sobre` em `docs/prototipos/consistencia-telas.html`),
 * que o dono trata como o Figma do app: `.cartao.hero` com o avatar no anel em degradê, a história
 * em `.g2` com a citação e a `.lista-check` ao lado, e "Quer ajudar?" em três cartões. O CSS é o
 * dele (`src/styles/prototipo.css`); aqui só se gera a mesma marcação com os dados reais.
 *
 * DADOS REAIS NO LUGAR DOS DE MENTIRA. O protótipo desenha um "G" no avatar e cinco redes que só
 * avisam para onde levariam. Aqui o avatar é a foto do GitHub (`lib/criador`) e as redes são as que
 * o dono preencheu, na ordem do protótipo (Portfólio, GitHub, LinkedIn, Instagram, E-mail);
 * placeholder (`*_AQUI`) some em vez de virar link quebrado — preencher `lib/criador` faz o botão
 * aparecer.
 *
 * POLÍTICA E TERMOS abrem o diálogo do protótipo (`sobre/DialogoLegal`), com o texto dele; "Baixar
 * PDF" abre o documento completo (`/privacidade.html`, `/termos.html`) para imprimir.
 */
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Check,
  Copy,
  CreditCard,
  Github,
  Globe,
  HandHeart,
  Heart,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  Quote,
  Sparkles,
  Star,
} from 'lucide-react';
import { useState } from 'react';

import { CRIADOR, preenchido } from '../../lib/criador';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { t } from '../../lib/i18n';
import { ATRIBUICAO_TATOEBA } from '../../lib/traducao/atribuicaoTatoeba';
import { VERSAO_DO_APP } from '../../lib/versao';
import { CabecalhoDeTela, IconeEmBloco, Tela, TituloDeSecao } from '../ui';
import DialogoLegal, { type Documento } from './sobre/DialogoLegal';
import SobreDoQuest from './sobre/quest/SobreDoQuest';

/** As redes na ordem do protótipo; a primeira preenchida é o botão cheio. */
const REDES: Array<{ href: string; icone: LucideIcon; rotulo: string }> = [
  { href: CRIADOR.portfolio, icone: Globe, rotulo: 'Portfólio' },
  { href: CRIADOR.github, icone: Github, rotulo: 'GitHub' },
  { href: CRIADOR.linkedin, icone: Linkedin, rotulo: 'LinkedIn' },
  { href: CRIADOR.instagram, icone: Instagram, rotulo: 'Instagram' },
  { href: CRIADOR.email, icone: Mail, rotulo: 'E-mail' },
];

/**
 * DADOS ABERTOS — a atribuição que as licenças EXIGEM, dentro do app. O dicionário local (toque em
 * palavra, `lib/dicionarioLocal.ts`), as glosas da trilha e as frases dos jogos são redistribuídos
 * aqui; CC BY-SA e CC BY pedem crédito onde o dado aparece, não só no repositório. A lista dos
 * autores do Tatoeba, longa demais para a tela, fica em `FONTES.md`, que o último item abre.
 */
const DADOS_ABERTOS: Array<{ nome: string; licenca: string; uso: string; href: string }> = [
  {
    nome: 'Wikcionário (Wiktionary)',
    licenca: 'CC BY-SA',
    uso: 'Traduções do dicionário do app e verbetes, via Wiktextract/Kaikki',
    href: 'https://kaikki.org/',
  },
  {
    nome: 'Wikidata Lexemes',
    licenca: 'CC0',
    uso: 'Traduções palavra a palavra e formas das palavras',
    href: 'https://www.wikidata.org/wiki/Wikidata:Lexicographical_data',
  },
  {
    nome: 'Tatoeba',
    licenca: 'CC BY 2.0 FR',
    uso: 'Frases de exemplo e suas traduções',
    href: 'https://tatoeba.org',
  },
  {
    nome: 'FrequencyWords (OpenSubtitles)',
    licenca: 'CC BY-SA 4.0',
    uso: 'Frequência das palavras, que ordena a trilha',
    href: 'https://github.com/hermitdave/FrequencyWords',
  },
];

const hrefDe = (v: string) => (v.includes('@') && !v.startsWith('http') ? `mailto:${v}` : v);

const FATOS = ['Grátis para aprender', 'Código aberto', 'Roda no seu computador', 'Seus dados ficam com você'];

export default function Sobre({ onVerPlanos }: { onVerPlanos?: (view: string) => void } = {}) {
  const questNovo = useQuestNovo();
  const [copiado, setCopiado] = useState(false);
  const [semFoto, setSemFoto] = useState(false);
  const [legal, setLegal] = useState<Documento | null>(null);
  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(CRIADOR.pix);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard bloqueado: a chave está visível para copiar à mão */
    }
  };

  const redes = REDES.filter((r) => preenchido(r.href));
  const ajudas: Array<{ icone: LucideIcon; titulo: string; desc: string; href?: string; aoClicar?: () => void }> = [
    {
      icone: Star,
      titulo: 'Deixe uma estrela no GitHub',
      desc: 'Leva dois segundos e ajuda mais gente a encontrar o projeto.',
      href: `${CRIADOR.github}/babel-play`,
    },
    {
      icone: MessageCircle,
      titulo: 'Me conte o que faltou',
      desc: 'Se algo te atrapalhou ou você sentiu falta de alguma coisa, eu quero saber. Eu leio tudo.',
      href: CRIADOR.comentarios,
    },
    /* Edição estática: não há plano a assinar — o cartão levaria a uma tela sem saída. */
    ...(edicaoEstatica()
      ? []
      : [
          {
            icone: CreditCard,
            titulo: 'Assine um plano',
            desc: 'Se o app te ajuda, é isso que paga o servidor e me deixa continuar.',
            aoClicar: onVerPlanos ? () => onVerPlanos('planos') : undefined,
          },
        ]),
  ];

  /* QUEST: o mesmo conteúdo em quatro abas (`SobreDoQuest`); o diálogo legal é o de sempre. */
  if (questNovo)
    return (
      <>
        <SobreDoQuest
          redes={redes.map((r) => ({ ...r, href: hrefDe(r.href) }))}
          fatos={FATOS}
          ajudas={ajudas.map((a) => ({ ...a, href: a.href && preenchido(a.href) ? a.href : undefined }))}
          dadosAbertos={DADOS_ABERTOS}
          pix={preenchido(CRIADOR.pix) ? CRIADOR.pix : null}
          copiado={copiado}
          aoCopiarPix={() => void copiarPix()}
          semFoto={semFoto}
          aoFalharAFoto={() => setSemFoto(true)}
          aoAbrirLegal={setLegal}
        />
        {legal && <DialogoLegal doc={legal} aoFechar={() => setLegal(null)} />}
      </>
    );

  return (
    <Tela largura="estreita">
      <CabecalhoDeTela
        sobrancelha="Quem faz o app"
        icone={Heart}
        titulo="Sobre o Babel Play"
        sub="Quem está por trás do app, por que ele existe e como falar comigo."
      />

      <section className="cartao hero">
        <div className="avatar" aria-hidden="true">
          {semFoto ? (
            CRIADOR.nome.charAt(0)
          ) : (
            /* A foto ocupa o miolo do anel; se não carregar, fica a inicial, como no protótipo. */
            <img
              src={CRIADOR.foto}
              alt=""
              loading="lazy"
              onError={() => setSemFoto(true)}
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.2 }}>Oi, eu sou o {CRIADOR.nome}.</h2>
          <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.65 }}>
            Sou desenvolvedor independente e faço o Babel Play sozinho, nas noites e nos fins de semana. Se quiser
            conhecer o resto do meu trabalho, ou só trocar uma ideia, é por aqui:
          </p>
          <div className="linha redes" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {redes.map(({ href, icone: Icone, rotulo }, k) => (
              <a
                key={rotulo}
                href={hrefDe(href)}
                target="_blank"
                rel="noreferrer noopener"
                className={`btn ${k === 0 ? 'btn-solid' : 'btn-outline'}`}
              >
                <Icone aria-hidden /> {rotulo}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="secao g2" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
        <div>
          <TituloDeSecao icone={Sparkles} titulo="Por que eu fiz o Babel Play" />
          <div className="pilha" style={{ fontSize: 15, lineHeight: 1.75, maxWidth: '62ch' }}>
            <p>
              Eu aprendi inglês do jeito que muita gente aprende: vendo série, jogando online, assistindo vídeo de gente
              do mundo inteiro. O problema é que eu entendia metade, e as palavras novas sumiam da cabeça no dia
              seguinte.
            </p>
            <p>
              Então fiz a ferramenta que eu queria ter. Você dá play em qualquer coisa e o Babel Play escuta junto:
              mostra a legenda, traduz do lado e guarda as palavras novas para você revisar e jogar depois.
            </p>
            <p>
              E tem uma coisa que eu faço questão: <b>aprender aqui vai continuar sendo de graça.</b>
            </p>
          </div>
        </div>
        <div className="pilha">
          <div className="cartao citacao">
            <Quote aria-hidden style={{ width: 20, height: 20, color: 'var(--accent-ink)' }} />
            <blockquote>“Você não precisa largar o que gosta de assistir para aprender um idioma.”</blockquote>
          </div>
          <div className="cartao p5">
            <ul className="lista-check">
              {FATOS.map((f) => (
                <li key={f}>
                  <Check aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={HandHeart}
          titulo="Quer ajudar?"
          desc="Qualquer uma dessas faz diferença para um projeto feito por uma pessoa só."
        />
        <div className="g3">
          {ajudas.map(({ icone, titulo, desc, href, aoClicar }) => {
            const miolo = (
              <>
                <IconeEmBloco icone={icone} />
                <h3 style={{ fontSize: 15, fontWeight: 800, marginTop: 12 }}>{titulo}</h3>
                <p className="mut" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.55 }}>
                  {desc}
                </p>
              </>
            );
            /* O cartão É o link: o protótipo não desenha botão dentro dele, e um cartão que diz
               "deixe uma estrela" sem levar até lá seria o controle que não faz nada. */
            if (href && preenchido(href))
              return (
                <a key={titulo} className="cartao p5" href={href} target="_blank" rel="noreferrer noopener">
                  {miolo}
                </a>
              );
            if (aoClicar)
              return (
                <a
                  key={titulo}
                  className="cartao p5"
                  href="/planos"
                  onClick={(e) => {
                    e.preventDefault();
                    aoClicar();
                  }}
                >
                  {miolo}
                </a>
              );
            return (
              <div key={titulo} className="cartao p5">
                {miolo}
              </div>
            );
          })}
        </div>
        {/* O Pix não está no protótipo. Fica, discreto, só quando o dono preencher a chave. */}
        {preenchido(CRIADOR.pix) && (
          <div className="linha" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <span className="mut" style={{ fontSize: 13.5 }}>
              Ou um Pix do tamanho de um café:
            </span>
            <code>{CRIADOR.pix}</code>
            <button type="button" className="btn btn-outline peq" onClick={() => void copiarPix()}>
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />} {copiado ? 'Copiado!' : 'Copiar Pix'}
            </button>
          </div>
        )}
        <div className="linha" style={{ gap: 14, marginTop: 18 }}>
          <button type="button" className="link" onClick={() => setLegal('privacidade')}>
            Política de privacidade
          </button>
          <button type="button" className="link" onClick={() => setLegal('termos')}>
            Termos de uso
          </button>
          {/* P0-7b: a versão que está rodando — é o que se cita num relato de problema. */}
          {VERSAO_DO_APP && (
            <span className="mut" style={{ fontSize: 12.5, marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
              {t('Versão {versao}', { versao: VERSAO_DO_APP })}
            </span>
          )}
        </div>
        {/* Créditos que a licença exige (CC BY 2.0 FR): a semente da memória de tradução é do Tatoeba. */}
        <p className="mut" style={{ fontSize: 12.5, marginTop: 10 }}>
          {t(ATRIBUICAO_TATOEBA)}
        </p>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={BookOpen}
          titulo={t('Dados abertos')}
          desc={t('O dicionário e as trilhas do app são feitos com dados livres. Obrigado a quem os escreve.')}
        />
        <ul className="pilha" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          {DADOS_ABERTOS.map((d) => (
            <li key={d.nome}>
              <a className="link" href={d.href} target="_blank" rel="noreferrer noopener">
                {d.nome}
              </a>{' '}
              <span className="mut">
                ({d.licenca}) · {t(d.uso)}
              </span>
            </li>
          ))}
          <li>
            <a
              className="link"
              href={`${CRIADOR.github}/babel-play/blob/main/FONTES.md`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('Lista completa de fontes e autores')}
            </a>
          </li>
        </ul>
      </section>

      {legal && <DialogoLegal doc={legal} aoFechar={() => setLegal(null)} />}
    </Tela>
  );
}
