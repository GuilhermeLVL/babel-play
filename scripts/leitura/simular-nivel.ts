/**
 * SIMULAR O NÍVEL (openspec `leitura-assistida`, tarefa D1) — a parte que NÃO gasta nada: mede o classificador LOCAL
 * (`medirNivel`) contra os textos do acervo, que têm nível declarado por quem os escreveu. É o piso da meta "dentro de ±1
 * nível": se o classificador erra o texto original, ele também erra o ajustado.
 *
 *   npx tsx scripts/leitura/simular-nivel.ts            # tabela no terminal
 *   npx tsx scripts/leitura/simular-nivel.ts --json     # a mesma coisa em JSON
 *
 * O que este script NÃO faz (e a tarefa D1 continua aberta por isso): comparar 2 modelos baratos, com 1 e com 2 chamadas, em 50
 * parágrafos por nível. Isso precisa de chamada de modelo e de juízes sem créditos de API (`claude -p`), e é uma rodada à
 * parte, em bancada, com o dono avisado do custo.
 */
import textos from '../../src/data/leitura/textos.json';
import { medirNivel, NIVEIS_DO_AJUSTE, type NivelDoAjuste } from '../../src/core/leitura/ajustarNivel';

interface Ficha {
  id: string;
  nivel: NivelDoAjuste;
  texto: string;
}

const fichas = textos as unknown as Ficha[];
const linhas = fichas.map((f) => {
  const m = medirNivel(f.texto, 'en');
  const dist = m.nivel ? Math.abs(NIVEIS_DO_AJUSTE.indexOf(m.nivel) - NIVEIS_DO_AJUSTE.indexOf(f.nivel)) : null;
  return {
    id: f.id,
    declarado: f.nivel,
    medido: m.nivel,
    confianca: m.confianca,
    cobertura: Number(m.cobertura.toFixed(2)),
    distancia: dist,
  };
});
const medidos = linhas.filter((l) => l.distancia !== null);
const dentro = medidos.filter((l) => (l.distancia as number) <= 1).length;
const exatos = medidos.filter((l) => l.distancia === 0).length;
const resumo = {
  textos: linhas.length,
  medidos: medidos.length,
  exatos: `${exatos}/${medidos.length}`,
  dentroDeUmNivel: `${dentro}/${medidos.length}`,
  taxaDentroDeUmNivel: medidos.length ? Number((dentro / medidos.length).toFixed(2)) : 0,
};

if (process.argv.includes('--json')) console.log(JSON.stringify({ resumo, linhas }, null, 2));
else {
  console.table(linhas);
  console.log(resumo);
}
