/**
 * O PROVEDOR REAL DE ANÚNCIOS (rulings R32 e R35) — um `<iframe credentialless>` para a página de anúncios
 * no WORKER PRÓPRIO `frasy-anuncios` (`VITE_ANUNCIOS_ORIGEM`, por exemplo `https://ads.frasy.com.br`), que
 * nunca é a origem do app.
 *
 * Por que um quadro: o GPT do Google não suporta COEP e só aceita CSP por nonce, e o app vive isolado
 * (COOP/COEP/DIP) com CSP estreita. A página de anúncios (`anuncios/espaco.html`) roda lá, sem isolamento e
 * com a CSP dela; o app só abre `frame-src` para a origem, e só com a flag ligada. O app em si NUNCA carrega
 * script da rede. O código da rede e a origem do app vêm do BUILD da página (`config.js`), não da query.
 *
 * `credentialless`: o quadro abre num contexto sem cookies, o que dispensa as regras do COEP. Navegador
 * sem o atributo (Firefox) = provedor indisponível (`disponivel()`), e o espaço não desenha nada. O
 * `sandbox` tira do quadro a navegação do topo e os formulários; scripts, a própria origem (o GPT precisa
 * dela) e os pop-ups do clique no anúncio ficam.
 *
 * Só é montado depois da política (`podeMostrar`), que já exige a flag, o consentimento, a idade da conta
 * e o perfil não protegido. Por defesa, o espaço confere de novo o consentimento e a proteção antes de
 * desenhar o quadro: sem os dois, nada vai à rede. Se a CSP do app recusar o quadro (`frame-src`, a
 * sobreposição do Worker ainda não chegou), o espaço some.
 *
 * Mensagens: só as da origem de anúncios E do próprio quadro (`event.source`), no formato
 * `{ tipo: 'frasy:anuncio', evento, exibicaoId }`. `recompensa` vale uma vez por exibição, e só a
 * exibição que o servidor abriu (`iniciarPremiado`); quem credita é o servidor (`aoRecompensar`, que
 * resolve com o crédito ou rejeita com o `code` da recusa).
 *
 * A ESPERA DA DURAÇÃO MÍNIMA: o servidor recusa concluir antes de `DURACAO_MINIMA_DA_EXIBICAO_MS` (15 s) desde o
 * `iniciar` (409 `cedo_demais`, R33), e o GPT pode avisar a recompensa antes disso. Então o `concluir` só sai em
 * `iniciadoEm + 15 s` (o `iniciadoEm` é o relógio daqui quando o `iniciar` respondeu, depois do do servidor) e,
 * se mesmo assim vier `cedo_demais` (relógios discordando), tenta UMA vez de novo depois do que faltar (no mínimo
 * `FOLGA_DA_NOVA_TENTATIVA_MS`). Fechar o quadro ou sair da tela no meio da espera não cancela: o anúncio já foi
 * visto até o fim.
 *
 * A RECOMPENSA É APLICADA AQUI (`aplicarRecompensa`): Seeds disparam `babel:metricas-mudaram` (o
 * `useMetricas` relê o saldo, como depois de qualquer crédito), e toda recompensa vai em
 * `babel:recompensa-anuncio` (`detail` = o `PremiadoConcluido`; o `tema-24h` leva o `ateEm`, que não tem campo
 * nas preferências). A tela confirma o que veio.
 *
 * OS PREMIADOS QUE O SERVIDOR NÃO ABRE (R39): fora de `ESPACOS_PREMIADOS_ATIVOS` (`nuvem-30`, `tema-24h`,
 * `ajuda-premiada`, enquanto não ganham a recompensa de verdade) o espaço não desenha nada — o `iniciar` seria
 * recusado (400 `espaco_inativo`) e a pessoa veria um botão que não leva a lugar nenhum. A demonstração continua
 * desenhando os lugares (o fluxo dela é só no cliente).
 *
 * O INTERSTICIAL E A ÂNCORA são nativos com saída: o topo ganha "Fechar" (`aoFechar`), o intersticial cobre a tela
 * e a âncora fica presa ao pé; quadro vazio ou recusado também chama `aoFechar`, para ninguém ficar parado na
 * frente de um anúncio que não veio.
 */
