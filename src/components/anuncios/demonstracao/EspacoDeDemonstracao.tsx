/* O CSS dos espaços (cópia do protótipo) e a base das folhas de baixo (`dialog.folha-de-baixo`), que mora
   com a captura do celular. Só carregam com este arquivo, isto é, só na demonstração. */
import '../../../styles/capturaNoCelular.css';
import '../../../styles/espacosDeAnuncio.css';

import { ArrowRight, BookmarkPlus, BookOpen, Check, GraduationCap, Play, Sprout } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import type { EspacoDeAnuncio } from '../../../core/anuncios/politicaDeAnuncio';
import type { PropsDoEspacoDeAnuncio } from '../../../lib/anuncios/provedor';
import { toast } from '../../Toast';
import FluxoDoPremiado from './FluxoDoPremiado';
import { LIMITE_DE_PREMIADOS, type MarcaDeExemplo, type PremioDeExemplo } from './tipos';

/**
 * O PROVEDOR DE DEMONSTRAÇÃO — desenha os espaços de anúncio como o protótipo aprovado os desenha
 * (`docs/prototipos/anuncios-no-gratis-src/anuncios.js`), para o dono VER os lugares.
 *
 * TUDO AQUI É DE MENTIRA: as marcas são as inventadas do protótipo, todo cartão diz "Patrocinado ·
 * exemplo", nada é carregado da rede, não há script de terceiro e a recompensa do premiado é SIMULADA
 * (nada é creditado no servidor). Só existe em desenvolvimento (`ligar.ts`).
 *
 * A marcação e as classes são as do protótipo, espaço por espaço; os números ao lado são as linhas de
 * `anuncios.js`. Os textos ficam em português, sem catálogo: é bancada, não produto.
 *
 * Espaço que não está encaixado no app não tem desenho aqui (devolve nada).
 */

/* `MARCAS` (`anuncios.js:57-64`), só as dos espaços encaixados. Nenhuma existe. */
const ESCOLA: MarcaDeExemplo = {
  nome: 'Tucano-Lilás Idiomas',
  icone: GraduationCap,
  cor: '#5b6ee1',
  titulo: 'Aulas ao vivo de conversação',
  texto: 'Turmas pequenas com professor nativo. A primeira aula é grátis.',
  acao: 'Conhecer',
};
const CURSO: MarcaDeExemplo = {
  nome: 'Curso Vírgula & Meia',
  icone: BookOpen,
  cor: '#3f9b56',
  titulo: 'Inglês para reuniões em 6 semanas',
  texto: 'Vocabulário de trabalho, do e-mail à apresentação.',
  acao: 'Ver o curso',
};
const CADERNO: MarcaDeExemplo = {
  nome: 'Caderneta Zênite',
  icone: BookmarkPlus,
  cor: '#2f8f8a',
  titulo: 'Flashcards impressos das suas palavras',
  texto: 'Envie a lista e receba o baralho em casa.',
  acao: 'Conhecer',
};

/* `PREMIOS` (`anuncios.js:413-419`), os dois de Seeds. */
const PREMIO_DO_FIM: PremioDeExemplo = { frase: 'ganhar +10 Seeds', premio: '+10 Seeds', marca: ESCOLA };
const PREMIO_DA_LOJA: PremioDeExemplo = { frase: 'ganhar +15 Seeds', premio: '+15 Seeds', marca: CURSO };

/** Os premiados vistos nesta carga da página (a nota "Hoje: N de 5"). Só enfeite: nada é contado de verdade. */
let vistos = 0;

const marca = (espaco: EspacoDeAnuncio, curto: string) => ({ 'data-ad': espaco, 'data-ad-n': curto });
const cor = (m: MarcaDeExemplo) => ({ ['--mm' as string]: m.cor });

/** `rotulo()` (`anuncios.js:86`). */
function Rotulo({ texto = 'Patrocinado' }: { texto?: string }) {
  return (
    <span className="ad-rotulo">
      {texto}
      <i> · exemplo</i>
    </span>
  );
}

