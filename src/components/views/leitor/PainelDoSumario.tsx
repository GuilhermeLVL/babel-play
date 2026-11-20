import { Search, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { t } from '../../../lib/i18n';
import type { ItemDoSumario } from '../../../lib/leitor/foliate/view.js';
import type { MotorDoLeitor } from '../../../lib/leitor/motor';

interface Resultado {
  cfi: string;
  antes: string;
  achado: string;
  depois: string;
  capitulo: string;
}

/** O SUMÁRIO E A BUSCA NO LIVRO (LEI03). Os resultados são botões: Enter leva ao trecho. */
export default function PainelDoSumario({
  motor,
  sumario,
  atual,
  aoIr,
}: {
  motor: MotorDoLeitor;
  sumario: ItemDoSumario[];
  /** `href` do item do sumário onde a leitura está. */
  atual?: string;
  aoIr: () => void;
}) {
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const geracao = useRef(0);

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = consulta.trim();
    if (q.length < 2) return;
    const minha = ++geracao.current;
    setBuscando(true);
    const lista: Resultado[] = [];
    try {
      for await (const r of motor.buscar(q)) {
        if (minha !== geracao.current) return;
        for (const s of r.subitems) {
          lista.push({
            cfi: s.cfi,
            antes: s.excerpt.pre,
            achado: s.excerpt.match,
            depois: s.excerpt.post,
            capitulo: r.label,
          });
          if (lista.length >= 200) break;
        }
        setResultados([...lista]);
        if (lista.length >= 200) break;
      }
    } finally {
      if (minha === geracao.current) {
        setBuscando(false);
        setResultados([...lista]);
      }
    }
  };

  const limpar = () => {
    geracao.current++;
    motor.limparBusca();
    setResultados(null);
    setConsulta('');
    setBuscando(false);
  };

  const itens = (lista: ItemDoSumario[], nivel = 0): React.ReactNode => (
    <ul className={nivel ? 'leitor-sumario-sub' : 'leitor-sumario'}>
      {lista.map((item, i) => (
        <li key={`${item.href}-${i}`}>
          <button
            type="button"
            className="leitor-item"
            aria-current={item.href === atual ? 'location' : undefined}
            onClick={() => {
              void motor.ir(item.href);
              aoIr();
            }}
          >
            {item.label?.trim() || t('Sem título')}
          </button>
          {item.subitems?.length ? itens(item.subitems, nivel + 1) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="leitor-sumario-painel">
      <form role="search" className="leitor-busca" onSubmit={buscar}>
        <label htmlFor="leitor-busca-campo" className="sr">
          {t('Buscar no livro')}
        </label>
        <input
          id="leitor-busca-campo"
          type="search"
          className="campo"
          placeholder={t('Buscar no livro')}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          data-autofocus
        />
        <button type="submit" className="btn btn-outline leitor-alvo" aria-label={t('Buscar')}>
          <Search aria-hidden />
        </button>
        {resultados && (
          <button
            type="button"
            className="btn btn-outline leitor-alvo"
            aria-label={t('Limpar a busca')}
            onClick={limpar}
          >
            <X aria-hidden />
          </button>
        )}
      </form>
      <p role="status" className="leitor-apoio">
        {buscando
          ? t('Buscando…')
          : resultados
            ? resultados.length
              ? t('{n} resultados', { n: resultados.length })
              : t('Nada encontrado.')
            : ''}
      </p>
      {resultados ? (
        <ul className="leitor-resultados">
          {resultados.map((r, i) => (
            <li key={`${r.cfi}-${i}`}>
              <button
                type="button"
                className="leitor-item"
                onClick={() => {
                  void motor.ir(r.cfi);
                  aoIr();
                }}
              >
                {r.capitulo && <span className="leitor-apoio">{r.capitulo}</span>}
                <span>
                  …{r.antes}
                  <mark>{r.achado}</mark>
                  {r.depois}…
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : sumario.length ? (
        <nav aria-label={t('Sumário')}>{itens(sumario)}</nav>
      ) : (
        <p className="leitor-apoio">{t('Este livro não tem sumário.')}</p>
      )}
    </div>
  );
}
