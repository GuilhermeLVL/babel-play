import { CircleCheck, TriangleAlert } from 'lucide-react';

import { RAIO_DOS_CANTOS } from '../../../lib/appearance';

/**
 * "EDITAR O TEMA" — o miolo de `dialogoEditorTema()` do protótipo aprovado: as quatro cores
 * (Destaque, Fundo, Cartão, Texto), os cantos, a prévia ao vivo e o contraste do texto.
 *
 * Só o miolo: quem o monta (`EditorDoItem`) decide o que "Aplicar" faz e se a pessoa pode aplicar
 * (cores livres são o Tema Customizado, peça da Loja).
 */

export type Cantos = 'retos' | 'suaves' | 'redondos';
export interface CoresLivres {
  destaque: string;
  fundo: string;
  cartao: string;
  texto: string;
  cantos: Cantos;
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** A cor que o navegador calculou para uma variável (resolve `var()` e `color-mix()`), em #RRGGBB. */
export function corCalculada(variavel: string, reserva: string): string {
  try {
    const sonda = document.createElement('span');
    sonda.style.color = `var(${variavel})`;
    sonda.style.display = 'none';
    document.body.appendChild(sonda);
    const rgb = getComputedStyle(sonda).color;
    sonda.remove();
    const m = rgb.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return reserva;
    return `#${hex2(+m[0])}${hex2(+m[1])}${hex2(+m[2])}`.toUpperCase();
  } catch {
    return reserva;
  }
}

/** Razão de contraste WCAG entre duas cores #RRGGBB (a `contraste()` do protótipo). */
export function contraste(a: string, b: string): number {
  const L = (h: string) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [L(a), L(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export default function CoresDoTema({ cores, aoMudar }: { cores: CoresLivres; aoMudar: (c: CoresLivres) => void }) {
  const raio = RAIO_DOS_CANTOS[cores.cantos].card;
  const c = contraste(cores.texto, cores.cartao);
  return (
    <>
      <div className="g-cores">
        {(
          [
            ['destaque', 'Destaque'],
            ['fundo', 'Fundo'],
            ['cartao', 'Cartão'],
            ['texto', 'Texto'],
          ] as const
        ).map(([k, r]) => (
          <label key={k} className="cor-campo">
            <input
              type="color"
              value={cores[k]}
              aria-label={`Cor de ${r.toLowerCase()}`}
              onChange={(e) => aoMudar({ ...cores, [k]: e.target.value.toUpperCase() })}
            />
            <span>
              <b>{r}</b>
              <code>{cores[k].toUpperCase()}</code>
            </span>
          </label>
        ))}
      </div>
      <div>
        <span className="label-mono">Cantos</span>
        <div className="seg" role="radiogroup" aria-label="Cantos">
          {(
            [
              ['retos', 'Retos'],
              ['suaves', 'Suaves'],
              ['redondos', 'Redondos'],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={cores.cantos === v}
              onClick={() => aoMudar({ ...cores, cantos: v })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="previa-tema" style={{ background: cores.fundo, color: cores.texto, borderRadius: raio }}>
        <div style={{ background: cores.cartao, borderRadius: raio }}>
          <b>Revisar agora</b>
          <p style={{ fontSize: 12.5 }}>3 palavras prontas</p>
          <span
            style={{
              background: cores.destaque,
              color: contraste('#FFFFFF', cores.destaque) >= 4.5 ? '#fff' : '#1d1a16',
              borderRadius: raio,
            }}
          >
            Começar
          </span>
        </div>
      </div>
      {c < 4.5 ? (
        <div className="aviso-info warn" role="alert">
          <TriangleAlert aria-hidden />
          <span>
            Texto e cartão com pouco contraste ({c.toFixed(1).replace('.', ',')}:1). Para ler bem, o mínimo é 4,5:1.
          </span>
        </div>
      ) : (
        <p className="mut" style={{ fontSize: 12.5 }}>
          <CircleCheck
            aria-hidden
            style={{ width: 14, height: 14, verticalAlign: -2, color: 'var(--good-ink)', display: 'inline' }}
          />{' '}
          Contraste do texto: {c.toFixed(1).replace('.', ',')}:1
        </p>
      )}
    </>
  );
}
