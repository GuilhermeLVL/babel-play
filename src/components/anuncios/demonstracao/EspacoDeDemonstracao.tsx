/* O CSS dos espaços (cópia do protótipo) e a base das folhas de baixo (`dialog.folha-de-baixo`), que mora
   com a captura do celular. Só carregam com este arquivo, isto é, só na demonstração. */
import '../../../styles/capturaNoCelular.css';
import '../../../styles/espacosDeAnuncio.css';

import {
  ArrowRight,
  BookmarkPlus,
  BookOpen,
  Check,
  Clock,
  Compass,
  Globe,
  GraduationCap,
  Headphones,
  Play,
  Server,
  Sprout,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { EspacoDeAnuncio } from '../../../core/anuncios/politicaDeAnuncio';
import { LIMITE_DE_PREMIADOS_POR_DIA } from '../../../core/planos';
import type { PropsDoEspacoDeAnuncio } from '../../../lib/anuncios/provedor';
import { toast } from '../../Toast';
import FluxoDoPremiado from './FluxoDoPremiado';
import type { MarcaDeExemplo, PremioDeExemplo } from './tipos';

/**
 * O PROVEDOR DE DEMONSTRAÇÃO — desenha os espaços de anúncio como o protótipo aprovado os desenha
 * (`docs/prototipos/anuncios-no-gratis-src/anuncios.js`), para o dono VER os lugares.
 *
 * TUDO AQUI É DE MENTIRA: as marcas são as inventadas do protótipo, todo cartão diz "Patrocinado ·
 * exemplo", nada é carregado da rede, não há script de terceiro e a recompensa do premiado é SIMULADA
 * (nada é creditado no servidor). Só existe em desenvolvimento e no build de demonstração, o staging (`ligar.ts`,
 * R38).
 *
 * A marcação e as classes são as do protótipo, espaço por espaço; os números ao lado são as linhas de
 * `anuncios.js`. Os textos ficam em português, sem catálogo: é bancada, não produto.
 *
 * Os quinze espaços do protótipo têm desenho aqui. Os premiados que o servidor ainda não abre (`nuvem-30`,
 * `tema-24h`, `ajuda-premiada`, fora de `ESPACOS_PREMIADOS_ATIVOS`) aparecem SÓ aqui: o provedor real os esconde
 * (R39), e a recompensa da demonstração é simulada como a dos outros.
 */

/* `MARCAS` (`anuncios.js:57-64`). Nenhuma existe. */
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

const MOCHILA: MarcaDeExemplo = {
  nome: 'Mochila Poliglota',
  icone: Globe,
  cor: '#c9820a',
  titulo: 'Desafio dos 7 idiomas',
  texto: 'Um jogo de saudações oferecido pela Mochila Poliglota.',
  acao: 'Jogar',
};
const FONES: MarcaDeExemplo = {
  nome: 'Fones Cochicho',
  icone: Headphones,
  cor: '#b0457a',
  titulo: 'Fones que isolam o barulho da rua',
  texto: 'Para ouvir cada sílaba do podcast no ônibus.',
  acao: 'Ver oferta',
};
const ROTA: MarcaDeExemplo = {
  nome: 'Rota Âmbar Intercâmbio',
  icone: Compass,
  cor: '#d9622b',
  titulo: 'Um mês estudando fora',
  texto: 'Programas curtos para quem já entende a legenda sem pausar.',
  acao: 'Saber mais',
};

/* `PREMIOS` (`anuncios.js:413-419`). A ajuda vale para a PRÓXIMA rodada: anúncio nunca entra no meio de uma. */
const PREMIO_DO_FIM: PremioDeExemplo = { frase: 'ganhar +10 Seeds', premio: '+10 Seeds', marca: ESCOLA };
const PREMIO_DA_LOJA: PremioDeExemplo = { frase: 'ganhar +15 Seeds', premio: '+15 Seeds', marca: CURSO };
const PREMIO_DA_AJUDA: PremioDeExemplo = {
  frase: 'ganhar +1 ajuda na próxima rodada',
  premio: '+1 ajuda',
  marca: CADERNO,
};
const PREMIO_DO_TEMA: PremioDeExemplo = { frase: 'usar este tema por 24 h', premio: 'Tema por 24 h', marca: ROTA };
const PREMIO_DA_NUVEM: PremioDeExemplo = {
  frase: 'ganhar 30 minutos de nuvem',
  premio: '30 min de nuvem',
  marca: FONES,
};

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
    if (vistos >= LIMITE_DE_PREMIADOS_POR_DIA) {
      toast.info(`Você já viu os ${LIMITE_DE_PREMIADOS_POR_DIA} anúncios premiados de hoje. Amanhã tem mais.`);
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
        const simulado = premio.premio.endsWith('Seeds')
          ? `${premio.premio} simuladas`
          : `recompensa simulada (${premio.premio})`;
        toast.ok(`Demonstração: ${simulado}. Nada foi creditado de verdade.`);
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

/** Jogar › trilha: o selo "Oferecida por" (`PLANTIO.jogar`, `anuncios.js:148-155`), numa linha abaixo da trilha. */
function SeloNaTrilha({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  return (
    <p className="ad-oferece-linha">
      <span
        className="q-tag ad-oferece"
        {...marca('trilha-oferecida', 'Patrocínio de conteúdo')}
        title="Patrocínio de conteúdo. Exemplo: a marca não existe."
      >
        Oferecida por {ESCOLA.nome}
        <i> · exemplo</i>
      </span>
      <SemAnuncios aoSemAnuncios={aoSemAnuncios} />
    </p>
  );
}

/** Jogar › grade: a miniatura patrocinada no 8º lugar (`PLANTIO.jogar`, `anuncios.js:156-168`). */
function MiniaturaNoJogar({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const m = MOCHILA;
  return (
    <div className="qj-jogo ad-jogo-caixa">
      <article className="q-tile px-com-mini ad ad-jogo" {...marca('jogar-miniatura', 'Patrocínio de conteúdo')}>
        <span className="px-mini" style={cor(m)} aria-hidden="true">
          <i className="mm-chip">hola</i>
          <i className="mm-chip ok">hello</i>
          <i className="mm-chip">ciao</i>
          <i className="mm-chip">olá</i>
        </span>
        <span className="qj-jogo-topo">
          <i className="qj-ponto" style={{ background: m.cor }} />
          <span className="q-tag">Patrocinado</span>
        </span>
        <b>{m.titulo}</b>
        <span className="q-d">{m.texto}</span>
        <span className="qj-conta">exemplo · marca fictícia</span>
        <span className="ad-pe">
          <Cta m={m}>
            {m.acao} <ArrowRight aria-hidden />
          </Cta>
          <SemAnuncios aoSemAnuncios={aoSemAnuncios} />
        </span>
      </article>
    </div>
  );
}

/** Loja: o tema patrocinado, terceiro item da prateleira (`plantarLoja`, `anuncios.js:224-231`). */
function TemaNaLoja({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const m = ROTA;
  return (
    <article className="q-cartao px-item ad ad-item" {...marca('loja-tema', 'Patrocínio de conteúdo')}>
      <div className="px-arte ad-arte-tema" aria-hidden="true">
        <span className="px-amostra">
          {['#1d2433', '#27314a', '#f2a03d', '#fbe9c6'].map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
      </div>
      <p className="q-rotulo">
        <span className="q-tag">Patrocinado</span> Temas
      </p>
      <h3>Tema Rota Âmbar</h3>
      <p className="q-d">Oferecido por {m.nome} (exemplo). De graça por 7 dias, sem gastar Seeds.</p>
      <div className="px-item-pe">
        <button
          type="button"
          className="q-ctl"
          data-ad-cta={m.nome}
          onClick={() =>
            toast.info(
              'Anúncio de exemplo. No app, o tema entra na sua coleção por 7 dias, com o nome de quem oferece.',
            )
          }
        >
          Usar por 7 dias
        </button>
        <SemAnuncios aoSemAnuncios={aoSemAnuncios} />
      </div>
    </article>
  );
}

/** Uma faixa premiada dentro da tela, como a da Loja (`q-aviso ad-aviso`, `anuncios.js:186-188, 218`). */
function FaixaPremiada({
  espaco,
  premio,
  icone,
  chamada,
  texto,
  aoSemAnuncios,
}: {
  espaco: EspacoDeAnuncio;
  premio: PremioDeExemplo;
  icone: ReactNode;
  chamada: string;
  texto: string;
  aoSemAnuncios: () => void;
}) {
  const { pedir, fluxo, feito } = usePremiado(premio, aoSemAnuncios);
  return (
    <>
      <div className="q-aviso ad ad-aviso" {...marca(espaco, 'Premiado · opcional')}>
        <span>
          {feito ? <Check aria-hidden /> : icone}{' '}
          <span>
            <b>{feito ? `${premio.premio}: simulado.` : chamada}</b> {feito ? 'Nada foi creditado de verdade.' : texto}{' '}
            <Rotulo texto="Anúncio premiado" />
          </span>
        </span>
        {!feito && (
          <button type="button" className="q-ctl" data-ad-premio={espaco} onClick={pedir}>
            <Play aria-hidden /> Ver anúncio
          </button>
        )}
      </div>
      {fluxo}
    </>
  );
}

/** Fim de rodada: "+1 ajuda" (`usarAjuda`, `anuncios.js:268-278`), que vale para a próxima rodada. */
function AjudaNoFim({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const { pedir, fluxo, feito } = usePremiado(PREMIO_DA_AJUDA, aoSemAnuncios);
  return (
    <>
      <p className="ad-ajuda-linha" {...marca('ajuda-premiada', 'Premiado · opcional')}>
        <span>Uma ajuda acabou nesta rodada.</span>
        <button
          type="button"
          className="btn btn-outline peq ad-ajuda"
          data-ad-premio="ajuda"
          title="Opcional: veja um anúncio e ganhe mais uma ajuda na próxima rodada."
          disabled={feito}
          onClick={pedir}
        >
          {feito ? <Check aria-hidden /> : <Play aria-hidden />} {feito ? '+1 ajuda (simulado)' : '+1 ajuda'}{' '}
          <span className="ad-mini-tag">Anúncio</span>
        </button>
      </p>
      {fluxo}
    </>
  );
}

/** Estatísticas: a última linha da tela (`PLANTIO.estatisticas`, `anuncios.js:190-199`). */
function LinhaNasEstatisticas({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  const m = FONES;
  const Icone = m.icone;
  return (
    <div className="q-linha ad ad-infeed" {...marca('estat-faixa', 'In-feed nativo')}>
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

/** A faixa âncora do celular (`plantarAncora`, `anuncios.js:281-304`), com o respiro que ela pede no fim da tela. */
function Ancora({ aoFechar }: { aoFechar?: () => void }) {
  const m = FONES;
  const Icone = m.icone;
  return (
    <>
      <div className="ad-ancora-espaco" aria-hidden="true" />
      <aside className="ad-ancora" {...marca('ancora', 'Âncora')} aria-label="Anúncio">
        <span className="q-ic" style={cor(m)}>
          <Icone aria-hidden />
        </span>
        <span className="ad-ancora-texto">
          <b>{m.titulo}</b>
          <small>
            <Rotulo texto="Anúncio" /> · {m.nome}
          </small>
        </span>
        <Cta m={m}>Ver</Cta>
        <button
          type="button"
          className="ad-ancora-x"
          data-ad-acao="fechar-ancora"
          aria-label="Fechar o anúncio"
          onClick={() => {
            toast.info('Anúncio fechado. Ele não volta nesta sessão.');
            aoFechar?.();
          }}
        >
          <X aria-hidden />
        </button>
      </aside>
    </>
  );
}

/**
 * O intersticial entre rodadas (`abrirIntersticial`, `anuncios.js:656-706`): tela cheia, dispensável na hora
 * (o protótipo só segura o "×" 3 s no nível Intensos). Fechar, de qualquer jeito, segue para onde a pessoa ia.
 */
function Intersticial({ aoSemAnuncios, aoFechar }: { aoSemAnuncios: () => void; aoFechar?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const acabou = useRef(false);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const sair = (depois?: () => void) => {
    if (acabou.current) return;
    acabou.current = true;
    ref.current?.close();
    fechar.current?.();
    depois?.();
  };
  const sairRef = useRef(sair);
  sairRef.current = sair;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    d.focus({ preventScroll: true });
    const aoCancelar = (e: Event) => {
      e.preventDefault();
      sairRef.current();
    };
    d.addEventListener('cancel', aoCancelar);
    return () => d.removeEventListener('cancel', aoCancelar);
  }, []);
  const m = ROTA;
  const Icone = m.icone;
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      className="ad-tela ad-entre"
      aria-label="Anúncio"
      onClick={(e) => e.target === e.currentTarget && sair()}
    >
      <div className="ad-inter" {...marca('intersticial', 'Intersticial')}>
        <header>
          <span className="q-tag">Anúncio</span>
          <span className="ad-player-info">entre rodadas · exemplo</span>
          <span className="q-espaco" />
          <button type="button" className="q-ctl ad-x" aria-label="Fechar o anúncio" onClick={() => sair()}>
            <X aria-hidden />
          </button>
        </header>
        <div className="ad-criativo" style={cor(m)}>
          <span className="ad-criativo-marca">
            <span className="ad-criativo-ic">
              <Icone aria-hidden />
            </span>
            {m.nome}
          </span>
          <b>{m.titulo}</b>
          <p>{m.texto}</p>
          <Cta m={m} className="ad-criativo-cta">
            {m.acao} <ArrowRight aria-hidden />
          </Cta>
          <span className="ad-criativo-aviso">Anúncio de exemplo · marca fictícia</span>
        </div>
        <button type="button" className="q-ctl pri ad-seguir" data-ad-f="fechar" onClick={() => sair()}>
          Continuar <ArrowRight aria-hidden />
        </button>
        <p className="ad-regra">
          <Clock aria-hidden />
          <span>No máximo 1 a cada 5 min. Nunca durante a captura, no intérprete, nem no meio de uma rodada.</span>
        </p>
        <SemAnuncios aoSemAnuncios={() => sair(aoSemAnuncios)} />
      </div>
    </dialog>
  );
}

export default function EspacoDeDemonstracao({ espaco, aoSemAnuncios, aoFechar }: PropsDoEspacoDeAnuncio) {
  if (espaco === 'inicio-nativo') return <CartaoNoInicio aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'bib-infeed') return <LinhaNaBiblioteca aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'jogar-faixa') return <FaixaNoJogar aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'fim-bloco') return <BlocoNoFim aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'fim-premiado') return <PremiadoNoFim aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'loja-seeds') return <PremiadoNaLoja aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'trilha-oferecida') return <SeloNaTrilha aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'jogar-miniatura') return <MiniaturaNoJogar aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'loja-tema') return <TemaNaLoja aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'estat-faixa') return <LinhaNasEstatisticas aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'ancora') return <Ancora aoFechar={aoFechar} />;
  if (espaco === 'intersticial') return <Intersticial aoSemAnuncios={aoSemAnuncios} aoFechar={aoFechar} />;
  if (espaco === 'ajuda-premiada') return <AjudaNoFim aoSemAnuncios={aoSemAnuncios} />;
  if (espaco === 'tema-24h')
    return (
      <FaixaPremiada
        espaco="tema-24h"
        premio={PREMIO_DO_TEMA}
        icone={<Play aria-hidden />}
        chamada="Gostou do tema?"
        texto="Veja um anúncio de até 30 s e use este tema por 24 h, sem gastar Seeds."
        aoSemAnuncios={aoSemAnuncios}
      />
    );
  if (espaco === 'nuvem-30')
    return (
      <FaixaPremiada
        espaco="nuvem-30"
        premio={PREMIO_DA_NUVEM}
        icone={<Server aria-hidden />}
        chamada="Ganhe 30 min de nuvem."
        texto="Veja um anúncio de até 30 s e ganhe mais 30 minutos de legenda na nuvem neste mês. Se não quiser, a legenda segue no aparelho."
        aoSemAnuncios={aoSemAnuncios}
      />
    );
  return null;
}
