import '../../../styles/etiquetas.css';

import { Loader2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { type MotivoDaPratica, palavrasParaPraticar } from '../../../core/leitura/palavrasParaPraticar';
import { chaveAtiva } from '../../../core/texto/chaveAtiva';
import { estaNoCaderno, useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { t } from '../../../lib/i18n';

const porque = (m: MotivoDaPratica) =>
  m === 'pulada' ? t('O Frasy não ouviu bem') : m === 'tocada' ? t('você tocou nela') : t('destacada no capítulo');

/**
 * OS 5 CARTÕES DO FIM DO CAPÍTULO (flag `leitor_destaque_vocab`; openspec `leitura-assistida`, C7). Ao terminar um
 * capítulo, oferece até 5 palavras que ele destacou (as que a pessoa tocou primeiro, depois as mais repetidas), pela mesma
 * régua da Leitura ativa (`palavrasParaPraticar`). NUNCA começa sozinho: a pessoa escolhe "Praticar", e só então as
 * marcadas que ainda não têm cartão são guardadas. Palavra que já está no caderno vem desmarcada (marcar duplicaria).
 */
export default function PraticaDoCapitulo({
  idioma,
  tocadas,
  candidatas,
  guardar,
  aoPraticar,
  aoFechar,
}: {
  idioma: string;
  /** As palavras que a pessoa tocou no capítulo, como no texto. */
  tocadas: readonly string[];
  /** As chaves novas e aprendendo do capítulo, as mais repetidas primeiro. */
  candidatas: readonly string[];
  /** Guarda a palavra no caderno. `false` = não deu. */
  guardar: (palavra: string) => Promise<boolean>;
  /** Vai estudar. */
  aoPraticar: () => void;
  aoFechar: () => void;
}) {
  const s = useSnapshotDasEtiquetas();
  const sugeridas = useMemo(
    () =>
      palavrasParaPraticar({
        puladas: [],
        tocadas,
        alvoDesconhecidas: candidatas,
        noCaderno: (chave) => estaNoCaderno(s, chave, idioma),
        lang: idioma,
      }),
    [tocadas, candidatas, s, idioma],
  );
  const [desmarcadas, setDesmarcadas] = useState<ReadonlySet<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  if (!sugeridas.length) return null;

  const marcada = (p: (typeof sugeridas)[number]) => p.marcada && !desmarcadas.has(p.palavra);
  const praticar = async () => {
    setGuardando(true);
    for (const p of sugeridas) if (marcada(p)) await guardar(p.palavra);
    setGuardando(false);
    aoPraticar();
  };

  return (
    <section
      className="leitor-pratica"
      aria-label={t('Praticar as palavras deste capítulo')}
      data-testid="pratica-do-capitulo"
    >
      <div className="leitor-pratica-topo">
        <h2>{t('Praticar {n} palavras deste capítulo', { n: sugeridas.length })}</h2>
        <button type="button" className="leitor-botao" aria-label={t('Agora não')} onClick={aoFechar}>
          <X aria-hidden />
        </button>
      </div>
      <ul>
        {sugeridas.map((p) => {
          const chave = chaveAtiva(p.palavra, idioma);
          const noCaderno = estaNoCaderno(s, p.palavra, idioma);
          return (
            <li key={chave}>
              <label>
                <input
                  type="checkbox"
                  checked={marcada(p)}
                  disabled={noCaderno || guardando}
                  onChange={(e) =>
                    setDesmarcadas((d) => {
                      const novo = new Set(d);
                      if (e.target.checked) novo.delete(p.palavra);
                      else novo.add(p.palavra);
                      return novo;
                    })
                  }
                />
                <span lang={idioma || undefined}>{p.palavra}</span>
                <small>{noCaderno ? t('já no seu caderno') : porque(p.motivo)}</small>
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn btn-primary leitor-alvo"
        disabled={guardando}
        onClick={() => void praticar()}
      >
        {guardando && <Loader2 className="animate-spin" aria-hidden />} {t('Praticar agora')}
      </button>
    </section>
  );
}
