import { useMemo } from 'react';
import { indiceDaTrilha } from '../../data/trilha/indice';
import { hasVoiceFor } from '../../lib/tts';
import { langLabelNaUI, LANGUAGES } from '../../lib/languages';
import { numero, t } from '../../lib/i18n';

/**
 * O QUE CADA IDIOMA TEM HOJE.
 *
 * O app oferece 28 idiomas no seletor e não sustenta 28 experiências iguais: um tem trilha CEFR,
 * outro tem faixa de frequência, a maioria só joga com o que a pessoa capturou, e a voz depende do
 * sistema operacional de quem está lendo. Sem esta tabela o produto promete parelho e entrega
 * desigual — e quem escolhe o idioma só descobre depois.
 *
 * Fica recolhida: é resposta para quem pergunta, não pedágio para quem já decidiu.
 */

interface Props {
  /** Quantas palavras o baralho da pessoa tem em cada idioma. */
  baralho: Array<{ lang: string; total: number }>;
}

type Nivel = 'completo' | 'parcial' | 'seu-conteudo';

const ROTULO: Record<Nivel, string> = {
  completo: 'Trilha por nível',
  parcial: 'Trilha por frequência',
  'seu-conteudo': 'Só o seu conteúdo',
};

const COR: Record<Nivel, string> = {
  completo: 'text-good-ink',
  parcial: 'text-accent-ink',
  'seu-conteudo': 'text-ink-faint',
};

const base = (lang: string) => (lang || '').toLowerCase().split('-')[0];

export default function CoberturaDosIdiomas({ baralho }: Props) {
  const linhas = useMemo(() => {
    const indice = indiceDaTrilha();
    const doBaralho = new Map(baralho.map(b => [base(b.lang), b.total]));

    /* Só os idiomas que a pessoa pode encontrar: os do seletor. Listar os 28 sempre daria uma
       tabela que ninguém lê; listar só os que têm trilha esconderia justamente a desigualdade. */
    return LANGUAGES.map(l => {
      const idioma = base(l.code);
      const entrada = indice[idioma];
      const nivel: Nivel = !entrada ? 'seu-conteudo' : entrada.escala === 'cefr' ? 'completo' : 'parcial';
      return {
        idioma,
        nome: langLabelNaUI(l.code),
        nivel,
        trilha: entrada?.total ?? 0,
        voz: hasVoiceFor(l.code),
        meu: doBaralho.get(idioma) ?? 0,
      };
    })
      .filter((l, i, todas) => todas.findIndex(o => o.idioma === l.idioma) === i)
      .sort((a, b) => (b.trilha - a.trilha) || (b.meu - a.meu) || a.nome.localeCompare(b.nome, 'pt'));
  }, [baralho]);

  return (
    <details className="mt-3 group">
      <summary className="label-mono cursor-pointer text-ink-faint hover:text-ink-muted transition-colors">
        O que cada idioma tem hoje
      </summary>

      <div className="mt-2 max-h-56 overflow-y-auto custom-scrollbar overflow-x-auto">
        <table className="w-full text-[11.5px] border-collapse">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-ink-faint text-start">
              <th className="font-normal py-1 pe-2">Idioma</th>
              <th className="font-normal py-1 pe-2">Vocabulário pronto</th>
              <th className="font-normal py-1 pe-2 text-end tabular-nums">Palavras</th>
              <th className="font-normal py-1 pe-2">Voz</th>
              <th className="font-normal py-1 text-end tabular-nums">Suas</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.idioma} className="border-t border-border-subtle">
                <td className="py-1 pe-2 text-ink">{l.nome}</td>
                <td className={`py-1 pe-2 ${COR[l.nivel]}`}>{t(ROTULO[l.nivel])}</td>
                <td className="py-1 pe-2 text-end tabular-nums text-ink-muted">
                  {l.trilha ? numero(l.trilha) : '—'}
                </td>
                {/* A voz é do NAVEGADOR de quem lê, não do app: por isso é medida aqui, na hora. */}
                <td className="py-1 pe-2 text-ink-muted">{l.voz ? 'sim' : 'não'}</td>
                <td className="py-1 text-end tabular-nums text-ink-muted">
                  {l.meu ? numero(l.meu) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
        Sem trilha, o idioma joga com o que você gravou ou importou. A voz depende do seu
        sistema: sem ela, os jogos de escuta ficam de fora até você gravar a sua.
      </p>
    </details>
  );
}
