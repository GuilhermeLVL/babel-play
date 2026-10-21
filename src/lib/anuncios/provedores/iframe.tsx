/**
 * O PROVEDOR REAL DE ANÚNCIOS (ruling R32) — um `<iframe credentialless>` para a página de anúncios na
 * ORIGEM PRÓPRIA (`VITE_ANUNCIOS_ORIGEM`, por exemplo `https://ads.frasy.com.br`).
 *
 * Por que um quadro: o GPT do Google não suporta COEP e só aceita CSP por nonce, e o app vive isolado
 * (COOP/COEP/DIP) com CSP estreita. A página de anúncios (`public/anuncios/espaco.html`) roda lá, sem
 * isolamento e com a CSP dela; o app só abre `frame-src` para a origem, e só com a flag ligada. O app em
 * si NUNCA carrega script da rede.
 *
 * `credentialless`: o quadro abre num contexto sem cookies, o que dispensa as regras do COEP. Navegador
 * sem o atributo (Firefox) = provedor indisponível (`disponivel()`), e o espaço não desenha nada.
 *
 * Só é montado depois da política (`podeMostrar`), que já exige a flag, o consentimento, a idade da conta
 * e o perfil não protegido. Por defesa, o espaço confere de novo o consentimento e a proteção antes de
 * desenhar o quadro: sem os dois, nada vai à rede.
 *
 * Mensagens: só as da origem de anúncios E do próprio quadro (`event.source`), no formato
 * `{ tipo: 'frasy:anuncio', evento, exibicaoId }`. `recompensa` vale uma vez por exibição, e só a
 * exibição que o servidor abriu (`iniciarPremiado`); quem credita é o servidor (`aoRecompensar`).
 */
import '../../../styles/anunciosDaRede.css';

import { type RefObject, useEffect, useRef, useState } from 'react';

import type { EspacoDeAnuncio, FormatoDeAnuncio } from '../../../core/anuncios/politicaDeAnuncio';
import { t } from '../../i18n';
import { lerPreferencias } from '../../preferencias';
import { perfilProtegido } from '../../protecaoDoMenor';
import type { PropsDoEspacoDeAnuncio, ProvedorDeAnuncios } from '../provedor';

export interface ConfigDoIframe {
  /** A origem da página de anúncios (só a origem). */
  origem: string;
  /** O código da rede no Ad Manager (`VITE_ANUNCIOS_REDE_CONTA`). */
  rede: string;
}

/** O navegador sabe abrir quadro `credentialless`? (Chrome/Edge sim; Firefox não.) */
export function suportaCredentialless(): boolean {
  return typeof HTMLIFrameElement !== 'undefined' && 'credentialless' in HTMLIFrameElement.prototype;
}

/* O React 19 trata `credentialless` como atributo booleano (string vazia ele descarta); o tipo do `iframe`
   ainda não o declara. O atributo precisa estar lá antes de o quadro navegar: o React o põe na criação. */
const CREDENTIALLESS = { credentialless: true } as Record<string, boolean>;

function tema(): 'claro' | 'escuro' {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'escuro' : 'claro';
}

function idioma(): string {
  return (typeof document !== 'undefined' && document.documentElement.lang) || 'pt-BR';
}

/** O endereço da página de anúncios para um espaço. `consentimento=1`: só se chega aqui com ele. */
export function enderecoDoEspaco(
  cfg: ConfigDoIframe,
  espaco: EspacoDeAnuncio,
  formato: FormatoDeAnuncio,
  exibicaoId?: string,
): string {
  const u = new URL('/anuncios/espaco.html', cfg.origem);
  const q = u.searchParams;
  q.set('espaco', espaco);
  q.set('formato', formato);
  q.set('tema', tema());
  q.set('idioma', idioma());
  q.set('app', window.location.origin);
  q.set('rede', cfg.rede);
  q.set('consentimento', '1');
  if (exibicaoId) q.set('exibicao', exibicaoId);
  return u.toString();
}

type Evento = 'recompensa' | 'fechou' | 'vazio';

/** Ouve as mensagens do quadro: só da origem de anúncios e só do próprio quadro. */
function useMensagensDoQuadro(
  origem: string,
  quadro: RefObject<HTMLIFrameElement | null>,
  aoEvento: (evento: Evento, exibicaoId: string | null) => void,
) {
  const ultimo = useRef(aoEvento);
  ultimo.current = aoEvento;
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.origin !== origem) return;
      if (!quadro.current || e.source !== quadro.current.contentWindow) return;
      const d = e.data as { tipo?: unknown; evento?: unknown; exibicaoId?: unknown } | null;
      if (!d || typeof d !== 'object' || d.tipo !== 'frasy:anuncio') return;
      if (d.evento !== 'recompensa' && d.evento !== 'fechou' && d.evento !== 'vazio') return;
      ultimo.current(d.evento, typeof d.exibicaoId === 'string' ? d.exibicaoId : null);
    };
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, [origem, quadro]);
}

