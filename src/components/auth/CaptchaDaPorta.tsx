/**
 * CAPTCHA DA PORTA DE ENTRADA — o widget do Cloudflare Turnstile em entrar, criar conta e recuperar
 * senha.
 *
 * O convidado já passava pelo Turnstile (`src/lib/turnstile.ts`, widget invisível, um desafio por
 * criação de usuário anônimo). A porta precisa de outra forma: o widget fica NA TELA, dentro do
 * formulário, e a resposta dele tem de estar pronta na hora do envio — o Supabase confere no
 * servidor dele (`options.captchaToken`) quando a proteção está ligada no painel.
 *
 * SOB DEMANDA, DUAS VEZES: este arquivo só é baixado quando a porta abre num build com
 * `VITE_TURNSTILE_SITE_KEY` (o `Login.tsx` o importa com `import()`), e o script do Cloudflare só é
 * pedido quando este componente monta. Sem a variável, nada disso existe — e a CSP
 * (`server/http/csp.ts`) também só libera `challenges.cloudflare.com` com ela.
 *
 * A RESPOSTA É DE USO ÚNICO: depois de cada envio quem usa muda `rodada`, e o widget recomeça.
 *
 * O QUE PODE DAR ERRADO, e aparece na tela (com "Tentar de novo"):
 *   - `expirou`      a resposta venceu antes do envio (ela dura poucos minutos);
 *   - `falhou`       o desafio deu erro (rede, navegador recusado pelo Cloudflare);
 *   - `indisponivel` o script não carregou (sem conexão, bloqueador de anúncios, proxy).
 */
import { CircleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { t } from '../../lib/i18n';
import { SCRIPT_DO_TURNSTILE } from '../../lib/turnstile';

interface ApiDoTurnstile {
  render: (alvo: HTMLElement, opcoes: Record<string, unknown>) => string | undefined;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

type Problema = 'expirou' | 'falhou' | 'indisponivel';

/* A CHAVE do catálogo (o português); quem traduz é o ponto de uso, `t(FRASE[problema])`. */
const FRASE: Record<Problema, string> = {
  expirou: 'A verificação de segurança expirou. Refaça para continuar.',
  falhou: 'A verificação de segurança falhou. Tente de novo.',
  indisponivel:
    'Não foi possível carregar a verificação de segurança. Confira a conexão, desative bloqueadores e tente de novo.',
};

const ESPERA_DO_SCRIPT_MS = 15_000;

let carga: Promise<ApiDoTurnstile | null> | null = null;

/**
 * O script do Turnstile, uma vez por página. Reaproveita o que o convidado já tiver posto (mesma
 * URL) e esquece a tentativa que falhou, para o "Tentar de novo" pedir de novo.
 */
function carregarTurnstile(): Promise<ApiDoTurnstile | null> {
  const w = window as unknown as { turnstile?: ApiDoTurnstile };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  carga ??= new Promise((resolve) => {
    let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_DO_TURNSTILE}"]`);
    const fim = (api: ApiDoTurnstile | null) => {
      window.clearTimeout(relogio);
      if (!api) {
        carga = null;
        s?.remove();
      }
      resolve(api);
    };
    const relogio = window.setTimeout(() => fim(w.turnstile ?? null), ESPERA_DO_SCRIPT_MS);
    if (!s) {
      s = document.createElement('script');
      s.src = SCRIPT_DO_TURNSTILE;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    s.addEventListener('load', () => fim(w.turnstile ?? null));
    s.addEventListener('error', () => fim(null));
  });
  return carga;
}

/** O idioma do widget acompanha o da interface quando o Turnstile o conhece; senão, o do navegador. */
function idiomaDoWidget(): string {
  const l = document.documentElement.lang.toLowerCase();
  return /^(pt|en|es|ar)\b/.test(l) ? l : 'auto';
}

interface CaptchaDaPortaProps {
  /** A chave PÚBLICA do site no Turnstile. */
  sitekey: string;
  /** Muda a cada envio que gastou a resposta: o widget recomeça. */
  rodada: number;
  /** A resposta do desafio, ou `null` quando a anterior deixou de valer. */
  onToken: (resposta: string | null) => void;
  /** A marcação do headset (`questEntrada.css`) no aviso de problema. */
  quest?: boolean;
}

export default function CaptchaDaPorta({ sitekey, rodada, onToken, quest = false }: CaptchaDaPortaProps) {
  const alvo = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: ApiDoTurnstile; id: string } | null>(null);
  const aoToken = useRef(onToken);
  const [problema, setProblema] = useState<Problema | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    aoToken.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let vivo = true;
    void carregarTurnstile().then((api) => {
      if (!vivo) return;
      if (!api || !alvo.current) {
        setProblema('indisponivel');
        return;
      }
      const perdeu = (motivo: Problema) => {
        setProblema(motivo);
        aoToken.current(null);
      };
      try {
        const id = api.render(alvo.current, {
          sitekey,
          size: 'flexible',
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          language: idiomaDoWidget(),
          callback: (resposta: string) => {
            setProblema(null);
            aoToken.current(resposta);
          },
          'expired-callback': () => perdeu('expirou'),
          'timeout-callback': () => perdeu('expirou'),
          // `true` diz ao Turnstile que o erro foi tratado aqui (ele não repete no console).
          'error-callback': () => {
            perdeu('falhou');
            return true;
          },
        });
        if (id) widget.current = { api, id };
      } catch {
        setProblema('indisponivel');
      }
    });
    return () => {
      vivo = false;
      const w = widget.current;
      widget.current = null;
      if (w) {
        try {
          w.api.remove(w.id);
        } catch {
          /* o widget já saiu com o nó */
        }
      }
    };
  }, [sitekey, tentativa]);

  /* Envio feito: a resposta foi gasta, o desafio recomeça. */
  const ultimaRodada = useRef(rodada);
  useEffect(() => {
    if (ultimaRodada.current === rodada) return;
    ultimaRodada.current = rodada;
    const w = widget.current;
    if (w) w.api.reset(w.id);
  }, [rodada]);

  function tentarDeNovo() {
    setProblema(null);
    aoToken.current(null);
    const w = widget.current;
    if (w) w.api.reset(w.id);
    // Sem widget, o que falhou foi o script: pede de novo.
    else setTentativa((n) => n + 1);
  }

  const botao = (
    <button
      type="button"
      onClick={tentarDeNovo}
      className={quest ? 'qen-link' : 'ms-1 font-medium text-accent-ink underline underline-offset-2'}
    >
      {t('Tentar de novo')}
    </button>
  );

  return (
    <div data-testid="captcha-da-porta" className="grid gap-2">
      <div ref={alvo} className="min-h-[65px]" aria-label={t('Verificação de segurança')} />
      {problema &&
        (quest ? (
          <p className="qen-erro" role="status">
            <CircleAlert aria-hidden />
            <span>{t(FRASE[problema])}</span>
            {botao}
          </p>
        ) : (
          <p className="text-sm text-error-ink" role="status">
            {t(FRASE[problema])}
            {botao}
          </p>
        ))}
    </div>
  );
}