import '../../../styles/anunciosDaRede.css';

import { type RefObject, useEffect, useRef, useState } from 'react';

import type { EspacoDeAnuncio, FormatoDeAnuncio } from '../../../core/anuncios/politicaDeAnuncio';
import { ehEspacoPremiado, ESPACOS_PREMIADOS_ATIVOS } from '../../../core/anuncios/premiado';
import { DURACAO_MINIMA_DA_EXIBICAO_MS } from '../../../core/planos';
import type { PremiadoConcluido } from '../../../data/rotas/anuncios';
import { t } from '../../i18n';
import { lerPreferencias } from '../../preferencias';
import { perfilProtegido } from '../../protecaoDoMenor';
import type { PropsDoEspacoDeAnuncio, ProvedorDeAnuncios } from '../provedor';

export interface ConfigDoIframe {
  /** A origem do Worker de anúncios (só a origem; nunca a do app). */
  origem: string;
}

/** O navegador sabe abrir quadro `credentialless`? (Chrome/Edge sim; Firefox não.) */
export function suportaCredentialless(): boolean {
  return typeof HTMLIFrameElement !== 'undefined' && 'credentialless' in HTMLIFrameElement.prototype;
}

/* O React 19 trata `credentialless` como atributo booleano (string vazia ele descarta); o tipo do `iframe`
   ainda não o declara. O atributo precisa estar lá antes de o quadro navegar: o React o põe na criação. */
const CREDENTIALLESS = { credentialless: true } as Record<string, boolean>;

/** Sem navegação do topo nem formulário; o GPT precisa de scripts e da própria origem, o clique abre aba. */
export const SANDBOX_DO_QUADRO = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox';

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
  const u = new URL('/espaco.html', cfg.origem);
  const q = u.searchParams;
  q.set('espaco', espaco);
  q.set('formato', formato);
  q.set('tema', tema());
  q.set('idioma', idioma());
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

/** A CSP do app recusou o quadro da origem de anúncios? Então o espaço some (nada de moldura vazia). */
function useQuadroRecusado(origem: string): boolean {
  const [recusado, setRecusado] = useState(false);
  useEffect(() => {
    const ouvir = (e: SecurityPolicyViolationEvent) => {
      if (!e.violatedDirective?.startsWith('frame-src')) return;
      if (e.blockedURI && !e.blockedURI.startsWith(origem)) return;
      setRecusado(true);
    };
    document.addEventListener('securitypolicyviolation', ouvir);
    return () => document.removeEventListener('securitypolicyviolation', ouvir);
  }, [origem]);
  return recusado;
}

/** O texto de uma recusa do servidor, pelo `code` dele. */
function textoDaRecusa(code: string | undefined): string {
  switch (code) {
    case 'teto_do_dia':
      return t('Você já ganhou as recompensas de anúncio de hoje. Amanhã tem de novo.');
    case 'cedo_demais':
      return t('O anúncio fechou antes do tempo mínimo, então a recompensa não valeu desta vez.');
    case 'exibicao_expirada':
      return t('Este anúncio passou do prazo. Se quiser, abra outro.');
    case 'exibicoes_pendentes':
      return t('Há anúncios abertos demais agora. Tente de novo em alguns minutos.');
    default:
      return t('Nenhum anúncio disponível agora. Tente mais tarde.');
  }
}

/** Na nova tentativa depois de um `cedo_demais`, espera pelo menos isto. */
const FOLGA_DA_NOVA_TENTATIVA_MS = 1_000;

const esperar = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Conclui no tempo do servidor: espera `iniciadoEm + minimoMs` e, num `cedo_demais`, tenta uma vez de novo depois
 * do que faltar (no mínimo a folga). Qualquer outra recusa, ou a segunda, rejeita.
 */
async function concluirNoTempo(
  aoRecompensar: (exibicaoId: string) => Promise<PremiadoConcluido>,
  exibicaoId: string,
  iniciadoEm: number,
  minimoMs: number,
): Promise<PremiadoConcluido> {
  await esperar(iniciadoEm + minimoMs - Date.now());
  try {
    return await aoRecompensar(exibicaoId);
  } catch (err) {
    if ((err as Error)?.message !== 'cedo_demais') throw err;
    await esperar(Math.max(iniciadoEm + minimoMs - Date.now(), FOLGA_DA_NOVA_TENTATIVA_MS));
    return aoRecompensar(exibicaoId);
  }
}

