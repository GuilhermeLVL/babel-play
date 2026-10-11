import { CalendarClock, CircleCheck, ExternalLink, Mic, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { t } from '../../../../lib/i18n';
import type { CenaDoCartao } from '../../../../lib/revisao/cena';
import { barrasDaCena, hashDoTexto, pedacosDaFrase, tempoDaFala } from '../../../../lib/revisao/enxuta';

/**
 * AS PEÇAS DA REVISÃO ENXUTA — a marcação do protótipo `cartoes-enxuto-src` (`cartoes2.js` e
 * `cartoes4.js`), com os mesmos elementos e as mesmas classes; o CSS é o dele, copiado
 * (`styles/polimento/cartoes4.css`). Cada peça diz de que linha veio.
 */

/** `ctFrase()` de `cartoes2.js:70-82`: a frase com a palavra destacada (`marca`) ou com a lacuna (`vao`). */
export function FraseMarcada({ frase, palavra, modo = 'marca' }: { frase: string; palavra: string; modo?: 'marca' | 'vao' }) {
  return (
    <>
      {pedacosDaFrase(frase, palavra, modo).map((p, i) =>
        p.tipo === 'marca' ? (
          <mark key={i}>{p.texto}</mark>
        ) : p.tipo === 'vao' ? (
          <span key={i} className="qr-vao ct-vao" aria-label={t('lacuna')}>
            {' '}
          </span>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

/** `cxEq` de `cartoes2.js:152`: o equalizador que troca o ícone do botão enquanto o som toca. */
export function Eq() {
  return (
    <span className="ct-eq" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** `cxInterruptor()` de `cartoes2.js:509-510`. */
export function Interruptor({
  titulo,
  texto,
  ligado,
  aoTrocar,
}: {
  titulo: string;
  texto: string;
  ligado: boolean;
  aoTrocar: (ligado: boolean) => void;
}) {
  return (
    <div className="cx-ajuste">
      <span>
        <b>{titulo}</b>
        <small>{texto}</small>
      </span>
      <button
        type="button"
        className="q-interruptor"
        role="switch"
        aria-checked={ligado}
        aria-label={titulo}
        onClick={() => aoTrocar(!ligado)}
      />
    </div>
  );
}

/** O cabeçalho das folhas desta versão (`.cx-folha-cab`, `cartoes2.js:517`). */
export function CabecalhoDaFolha({ children, aoFechar }: { children: ReactNode; aoFechar: () => void }) {
  return (
    <div className="cx-folha-cab">
      <div>{children}</div>
      <button type="button" className="q-ctl cx-ic" aria-label={t('Fechar')} onClick={aoFechar}>
        <X aria-hidden />
      </button>
    </div>
  );
}

/** `cxSelo()` de `cartoes4.js:414`: a regra de cada prática, à vista. */
export function SeloDaPratica({ conta }: { conta: boolean }) {
  return (
    <span className={`cx-selo ${conta ? 'conta' : 'leve'}`}>
      {conta ? <CircleCheck aria-hidden /> : <CalendarClock aria-hidden />}
      <span>{conta ? t('conta como revisão') : t('não mexe na sua agenda')}</span>
    </span>
  );
}

/** `cxBarras()` e `cxOnda()` de `cartoes4.js:28-29`: a camada colorida varre por cima enquanto toca. */
export function Onda({ picos, classe = '', aoVivo = false }: { picos: readonly number[]; classe?: string; aoVivo?: boolean }) {
  const barras = picos.map((p, i) => <i key={i} style={{ height: `${Math.round(p * 100)}%` }} />);
  return (
    <span className={`cx-onda ${classe} ${picos.length ? '' : 'vazia'} ${aoVivo ? 'ao-vivo' : ''}`.replace(/\s+/g, ' ').trim()}>
      <span className="cx-onda-base">{barras}</span>
      <span className="cx-onda-cor" aria-hidden>
        {aoVivo ? null : barras}
      </span>
    </span>
  );
}

/**
 * A CENA (`cxCena()` de `cartoes2.js:173-189`), na versão de ÁUDIO: a onda da fala e a inicial de quem
 * falou. O app não guarda o quadro do vídeo, então a versão de vídeo do protótipo não existe aqui.
 * A onda é desenho (a mesma conta do protótipo, pela frase): não é a forma do áudio gravado.
 */
export function Cena({
  cena,
  semLink = false,
  aoAbrirSessao,
}: {
  cena: CenaDoCartao;
  semLink?: boolean;
  aoAbrirSessao?: () => void;
}) {
  const sem = hashDoTexto(cena.frase);
  const tempo = tempoDaFala(cena.inicioMs);
  return (
    <figure className="cx-cena audio" aria-label={t('A fala gravada na sessão')}>
      <span className="cx-cena-quadro ct-quadro">
        <svg viewBox="0 0 320 180" aria-hidden>
          <rect width="320" height="180" fill="var(--surface-sunken)" />
          <circle cx="270" cy="42" r="22" fill="color-mix(in srgb, var(--q-acento) 40%, var(--surface))" />
          <text x="270" y="50" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--ink)">
            {(cena.quem || '?')[0]}
          </text>
          <g fill="color-mix(in srgb, var(--q-acento) 70%, var(--surface-sunken))">
            {barrasDaCena(cena.frase).map(([x, y, h], i) => (
              <rect key={i} x={x.toFixed(1)} y={y.toFixed(1)} width="5" height={h.toFixed(1)} rx="2.5" />
            ))}
          </g>
          <path d="M24 146h272" stroke="var(--border-subtle)" strokeWidth="3" strokeLinecap="round" />
          <circle cx={24 + (sem % 200)} cy="146" r="6" fill="var(--q-acento)" />
        </svg>
        <i className="cx-cena-tempo">
          <Mic aria-hidden />
          {tempo}
        </i>
      </span>
      <figcaption>
        <span className="cx-cena-de">
          {cena.titulo}
          {cena.quem ? ` · ${cena.quem}` : ''}
        </span>
        {!semLink && aoAbrirSessao && (
          <button type="button" className="cx-link" onClick={aoAbrirSessao}>
            <ExternalLink aria-hidden />
            <span>{t('Abrir na sessão')}</span>
          </button>
        )}
      </figcaption>
    </figure>
  );
}