/** `semAds()` (`anuncios.js:87`): a porta para os planos, ao lado de todo anúncio. */
function SemAnuncios({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  return (
    <button type="button" className="ad-sem" onClick={aoSemAnuncios}>
      Sem anúncios no Essencial
    </button>
  );
}

/** O botão do anunciante. No protótipo ele só avisa (`avisoDoCta`, `anuncios.js:516`); aqui também. */
function Cta({ m, children, className = 'ad-cta' }: { m: MarcaDeExemplo; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      data-ad-cta={m.nome}
      onClick={() => toast.info(`Anúncio de exemplo. No app, abriria a página de ${m.nome} em outra aba.`)}
    >
      {children}
    </button>
  );
}

/** Início: o cartão nativo (`PLANTIO.inicio`, `anuncios.js:109-131`). */
function CartaoNoInicio({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const m = ESCOLA;
  const Icone = m.icone;
  /* O protótipo põe o cartão como o último de uma grade de três, numa seção "Para continuar" que o app
     não tem. Aqui ele ocupa a mesma coluna de uma grade de três, sem a seção e sem os outros cartões. */
  return (
    <div className="ad-continuar">
      <div className="q-grade g3">
        <article className="q-tile ad ad-nativo" {...marca('inicio-nativo', 'In-feed nativo')}>
          <span className="ad-topo">
            <span className="q-ic" style={cor(m)}>
              <Icone aria-hidden />
            </span>
            <Rotulo />
          </span>
          <b>{m.titulo}</b>
          <span className="q-d">{m.texto}</span>
          <span className="ad-pe">
            <Cta m={m}>
              {m.acao} <ArrowRight aria-hidden />
            </Cta>
            <span className="ad-marca">{m.nome}</span>
          </span>
          <SemAnuncios aoSemAnuncios={aoSemAnuncios} />
        </article>
      </div>
    </div>
  );
}

/** Biblioteca: a linha patrocinada (`PLANTIO.biblioteca`, `anuncios.js:132-146`). */
function LinhaNaBiblioteca({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const m = CURSO;
  const Icone = m.icone;
  return (
    <div className="q-linha ad ad-infeed" {...marca('bib-infeed', 'In-feed nativo')}>
      <span className="q-ic" style={cor(m)}>
        <Icone aria-hidden />
      </span>
      <span className="ad-infeed-texto">
        <b>{m.titulo}</b>
        <small>
          <Rotulo />
          <span className="ad-marca-linha"> · {m.nome}</span>
        </small>
      </span>
      <span className="ad-infeed-fim">
        <Cta m={m}>{m.acao}</Cta>
        <SemAnuncios aoSemAnuncios={aoSemAnuncios} />
      </span>
    </div>
  );
}

/**
 * Jogar: a faixa no alto, no lugar que era da "Sugestão para hoje" (`fxFaixaDeAnuncio()`,
 * `cartoes-enxuto-src/fontes.js:158-164`). A altura é reservada pelo CSS (`.fx-anuncio`, `seletor.css:99`).
 */
function FaixaNoJogar({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const m = CURSO;
  const Icone = m.icone;
  return (
    <div
      className="q-linha ad ad-infeed fx-anuncio"
      data-fx-alvo="anuncio"
      {...marca('jogar-faixa', 'Faixa no Jogar')}
      role="complementary"
      aria-label="Anúncio"
    >
      <span className="q-ic" style={cor(m)}>
        <Icone aria-hidden />
      </span>
      <span className="ad-infeed-texto">
        <b>{m.titulo}</b>
        <small>
          <Rotulo texto="Anúncio" />
          <span className="ad-marca-linha"> · {m.nome}</span>
        </small>
      </span>
      <span className="ad-infeed-fim">
        <button
          type="button"
          className="ad-cta"
          data-ad-cta={m.nome}
          aria-label={`${m.acao}: ${m.nome}`}
          onClick={() => toast.info(`Anúncio de exemplo. No app, abriria a página de ${m.nome} em outra aba.`)}
        >
          <span className="fx-cta-longo">{m.acao}</span>
          <span className="fx-cta-curto">Ver</span>
        </button>
        <SemAnuncios aoSemAnuncios={aoSemAnuncios} />
      </span>
    </div>
  );
}

/** Fim de rodada: o bloco discreto ABAIXO dos botões (`plantarFim`, `anuncios.js:249-257`). */
function BlocoNoFim({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const m = CADERNO;
  const Icone = m.icone;
  return (
    <aside className="ad-fim-bloco" {...marca('fim-bloco', 'Display nativo')} aria-label="Patrocinado">
      <div className="ad-fim-bloco-topo">
        <Rotulo />
        <SemAnuncios aoSemAnuncios={aoSemAnuncios} />
      </div>
      <div className="ad-fim-bloco-corpo">
        <span className="ad-arte" style={cor(m)} aria-hidden="true">
          <Icone />
        </span>
        <div>
          <b>{m.titulo}</b>
          <span className="ad-sub">
            {m.texto} · {m.nome}
          </span>
        </div>
        <Cta m={m} className="btn btn-outline peq">
          {m.acao}
        </Cta>
      </div>
    </aside>
  );
}

/** O que o premiado devolve a quem o ofereceu. */
function usePremiado(premio: PremioDeExemplo, aoSemAnuncios: () => void) {
  const [aberto, setAberto] = useState(false);
  const [feito, setFeito] = useState(false);
  const pedir = () => {
    if (vistos >= LIMITE_DE_PREMIADOS) {
      toast.info(`Você já viu os ${LIMITE_DE_PREMIADOS} anúncios premiados de hoje. Amanhã tem mais.`);
      return;
    }
    setAberto(true);
  };
  const fluxo = aberto && (
    <FluxoDoPremiado
      premio={premio}
      vistosHoje={vistos}
      aoSemAnuncios={aoSemAnuncios}
      aoTerminar={(viu) => {
        setAberto(false);
        if (!viu) return;
        vistos += 1;
        setFeito(true);
        /* SIMULADO: nenhuma Seed é creditada. No app, quem credita é o servidor, com teto por dia. */
        toast.ok(`Demonstração: ${premio.premio} simuladas. Nada foi creditado de verdade.`);
      }}
    />
  );
  return { pedir, fluxo, feito };
}

/** Fim de rodada: o bônus opcional, logo abaixo do XP (`plantarFim`, `anuncios.js:239-248` e `entregar`, `423-427`). */
function PremiadoNoFim({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const { pedir, fluxo, feito } = usePremiado(PREMIO_DO_FIM, aoSemAnuncios);
  return (
    <>
      <div className={`ad-fim-premio${feito ? ' feito' : ''}`} {...marca('fim-premiado', 'Premiado · opcional')}>
        <span className="ad-moeda">{feito ? <Check aria-hidden /> : <Sprout aria-hidden />}</span>
        {feito ? (
          <div>
            <b>+10 Seeds recebidas</b>
            <span className="ad-sub">Simulado: nada foi creditado. Obrigado por apoiar o Grátis.</span>
          </div>
        ) : (
          <>
            <div>
              <b>Bônus opcional: +10 Seeds</b>
              <span className="ad-sub">Veja um anúncio de até 30 s. Só se você quiser.</span>
            </div>
            <button type="button" className="btn btn-outline peq" data-ad-premio="seeds" onClick={pedir}>
              <Play aria-hidden /> Ver anúncio
            </button>
          </>
        )}
      </div>
      {fluxo}
    </>
  );
}

/** Loja: a faixa logo abaixo da carteira de Seeds (`plantarLoja`, `anuncios.js:213-223`). */
function PremiadoNaLoja({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const { pedir, fluxo } = usePremiado(PREMIO_DA_LOJA, aoSemAnuncios);
  const ref = useRef<HTMLDivElement>(null);
  /* A faixa acompanha a largura da carteira, que o app limita (`anuncios.js:220-222`). */
  useLayoutEffect(() => {
    const faixa = ref.current;
    const carteira = faixa?.previousElementSibling;
    if (!faixa || !carteira?.classList.contains('px-carteira')) return;
    const limite = getComputedStyle(carteira).maxWidth;
    if (limite && limite !== 'none') faixa.style.maxWidth = limite;
  }, []);
  return (
    <>
      <div ref={ref} className="q-aviso ad ad-aviso" {...marca('loja-seeds', 'Premiado · opcional')}>
        <span>
          <Sprout aria-hidden />{' '}
          <span>
            <b>Faltam Seeds para o que você quer?</b> Veja um anúncio de até 30 s e ganhe +15.{' '}
            <Rotulo texto="Anúncio premiado" />
          </span>
        </span>
        <button type="button" className="q-ctl" data-ad-premio="seeds15" onClick={pedir}>
          <Play aria-hidden /> Ver anúncio
        </button>
      </div>
      {fluxo}
    </>
  );
}

export default function EspacoDeDemonstracao({ espaco, aoSemAnuncios }: PropsDoEspacoDeAnuncio) {
  if (espaco === 'inicio-nativo') return <CartaoNoInicio aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'bib-infeed') return <LinhaNaBiblioteca aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'jogar-faixa') return <FaixaNoJogar aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'fim-bloco') return <BlocoNoFim aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'fim-premiado') return <PremiadoNoFim aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'loja-seeds') return <PremiadoNaLoja aoSemAnuncios={aoSemAnuncios} />;
  return null;
}
