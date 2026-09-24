import {
  Award,
  Bell,
  BellOff,
  Flame,
  Gift,
  Library,
  type LucideIcon,
  Settings,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../lib/i18n';
import {
  type IconeDaNotificacao,
  marcarLida,
  marcarTodasLidas,
  naoLidas,
  type Notificacao,
  notificacoes,
  ouvirNotificacoes,
  quando,
} from '../../lib/notificacoes';
import { usePreferencias } from '../../lib/preferencias';
import IconeEmBloco from '../ui/IconeEmBloco';
import { raizDoApp } from './raizDoApp';

const ICONES: Record<IconeDaNotificacao, LucideIcon> = {
  target: Target,
  award: Award,
  'trending-up': TrendingUp,
  gift: Gift,
  library: Library,
  flame: Flame,
};

/**
 * A lista viva da central, já filtrada pelas preferências: o tipo de aviso desligado em Ajustes →
 * Notificações (canal "no app") some do sino e da contagem.
 */
export function useListaDeNotificacoes(): Notificacao[] {
  const [lista, setLista] = useState(notificacoes);
  useEffect(() => ouvirNotificacoes(setLista), []);
  const { avisos } = usePreferencias();
  return lista.filter((n) => n.tipo === 'sessao' || !n.tipo || avisos[n.tipo]?.app !== false);
}

/**
 * O SINO — `.sino` com `.contagem` e o painel `.notif` do protótipo aprovado (`desenharNotifs`).
 *
 * O painel é montado na RAIZ do app (portal): o CSS do protótipo o posiciona em `absolute` no canto
 * do app (acima do rodapé do menu; no celular, abaixo da barra do topo), e dentro do menu lateral
 * ele seria recortado.
 */
export default function CentralDeNotificacoes({
  onIr,
}: {
  onIr: (view: string, dado?: Record<string, string>) => void;
}) {
  const lista = useListaDeNotificacoes();
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement | null>(null);
  const painel = useRef<HTMLDivElement | null>(null);
  const n = naoLidas(lista);

  // Abrir leva o foco ao primeiro botão do painel (`p.querySelector('button')?.focus()`).
  useEffect(() => {
    if (!aberto) return;
    painel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!painel.current?.contains(alvo) && !gatilho.current?.contains(alvo)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        gatilho.current?.focus();
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const alvo = raizDoApp();

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        className="sino"
        aria-label={t('Notificações')}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <Bell aria-hidden />
        {n > 0 && (
          <span className="contagem" aria-label={t('{n} não lidas', { n })}>
            {n}
          </span>
        )}
      </button>
      {aberto &&
        alvo &&
        createPortal(
          <div ref={painel} className="notif cartao on" role="dialog" aria-label={t('Notificações')}>
            <div className="entre notif-cab">
              <b>{t('Notificações')}</b>
              <div className="linha" style={{ gap: 4 }}>
                {n > 0 && (
                  <button type="button" className="link" onClick={() => marcarTodasLidas()}>
                    {t('Marcar todas como lidas')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline peq icone"
                  aria-label={t('Preferências de notificação')}
                  onClick={() => {
                    setAberto(false);
                    onIr('settings', { aba: 'notificacoes' });
                  }}
                >
                  <Settings aria-hidden />
                </button>
              </div>
            </div>
            <div className="notif-lista">
              {lista.length ? (
                lista.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={`notif-item ${x.lida ? '' : 'nova'}`}
                    onClick={() => {
                      marcarLida(x.id);
                      setAberto(false);
                      onIr(x.ir, x.dado);
                    }}
                  >
                    <IconeEmBloco icone={ICONES[x.icone] ?? Bell} tom={x.tom || 'accent'} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{x.titulo}</b>
                      <small className="mut">{x.detalhe}</small>
                    </span>
                    <small className="mut quando">{quando(x.em)}</small>
                    {!x.lida && <span className="ponto-novo" aria-label={t('não lida')} />}
                  </button>
                ))
              ) : (
                <div className="vazio" style={{ padding: 24 }}>
                  <IconeEmBloco icone={BellOff} />
                  <h3>{t('Nada por aqui')}</h3>
                  <p>{t('Avisos de revisão, conquistas e sessões salvas aparecem aqui.')}</p>
                </div>
              )}
            </div>
          </div>,
          alvo,
        )}
    </>
  );
}