function Topo({ aoSemAnuncios }: { aoSemAnuncios: () => void }) {
  return (
    <span className="anuncio-rede-topo">
      <span className="anuncio-rede-rotulo">{t('Patrocinado')}</span>
      <button type="button" className="anuncio-rede-sem" onClick={aoSemAnuncios}>
        {t('Sem anúncios')}
      </button>
    </span>
  );
}

function Nativo({ cfg, espaco, formato, aoSemAnuncios }: PropsDoEspacoDeAnuncio & { cfg: ConfigDoIframe }) {
  const quadro = useRef<HTMLIFrameElement | null>(null);
  const [vazio, setVazio] = useState(false);
  useMensagensDoQuadro(cfg.origem, quadro, (evento) => {
    if (evento === 'vazio') setVazio(true);
  });
  if (vazio) return null;
  return (
    <aside className="anuncio-rede" data-ad={espaco} aria-label={t('Anúncio')}>
      <Topo aoSemAnuncios={aoSemAnuncios} />
      <iframe
        ref={quadro}
        {...CREDENTIALLESS}
        className="anuncio-rede-quadro"
        src={enderecoDoEspaco(cfg, espaco, formato)}
        title={t('Anúncio')}
        width={300}
        height={250}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </aside>
  );
}

type EstadoDoPremiado = 'escolha' | 'abrindo' | 'indisponivel' | { exibicaoId: string };

function Premiado({
  cfg,
  espaco,
  formato,
  aoSemAnuncios,
  aoRecompensar,
}: PropsDoEspacoDeAnuncio & { cfg: ConfigDoIframe }) {
  const quadro = useRef<HTMLIFrameElement | null>(null);
  const [estado, setEstado] = useState<EstadoDoPremiado>('escolha');
  const recompensadas = useRef(new Set<string>());
  const aberta = typeof estado === 'object' ? estado.exibicaoId : null;

  useMensagensDoQuadro(cfg.origem, quadro, (evento, exibicaoId) => {
    if (!aberta) return;
    if (evento === 'recompensa') {
      if (exibicaoId !== aberta || recompensadas.current.has(aberta)) return;
      recompensadas.current.add(aberta);
      aoRecompensar?.(aberta);
      return;
    }
    setEstado(evento === 'vazio' ? 'indisponivel' : 'escolha');
  });

  const abrir = async () => {
    setEstado('abrindo');
    try {
      const { iniciarPremiado } = await import('../../../data/rotas/anuncios');
      setEstado(await iniciarPremiado(espaco));
    } catch {
      setEstado('indisponivel');
    }
  };

  return (
    <aside className="anuncio-rede" data-ad={espaco} aria-label={t('Anúncio')}>
      <Topo aoSemAnuncios={aoSemAnuncios} />
      {aberta ? (
        <div className="anuncio-rede-premiado">
          <button type="button" className="anuncio-rede-ver anuncio-rede-fechar" onClick={() => setEstado('escolha')}>
            {t('Fechar')}
          </button>
          <iframe
            ref={quadro}
            {...CREDENTIALLESS}
            src={enderecoDoEspaco(cfg, espaco, formato, aberta)}
            title={t('Anúncio')}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <button type="button" className="anuncio-rede-ver" disabled={estado === 'abrindo'} onClick={() => void abrir()}>
          {t('Ver um anúncio e ganhar a recompensa')}
        </button>
      )}
      {estado === 'indisponivel' && (
        <small className="anuncio-rede-aviso" role="status">
          {t('Nenhum anúncio disponível agora. Tente mais tarde.')}
        </small>
      )}
    </aside>
  );
}

function EspacoPorIframe(props: PropsDoEspacoDeAnuncio & { cfg: ConfigDoIframe }) {
  /* Defesa: a política já exigiu os dois, mas sem eles nada vai à rede, nunca. */
  if (perfilProtegido() || !lerPreferencias().consentimentos.anuncios) return null;
  if (!suportaCredentialless()) return null;
  return props.formato === 'premiado' ? <Premiado {...props} /> : <Nativo {...props} />;
}

/** O provedor para uma origem de anúncios e uma rede. Quem o registra é `lib/anuncios/ligar.ts`. */
export function criarProvedorPorIframe(cfg: ConfigDoIframe): ProvedorDeAnuncios {
  const Espaco = (props: PropsDoEspacoDeAnuncio) => <EspacoPorIframe cfg={cfg} {...props} />;
  return { id: 'iframe', Espaco, disponivel: suportaCredentialless, pedeConsentimento: true };
}
