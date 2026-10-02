import '../../../../styles/questInstitucional.css';

import type { LucideIcon } from 'lucide-react';
import { Keyboard, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { t } from '../../../../lib/i18n';

export interface ArtigoDaAjuda {
  Icone: LucideIcon;
  titulo: string;
  desc: string;
}
export interface CanalDeContato {
  href: string;
  rotulo: string;
  Icone: LucideIcon;
  /** Abre em outra aba (site); `false` para `mailto:`. */
  externo: boolean;
}
export type EstadoDoServidor = 'verificando' | 'ok' | 'problema';

const TEXTO_DO_ESTADO: Record<EstadoDoServidor, string> = {
  ok: 'Todos os sistemas funcionando',
  problema: 'O servidor não está respondendo direito agora',
  verificando: 'Verificando o servidor…',
};

/**
 * AJUDA NO META QUEST — a tela de `Ajuda.tsx` numa janela só: a busca, os três artigos como
 * cartões-alvo (abrem o guia rápido), os atalhos e o contato lado a lado, e o estado do servidor no
 * cabeçalho.
 *
 * ATALHOS DE TECLADO: o headset não tem teclado físico, então a lista não ocupa a tela. A função não
 * some: uma linha diz o motivo e "Ver todos" abre o mesmo diálogo (com um teclado Bluetooth pareado, os
 * atalhos valem aqui também). NO COMPUTADOR (o mesmo desenho, com teclado físico) os atalhos existem:
 * `Ajuda.tsx` manda os primeiros em `atalhosAVista` e eles ficam na tela, como na de sempre.
 *
 * Só apresentação: busca, artigos filtrados, canais preenchidos e o estado vêm de `Ajuda.tsx`, que
 * continua dona do guia e do diálogo de atalhos.
 */
export default function AjudaDoQuest({
  busca,
  aoBuscar,
  artigos,
  canais,
  estado,
  aoAbrirGuia,
  aoAbrirAtalhos,
  atalhosAVista,
}: {
  busca: string;
  aoBuscar: (texto: string) => void;
  artigos: readonly ArtigoDaAjuda[];
  canais: readonly CanalDeContato[];
  /** `null` na edição estática: não há servidor para verificar. */
  estado: EstadoDoServidor | null;
  aoAbrirGuia: () => void;
  aoAbrirAtalhos: () => void;
  /**
   * As linhas dos primeiros atalhos, quando o aparelho tem teclado físico (o computador). Ausente (o
   * headset), a lista fica atrás de "Ver todos" e a linha diz o motivo.
   */
  atalhosAVista?: ReactNode;
}) {
  return (
    <div className="q-palco q-inst" data-testid="ajuda-do-quest">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{t('Suporte')}</p>
          <h1>{t('Ajuda e suporte')}</h1>
        </div>
        {estado && (
          <span
            className={`q-chip q-estado ${estado}`}
            role="status"
            aria-live="polite"
            data-testid="estado-do-servidor"
          >
            <i aria-hidden="true" /> {t(TEXTO_DO_ESTADO[estado])}
          </span>
        )}
      </header>

      <label className="q-campo">
        <span>{t('Buscar na ajuda')}</span>
        <input
          type="search"
          placeholder={t('Ex.: como capturar o som do computador')}
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
        />
      </label>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Primeiros passos')}</h2>
          </div>
        </header>
        {artigos.length ? (
          <div className="q-grade g3">
            {artigos.map(({ Icone, titulo, desc }) => (
              <button key={titulo} type="button" className="q-tile" onClick={aoAbrirGuia}>
                <span className="q-ic">
                  <Icone aria-hidden />
                </span>
                <b>{t(titulo)}</b>
                <span className="q-d">{t(desc)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="q-vazio q-inst-vazio" role="status">
            <span className="q-ic">
              <SearchX aria-hidden />
            </span>
            <h3>{t('Nada encontrado para “{busca}”', { busca })}</h3>
            <p>{t('Tente outra palavra ou fale com a gente abaixo.')}</p>
            <button type="button" className="q-ctl pri" onClick={() => aoBuscar('')}>
              {t('Limpar a busca')}
            </button>
          </div>
        )}
      </section>

      <div className="q-grade g2 q-inst-par">
        {atalhosAVista ? (
          <section className="q-cartao q-inst-atalhos" data-testid="atalhos-a-vista">
            <h2>
              <Keyboard aria-hidden /> {t('Atalhos de teclado')}
            </h2>
            <div>{atalhosAVista}</div>
            <button type="button" className="q-ctl" onClick={aoAbrirAtalhos}>
              {t('Ver todos')}
            </button>
          </section>
        ) : (
          <button type="button" className="q-linha" onClick={aoAbrirAtalhos}>
            <span className="q-ic">
              <Keyboard aria-hidden />
            </span>
            <span>
              <b>{t('Atalhos de teclado')}</b>
              <small>{t('O headset não tem teclado; com um teclado Bluetooth, eles valem aqui também.')}</small>
            </span>
            <span className="q-fim">{t('Ver todos')}</span>
          </button>
        )}

        <div className="q-ajuste" data-testid="contato-do-quest">
          <div>
            <b>{t('Fale com a gente')}</b>
            <small>
              {canais.length
                ? t('Dúvidas, problemas técnicos, sugestões ou pedidos sobre os seus dados.')
                : t(
                    'O contato ainda não foi configurado nesta instalação. Quando houver, ele aparece aqui e na tela Sobre.',
                  )}
            </small>
          </div>
          {canais.map(({ href, rotulo, Icone, externo }) => (
            <a key={rotulo} className="q-ctl" href={href} target={externo ? '_blank' : undefined} rel="noreferrer">
              <Icone aria-hidden /> {t(rotulo)}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
