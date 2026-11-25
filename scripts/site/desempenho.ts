/**
 * A PÁGINA PÚBLICA `/desempenho` (openspec `latencia-publicada-por-aparelho`, tarefa 2.3): o `latencia.json` em tabela, com a
 * definição da métrica e as ressalvas. Só os números do agregado (nunca valor "exato" inventado) e só células `ok`.
 *
 * QUANDO EXISTE: a flag `latencia_publicada` na lista do build (`SITE_FLAGS_DE_VENDA`, a mesma lista que o site já usa), o
 * arquivo (`SITE_LATENCIA_ARQUIVO`) válido e fresco, e pelo menos uma célula `ok`. Sem qualquer uma, a página NÃO é gerada e
 * sai do sitemap. Texto na linguagem da skill `copy-br-etica`: sem promessa, urgência nem comparação com outro produto.
 */
import { CLASSES_DA_LATENCIA, type LatenciaPublicada } from '../../src/core/latencia/agregarLatencia';
import { arquivoFresco } from '../../src/core/latencia/contratoDaLatencia';
import { FLAG_LATENCIA_PUBLICADA } from '../../src/core/planos';

export const CAMINHO_DO_DESEMPENHO = '/desempenho';

/** O nome de cada classe de aparelho, em palavras. */
const CLASSES: Record<string, string> = {
  quest: 'Óculos Quest',
  'celular-fraco': 'Celular mais simples',
  'celular-bom': 'Celular bom',
  'desktop-sem-gpu': 'Computador sem placa de vídeo dedicada',
  'desktop-com-gpu': 'Computador com placa de vídeo dedicada',
};
const IDIOMAS: [string, string][] = [
  ['en', 'Inglês'],
  ['es', 'Espanhol'],
  ['pt', 'Português'],
];

/** A página existe? Flag na lista do build, arquivo fresco e ao menos uma célula `ok` (as que a tabela mostra). */
export function deveGerarDesempenho(
  flags: Set<string>,
  latencia: LatenciaPublicada | null | undefined,
  agora: Date = new Date(),
): latencia is LatenciaPublicada {
  return (
    flags.has(FLAG_LATENCIA_PUBLICADA) &&
    !!latencia &&
    arquivoFresco(latencia, agora) &&
    latencia.celulas.some(
      (c) => c.estado === 'ok' && c.classe !== 'outro' && c.idioma !== 'todos' && c.idioma !== 'outro',
    )
  );
}

const segundos = (ms: number): string =>
  ms > 10000 ? 'mais de 10 s' : `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
const taxa = (f: number): string => {
  const p = f * 100;
  return p < 1 ? 'menos de 1%' : `${Math.round(p)}%`;
};
const dataBr = (iso: string): string => iso.split('-').reverse().join('/');

export function corpoDoDesempenho(l: LatenciaPublicada): string {
  const linhas = CLASSES_DA_LATENCIA.filter((c) => c !== 'outro')
    .map((classe) => {
      const celulas = IDIOMAS.map(([idioma]) => {
        const c = l.celulas.find((x) => x.classe === classe && x.idioma === idioma);
        if (!c || c.estado !== 'ok' || c.p50Ms === undefined || c.p75Ms === undefined || c.falha === undefined) {
          return '<td class="sem-dado">Amostra ainda pequena para publicar</td>';
        }
        return `<td>Metade das legendas em até <strong>${segundos(c.p50Ms)}</strong><br>Três em cada quatro em até ${segundos(c.p75Ms)}<br><span class="miudo">Não saiu em cerca de ${taxa(c.falha)} das falas &middot; ${c.n.toLocaleString('pt-BR')} falas</span></td>`;
      }).join('');
      return `<tr><th scope="row">${CLASSES[classe]}</th>${celulas}</tr>`;
    })
    .join('\n');
  return `
<article class="prosa cabeca">
<h1>Desempenho medido</h1>
<p class="lead">Quanto tempo a legenda traduzida leva para aparecer depois que a pessoa para de falar, em cada tipo de aparelho. Os números vêm de medições anônimas de quem aceitou enviá-las.</p>
<h2>O que está sendo medido</h2>
<p>Contamos o tempo entre o fim de uma fala e o aparecimento da legenda traduzida na tela. Mostramos a <strong>mediana</strong> (metade das legendas aparece até esse tempo) e o <strong>terceiro quartil</strong> (três em cada quatro aparecem até esse tempo), junto com a parcela das falas em que a legenda não saiu.</p>
<h2>Por tipo de aparelho e idioma</h2>
<div class="tabela-rolavel" role="region" aria-label="Desempenho por tipo de aparelho e idioma" tabindex="0">
<table>
<thead><tr><th scope="col">Aparelho</th>${IDIOMAS.map(([, nome]) => `<th scope="col">${nome}</th>`).join('')}</tr></thead>
<tbody>
${linhas}
</tbody>
</table>
</div>
<p class="miudo">Dados dos últimos ${l.janelaDias} dias, atualizados em ${dataBr(l.geradoEm)}. Só aparece um número quando há ao menos 200 falas medidas naquele tipo de aparelho e idioma.</p>
<h2>O que estes números não são</h2>
<ul>
<li><strong>Não é uma garantia.</strong> É o que foi medido em outros aparelhos do mesmo tipo; o seu pode ficar acima ou abaixo, conforme a conexão, a bateria e o que mais estiver aberto.</li>
<li><strong>Descreve um grupo específico:</strong> adultos que aceitaram enviar métricas anônimas. Perfis de menores não enviam medições.</li>
<li><strong>É aproximado.</strong> O app agrupa os tempos em faixas (até 0,25 s, 0,5 s, 1 s, 1,5 s, 2 s, 3 s, 5 s, 10 s e mais de 10 s), e cada número é o limite da faixa em que o valor caiu, não um valor exato.</li>
<li><strong>Sem dados pessoais.</strong> O arquivo traz só contagens por tipo de aparelho e idioma: nenhum texto, identificador, horário ou endereço.</li>
</ul>
</article>
`;
}
