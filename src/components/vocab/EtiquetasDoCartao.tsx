import { type FormEvent, useEffect, useId, useState } from 'react';

import {
  MAX_CARACTERES_DA_ETIQUETA,
  MAX_ETIQUETAS,
  normalizarEtiqueta,
} from '../../core/vocabulario/etiquetasDoUsuario';
import { fetchEtiquetasEmUso, salvarEtiquetasDoCartao } from '../../data/api';
import { t } from '../../lib/i18n';

/**
 * AS ETIQUETAS DO USUÁRIO NA PALAVRA: chips com remover, um campo para acrescentar e as etiquetas que a pessoa já
 * usa em outras palavras como sugestão (`<datalist>`). Cada mudança grava a lista inteira; se o servidor não
 * gravar, a lista volta ao que estava e o aviso diz.
 */
export default function EtiquetasDoCartao({
  cardId,
  inicial,
  aoMudar,
}: {
  cardId: string;
  inicial: string[];
  aoMudar?: (etiquetas: string[]) => void;
}) {
  const [etiquetas, setEtiquetas] = useState<string[]>(inicial);
  const [texto, setTexto] = useState('');
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState('');
  const idLista = useId();

  useEffect(() => setEtiquetas(inicial), [inicial]);
  useEffect(() => {
    let vivo = true;
    void fetchEtiquetasEmUso().then((l) => vivo && setSugestoes(l.map((e) => e.etiqueta)));
    return () => {
      vivo = false;
    };
  }, [cardId]);

  const gravar = async (proxima: string[]) => {
    setSalvando(true);
    setStatus('');
    const salvas = await salvarEtiquetasDoCartao(cardId, proxima);
    setSalvando(false);
    if (!salvas) {
      setStatus(t('Não deu para salvar as etiquetas agora.'));
      return;
    }
    setEtiquetas(salvas);
    aoMudar?.(salvas);
    setStatus(t('Etiquetas salvas.'));
    setSugestoes((antes) => [...new Set([...salvas, ...antes])]);
  };

  const adicionar = (e: FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    const nova = normalizarEtiqueta(texto);
    if (!nova) {
      setStatus(t('Use letras, números, - ou _, até {n} caracteres.', { n: MAX_CARACTERES_DA_ETIQUETA }));
      return;
    }
    if (etiquetas.includes(nova)) {
      setTexto('');
      return;
    }
    if (etiquetas.length >= MAX_ETIQUETAS) {
      setStatus(t('Até {n} etiquetas por palavra.', { n: MAX_ETIQUETAS }));
      return;
    }
    setTexto('');
    void gravar([...etiquetas, nova]);
  };

  const livres = sugestoes.filter((s) => !etiquetas.includes(s));

  return (
    <div className="hist-etiquetas" data-testid="etiquetas-do-cartao">
      <h4>{t('Etiquetas')}</h4>
      {etiquetas.length > 0 && (
        <ul className="hist-etiquetas-lista">
          {etiquetas.map((e) => (
            <li key={e}>
              <span className="q-chip">
                {e}
                <button
                  type="button"
                  className="hist-etiqueta-x"
                  disabled={salvando}
                  aria-label={t('Remover a etiqueta {etiqueta}', { etiqueta: e })}
                  onClick={() => void gravar(etiquetas.filter((x) => x !== e))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="hist-etiquetas-form" onSubmit={adicionar}>
        <label className="sr" htmlFor={`${idLista}-campo`}>
          {t('Adicionar etiqueta')}
        </label>
        <input
          id={`${idLista}-campo`}
          list={idLista}
          value={texto}
          maxLength={MAX_CARACTERES_DA_ETIQUETA + 1}
          placeholder={t('Adicionar etiqueta')}
          autoComplete="off"
          onChange={(e) => setTexto(e.target.value)}
        />
        <datalist id={idLista}>
          {livres.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="submit" className="q-chip" disabled={salvando || !texto.trim()}>
          {t('Adicionar')}
        </button>
      </form>
      <p className="hist-nota-status" role="status">
        {status}
      </p>
    </div>
  );
}
