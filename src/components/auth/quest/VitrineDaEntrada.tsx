import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { t } from '../../../lib/i18n';

/**
 * A VITRINE VIVA DA PORTA DE ENTRADA (20/11/2026): quatro momentos reais do app, no painel da marca.
 *
 * As mídias são as mesmas da home do site (`public/site/midia/`, servidas na raiz em todos os modos: no
 * Worker o app mora em `/app`, mas os assets continuam em `/site/midia/…`). Tudo same-origin: `img-src` e
 * `media-src` já têm `'self'` (`server/http/csp.ts`).
 *
 * Carrossel no padrão do APG (W3C): `aria-roledescription="carrossel"`, um grupo por slide, bolinhas
 * como botões, botão de pausar (WCAG 2.2.2), `aria-live` educado só quando ninguém está girando.
 * Avança a cada 5 s; pausa com o ponteiro em cima, com o foco dentro e com a aba oculta. Com movimento
 * reduzido ou economia de dados: sem vídeo e sem giro (fica no primeiro, as bolinhas trocam à mão).
 *
 * DESEMPENHO: nada monta no celular (o formulário vem primeiro; a faixa compacta da marca fica como
 * estava). No computador, só a imagem do slide atual (e a do seguinte) é pedida, e o vídeo do slide
 * atual entra depois que o formulário já pintou.
 */
const M = '/site/midia';
const INTERVALO_MS = 5000;

interface Momento {
  nome: string;
  frase: string;
  alt: string;
  clipe: string;
}

const MOMENTOS: Momento[] = [
  {
    nome: 'Ouça',
    frase: 'A legenda acompanha quem fala.',
    alt: 'Tela real do Frasy: falas em inglês chegando ao vivo, cada uma com a tradução em português',
    clipe: 'fluxo-1-ouvir',
  },
  {
    nome: 'Guarde',
    frase: 'Toque na palavra e ela fica com você.',
    alt: 'Tela real do Frasy: tocar numa palavra da legenda e guardá-la',
    clipe: 'fluxo-2-guardar',
  },
  {
    nome: 'Jogue',
    frase: 'Revise brincando.',
    alt: 'Tela real do Frasy: o jogo da memória com as palavras guardadas e suas traduções',
    clipe: 'fluxo-4-jogar',
  },
  {
    nome: 'Leia',
    frase: 'Livros no seu nível.',
    alt: 'Tela real do Frasy: no leitor, tocar numa palavra do livro mostra a tradução',
    clipe: 'fluxo-7-ler',
  },
];

/** A janela estreita (≤ 720 px, a mesma de `questEntrada.css`): ali a vitrine não monta. */
const ESTREITA = '(max-width: 720px)';

/**
 * Quieta: sem giro e sem vídeo. A preferência do SISTEMA vale aqui mesmo com as animações do app ligadas
 * (`movimentoReduzido()` deixa o interruptor vencer, e ele nasce ligado): um carrossel que gira sozinho é
 * justamente o que quem pede menos movimento quer evitar. Também o Modo desempenho, o interruptor
 * desligado e a economia de dados.
 */
function vitrineQuieta(): boolean {
  if (typeof window === 'undefined') return true;
  const corpo = document.body.classList;
  if (corpo.contains('performance-mode') || corpo.contains('animations-off')) return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conexao?.saveData === true;
}

function useCombina(consulta: string): boolean {
  const [combina, setCombina] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(consulta).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(consulta);
    if (!mq) return;
    const mudou = () => setCombina(mq.matches);
    mudou();
    mq.addEventListener?.('change', mudou);
    return () => mq.removeEventListener?.('change', mudou);
  }, [consulta]);
  return combina;
}

export default function VitrineDaEntrada() {
  const estreita = useCombina(ESTREITA);
  if (estreita) return null;
  return <Carrossel />;
}