/** Aplica no app o que o servidor creditou: o saldo de Seeds é relido, e a recompensa é anunciada. */
function aplicarRecompensa(c: PremiadoConcluido): void {
  if (typeof window === 'undefined') return;
  if (c.tipo === 'seeds') window.dispatchEvent(new CustomEvent('babel:metricas-mudaram'));
  window.dispatchEvent(new CustomEvent('babel:recompensa-anuncio', { detail: c }));
}

/** A confirmação curta do que veio. */
function textoDaRecompensa(c: PremiadoConcluido): string {
  switch (c.tipo) {
    case 'seeds':
      return t('Recompensa registrada: +{n} Seeds.', { n: c.seeds });
    case 'tema-24h':
      return t('Tema liberado por 24 horas.');
    case 'nuvem':
      return t('Recompensa registrada: +{n} min de nuvem neste mês.', { n: Math.round(c.segundos / 60) });
    default:
      return t('Recompensa registrada.');
  }
}

function Topo({ aoSemAnuncios, aoFechar }: { aoSemAnuncios: () => void; aoFechar?: () => void }) {
  return (
    <span className="anuncio-rede-topo">
      <span className="anuncio-rede-rotulo">{t('Patrocinado')}</span>
      <button type="button" className="anuncio-rede-sem" onClick={aoSemAnuncios}>
        {t('Sem anúncios')}
      </button>
      {aoFechar && (
        <button type="button" className="anuncio-rede-sem anuncio-rede-x" onClick={aoFechar}>
          {t('Fechar')}
        </button>
      )}
    </span>
  );
}

/** O tamanho do quadro: a âncora é uma faixa baixa; o resto, o retângulo médio. */
const TAMANHO: Partial<Record<EspacoDeAnuncio, [number, number]>> = { ancora: [320, 50] };

function Nativo({ cfg, espaco, formato, aoSemAnuncios, aoFechar }: PropsDoEspacoDeAnuncio & { cfg: ConfigDoIframe }) {
  const quadro = useRef<HTMLIFrameElement | null>(null);
  const [vazio, setVazio] = useState(false);
  const recusado = useQuadroRecusado(cfg.origem);
  useMensagensDoQuadro(cfg.origem, quadro, (evento) => {
    if (evento === 'vazio') setVazio(true);
  });
  const sumiu = vazio || recusado;
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    if (sumiu) fechar.current?.();
  }, [sumiu]);
  if (sumiu) return null;
  const [largura, altura] = TAMANHO[espaco] ?? [300, 250];
  return (
    <aside className="anuncio-rede" data-ad={espaco} aria-label={t('Anúncio')}>
      <Topo aoSemAnuncios={aoSemAnuncios} aoFechar={aoFechar} />
      <iframe
        ref={quadro}
        {...CREDENTIALLESS}
        sandbox={SANDBOX_DO_QUADRO}
        className="anuncio-rede-quadro"
        src={enderecoDoEspaco(cfg, espaco, formato)}
        title={t('Anúncio')}
        width={largura}
        height={altura}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </aside>
  );
}

type EstadoDoPremiado =
  | { fase: 'escolha'; aviso?: string }
  | { fase: 'abrindo' }
  /** `iniciadoEm`: quando o `iniciar` respondeu (relógio daqui); `minimoMs`: a duração mínima do espaço. */
  | { fase: 'aberto'; exibicaoId: string; iniciadoEm: number; minimoMs: number };

