import { useEffect, useState } from 'react';

import type { LatenciaPublicada } from '../../../core/latencia/agregarLatencia';
import { celulaDoSelo } from '../../../core/latencia/contratoDaLatencia';
import { FLAG_LATENCIA_PUBLICADA, FLAG_RUM_LATENCIA } from '../../../core/planos';
import { lerLatenciaPublicada } from '../../../data/rotas/latencia';
import { perfilDoDispositivo } from '../../../lib/dispositivo/perfil';
import { useFlag } from '../../../lib/flags';
import { numeroCom, t } from '../../../lib/i18n';
import { useLangConfig } from '../../../lib/langConfig';

/**
 * O SELO DE LATÊNCIA (openspec `latencia-publicada-por-aparelho`, tarefa 2.2): "aparelhos do seu tipo veem a legenda
 * traduzida em até X s", lido do agregado estático (`latencia.json`), perto do Iniciar e do preparo do modelo.
 *
 * REGRAS (spec "O selo diz o que mediu e não promete")
 *  - Só aparece para a célula `ok` do tipo de aparelho da pessoa (e do idioma que ela estuda; sem célula do idioma, a linha da
 *    classe somada). Sem célula `ok`, falha de rede, arquivo inválido ou velho: NADA aparece, e a captura segue igual.
 *  - Diz "metade das legendas" (p50), mostra a taxa de falha ao lado e a ressalva de que descreve adultos que aceitaram
 *    métricas anônimas. Sem "garantido", sem urgência, sem comparação com outro produto.
 *  - Flag `latencia_publicada` (e `rum_latencia`) desligada: o componente não renderiza e NÃO pede o arquivo.
 *  - Leitor de tela: um `role="note"` com a frase inteira em texto corrido (nada só em cor ou ícone).
 */

/** O tipo do aparelho em palavras (cada texto literal, para o extrator de i18n achar). */
function tipoEmPalavras(classe: string): string | null {
  switch (classe) {
    case 'quest':
      return t('óculos Quest');
    case 'celular-fraco':
      return t('celular mais simples');
    case 'celular-bom':
      return t('celular bom');
    case 'desktop-sem-gpu':
      return t('computador sem placa de vídeo dedicada');
    case 'desktop-com-gpu':
      return t('computador com placa de vídeo dedicada');
    default:
      return null;
  }
}

/** "1,5 s" ou, no último balde, "mais de 10 s". */
export function tempoDoSelo(ms: number): string {
  if (ms > 10000) return t('mais de 10 s');
  return t('{s} s', { s: numeroCom(ms / 1000, { maximumFractionDigits: 1 }) });
}

/** A taxa de falha em palavras: abaixo de 1%, "menos de 1%". */
export function taxaDoSelo(falha: number): string {
  const pct = falha * 100;
  return pct < 1 ? t('menos de 1%') : t('{p}%', { p: numeroCom(pct, { maximumFractionDigits: 0 }) });
}

/** A parte pura: o agregado + a classe + o idioma → o selo (ou nada). Os testes usam esta, sem rede. */
export function SeloDeLatenciaView({
  arquivo,
  classe,
  idioma,
}: {
  arquivo: LatenciaPublicada | null;
  classe: string;
  idioma: string | null;
}) {
  const celula = arquivo ? celulaDoSelo(arquivo, classe, idioma) : null;
  if (!arquivo || !celula || celula.p50Ms === undefined || celula.falha === undefined) return null;
  const tipo = tipoEmPalavras(classe);
  if (!tipo) return null;
  return (
    <aside role="note" className="mut" data-testid="selo-de-latencia" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
      <p style={{ margin: 0 }}>
        {t('Em aparelhos do seu tipo ({tipo}), metade das legendas traduzidas aparece em até {tempo}.', {
          tipo,
          tempo: tempoDoSelo(celula.p50Ms),
        })}{' '}
        {t('A legenda não saiu em cerca de {taxa} das falas.', { taxa: taxaDoSelo(celula.falha) })}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 11.5 }}>
        {t(
          'Medido de forma anônima, nos últimos {dias} dias, em adultos que aceitaram enviar métricas. O seu aparelho pode variar.',
          { dias: arquivo.janelaDias },
        )}
      </p>
    </aside>
  );
}

/** O selo com a leitura do arquivo. Com a flag desligada (ou a telemetria desligada) devolve `null` e não pede nada. */
export default function SeloDeLatencia(props: { classe?: string; idioma?: string | null } = {}) {
  const publicada = useFlag(FLAG_LATENCIA_PUBLICADA);
  const telemetria = useFlag(FLAG_RUM_LATENCIA);
  if (!publicada || !telemetria) return null;
  return <SeloLigado {...props} />;
}

/* Só existe com as duas flags ligadas: os ganchos de idioma e de rede não rodam com a flag desligada. */
function SeloLigado({ classe, idioma }: { classe?: string; idioma?: string | null }) {
  const { studying } = useLangConfig();
  const [arquivo, setArquivo] = useState<LatenciaPublicada | null>(null);

  useEffect(() => {
    let vivo = true;
    void lerLatenciaPublicada().then((a) => {
      if (vivo) setArquivo(a);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <SeloDeLatenciaView arquivo={arquivo} classe={classe ?? perfilDoDispositivo().tipo} idioma={idioma ?? studying} />
  );
}