function Carrossel() {
  /* Lido uma vez: quem pede menos movimento (ou menos dados) não vê giro nem vídeo. */
  const [quieto] = useState(vitrineQuieta);
  const [atual, setAtual] = useState(0);
  const [pausadoPelaPessoa, setPausadoPelaPessoa] = useState(false);
  const [emCima, setEmCima] = useState(false);
  const [comFoco, setComFoco] = useState(false);
  const [abaOculta, setAbaOculta] = useState(() => typeof document !== 'undefined' && document.hidden);
  /* O vídeo só entra depois que o formulário pintou. */
  const [comVideo, setComVideo] = useState(false);
  const [vistos, setVistos] = useState<Set<number>>(() => new Set([0]));
  const raiz = useRef<HTMLElement>(null);

  const girando = !quieto && !pausadoPelaPessoa;
  const parado = !girando || emCima || comFoco || abaOculta;

  useEffect(() => {
    const mudou = () => setAbaOculta(document.hidden);
    document.addEventListener('visibilitychange', mudou);
    return () => document.removeEventListener('visibilitychange', mudou);
  }, []);

  useEffect(() => {
    if (quieto) return;
    const id = window.setTimeout(() => setComVideo(true), 600);
    return () => window.clearTimeout(id);
  }, [quieto]);

  useEffect(() => {
    if (parado) return;
    const id = window.setTimeout(() => setAtual((i) => (i + 1) % MOMENTOS.length), INTERVALO_MS);
    return () => window.clearTimeout(id);
  }, [parado, atual]);

  /* A imagem do slide atual e a do seguinte (a troca não pisca); as outras esperam a vez. */
  useEffect(() => {
    setVistos((antes) => {
      const proximo = (atual + 1) % MOMENTOS.length;
      if (antes.has(atual) && antes.has(proximo)) return antes;
      return new Set([...antes, atual, proximo]);
    });
  }, [atual]);

  return (
    <section
      ref={raiz}
      className="qen-vitrine"
      aria-roledescription={t('carrossel')}
      aria-label={t('O Frasy por dentro')}
      data-testid="vitrine-da-entrada"
      data-parado={parado ? 'true' : 'false'}
      onMouseEnter={() => setEmCima(true)}
      onMouseLeave={() => setEmCima(false)}
      onFocus={() => setComFoco(true)}
      onBlur={(e) => {
        if (!raiz.current?.contains(e.relatedTarget as Node | null)) setComFoco(false);
      }}
    >
      <div className="qen-vitrine-palco" aria-live={girando ? 'off' : 'polite'}>
        {MOMENTOS.map((m, i) => {
          const ativo = i === atual;
          return (
            <div
              key={m.clipe}
              className="qen-slide"
              role="group"
              aria-roledescription={t('slide')}
              aria-label={t('{n} de {total}: {nome}', { n: i + 1, total: MOMENTOS.length, nome: t(m.nome) })}
              aria-hidden={!ativo}
              data-ativo={ativo ? 'true' : 'false'}
            >
              <div className="qen-moldura">
                <div className="qen-tela">
                  {vistos.has(i) && (
                    <img
                      src={`${M}/${m.clipe}.jpg`}
                      alt={t(m.alt)}
                      width={1200}
                      height={900}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  )}
                  {ativo && comVideo && (
                    <video
                      key={m.clipe}
                      src={`${M}/${m.clipe}.mp4`}
                      poster={`${M}/${m.clipe}.jpg`}
                      muted
                      loop
                      playsInline
                      autoPlay
                      preload="none"
                      aria-hidden
                      tabIndex={-1}
                    />
                  )}
                </div>
              </div>
              <p className="qen-legenda">
                <span className="qen-legenda-nome">{t(m.nome)}</span>
                <span className="qen-legenda-frase">{t(m.frase)}</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="qen-vitrine-controles">
        {!quieto && (
          <button
            type="button"
            className="qen-vitrine-pausa"
            aria-label={pausadoPelaPessoa ? t('Continuar a apresentação') : t('Pausar a apresentação')}
            onClick={() => setPausadoPelaPessoa((p) => !p)}
          >
            {pausadoPelaPessoa ? <Play aria-hidden /> : <Pause aria-hidden />}
          </button>
        )}
        <div className="qen-bolinhas">
          {MOMENTOS.map((m, i) => (
            <button
              key={m.clipe}
              type="button"
              className="qen-bolinha"
              aria-label={t('Mostrar {n} de {total}: {nome}', { n: i + 1, total: MOMENTOS.length, nome: t(m.nome) })}
              aria-current={i === atual ? 'true' : undefined}
              onClick={() => setAtual(i)}
            >
              <span aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