function Premiado({
  cfg,
  espaco,
  formato,
  aoSemAnuncios,
  aoRecompensar,
}: PropsDoEspacoDeAnuncio & { cfg: ConfigDoIframe }) {
  const quadro = useRef<HTMLIFrameElement | null>(null);
  const [estado, setEstado] = useState<EstadoDoPremiado>({ fase: 'escolha' });
  const recompensadas = useRef(new Set<string>());
  const recusado = useQuadroRecusado(cfg.origem);
  const aberta = estado.fase === 'aberto' ? estado.exibicaoId : null;

  useMensagensDoQuadro(cfg.origem, quadro, (evento, exibicaoId) => {
    if (estado.fase !== 'aberto') return;
    if (evento === 'recompensa') {
      const id = estado.exibicaoId;
      if (exibicaoId !== id || recompensadas.current.has(id) || !aoRecompensar) return;
      recompensadas.current.add(id);
      concluirNoTempo(aoRecompensar, id, estado.iniciadoEm, estado.minimoMs).then(
        (c) => {
          aplicarRecompensa(c);
          setEstado({ fase: 'escolha', aviso: textoDaRecompensa(c) });
        },
        (err: unknown) => setEstado({ fase: 'escolha', aviso: textoDaRecusa((err as Error)?.message) }),
      );
      return;
    }
    setEstado({ fase: 'escolha', aviso: evento === 'vazio' ? textoDaRecusa(undefined) : undefined });
  });

  if (recusado) return null;

  const abrir = async () => {
    if (!ehEspacoPremiado(espaco)) {
      setEstado({ fase: 'escolha', aviso: textoDaRecusa(undefined) });
      return;
    }
    setEstado({ fase: 'abrindo' });
    try {
      const { iniciarPremiado } = await import('../../../data/rotas/anuncios');
      const r = await iniciarPremiado(espaco);
      if (r.ok === false) setEstado({ fase: 'escolha', aviso: textoDaRecusa(r.code) });
      else
        setEstado({
          fase: 'aberto',
          exibicaoId: r.exibicaoId,
          iniciadoEm: Date.now(),
          minimoMs: DURACAO_MINIMA_DA_EXIBICAO_MS[espaco],
        });
    } catch {
      setEstado({ fase: 'escolha', aviso: textoDaRecusa(undefined) });
    }
  };

  return (
    <aside className="anuncio-rede" data-ad={espaco} aria-label={t('Anúncio')}>
      <Topo aoSemAnuncios={aoSemAnuncios} />
      {aberta ? (
        <div className="anuncio-rede-premiado">
          <button
            type="button"
            className="anuncio-rede-ver anuncio-rede-fechar"
            onClick={() => setEstado({ fase: 'escolha' })}
          >
            {t('Fechar')}
          </button>
          <iframe
            ref={quadro}
            {...CREDENTIALLESS}
            sandbox={SANDBOX_DO_QUADRO}
            src={enderecoDoEspaco(cfg, espaco, formato, aberta)}
            title={t('Anúncio')}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <button
          type="button"
          className="anuncio-rede-ver"
          disabled={estado.fase === 'abrindo'}
          onClick={() => void abrir()}
        >
          {t('Ver um anúncio e ganhar a recompensa')}
        </button>
      )}
      {estado.fase === 'escolha' && estado.aviso && (
        <small className="anuncio-rede-aviso" role="status">
          {estado.aviso}
        </small>
      )}
    </aside>
  );
}

function EspacoPorIframe(props: PropsDoEspacoDeAnuncio & { cfg: ConfigDoIframe }) {
  /* Defesa: a política já exigiu os dois, mas sem eles nada vai à rede, nunca. */
  if (perfilProtegido() || !lerPreferencias().consentimentos.anuncios) return null;
  if (!suportaCredentialless()) return null;
  /* R39: premiado que o servidor ainda não abre não aparece no provedor real. */
  if (props.formato === 'premiado' && !(ESPACOS_PREMIADOS_ATIVOS as readonly string[]).includes(props.espaco))
    return null;
  return props.formato === 'premiado' ? <Premiado {...props} /> : <Nativo {...props} />;
}

/** O provedor para uma origem de anúncios. Quem o registra é `lib/anuncios/ligar.ts`. */
export function criarProvedorPorIframe(cfg: ConfigDoIframe): ProvedorDeAnuncios {
  const Espaco = (props: PropsDoEspacoDeAnuncio) => <EspacoPorIframe cfg={cfg} {...props} />;
  return { id: 'iframe', Espaco, disponivel: suportaCredentialless, pedeConsentimento: true };
}
