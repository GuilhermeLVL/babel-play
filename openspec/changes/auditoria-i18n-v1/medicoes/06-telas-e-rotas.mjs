// MEDE: quantas telas o app tem, quantas passam por t(), e que fração o e2e de
// pseudo-localização realmente cobre.
//
// "Varre 5 telas" (docs/i18n-como-testar.md:112) é um número sem denominador. Sem saber
// quantas telas existem, 5 pode ser tudo ou pode ser um oitavo.
import { andar, caminho, ehFonte, lerTexto, relativo, tabela, pct, publicar } from './comum.mjs';

const VIEWS = caminho('src', 'components', 'views');
const CHAMADA_T = /(?<![\w.$])t\(/g;
const COMPONENTE_T = /<T\s+[a-z][\w-]*=/g;
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// Telas de topo: só os .tsx diretamente em views/, não as subviews de views/<tela>/.
const topo = andar(VIEWS, ehFonte).filter((p) => {
  const rel = relativo(p);
  return rel.split('/').length === relativo(VIEWS).split('/').length + 1;
});

const telas = topo.map((p) => {
  const cru = lerTexto(p);
  const src = semComentarios(cru);
  const t = (src.match(CHAMADA_T) ?? []).length;
  const compT = (src.match(COMPONENTE_T) ?? []).length;
  // Importar de lib/i18n NÃO significa traduzir: `numero`, `data` e `dataHora` são
  // formatadores de locale. Uma tela pode acertar o formato do número e continuar
  // 100% em português. Separo as duas coisas.
  const imp = cru.match(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*lib\/i18n['"]/);
  const importados = imp ? imp[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  return {
    arquivo: relativo(p), nome: relativo(p).split('/').pop().replace('.tsx', ''),
    t, compT, importados,
    soFormatador: importados.length > 0 && !importados.some((n) => n === 't' || n === 'tp'),
  };
});

// Rotas declaradas: leio o mapa SEGMENTO de src/lib/rotas.ts em vez de adivinhar pelos nomes.
// Um regex genérico de string com barra pega comentário e alias e devolve 6 onde há 11.
const rotas = lerTexto(caminho('src', 'lib', 'rotas.ts'));
const bloco = rotas.match(/const SEGMENTO[^=]*=\s*\{([\s\S]*?)\n\}/);
const doMapa = bloco ? [...bloco[1].matchAll(/(\w+)\s*:\s*'([^']*)'/g)].map((m) => `/${m[2]}`) : [];
const aliases = [...rotas.matchAll(/^\s*'([a-z-]+)'\s*:\s*'\w+'/gm)].map((m) => `/${m[1]}`);
const rotasUnicas = [...new Set([...doMapa, ...aliases])].sort();

// Quais telas o e2e de pseudo-localização visita.
const e2e = lerTexto(caminho('tests', 'e2e', 'pseudo-localizacao.e2e.ts'));
const visitadas = [...new Set([...e2e.matchAll(/['"`](\/[a-z-]+)\?ui=xx/g)].map((m) => m[1]))].sort();

const comT = telas.filter((x) => x.t > 0);
const semT = telas.filter((x) => x.t === 0);

const soFmt = telas.filter((x) => x.soFormatador);

let texto = tabela(
  ['tela', 't(', '<T', 'importa de lib/i18n', 'estado'],
  telas.sort((a, b) => b.t - a.t).map((x) => [
    x.nome, x.t, x.compT,
    x.importados.join(' ') || '—',
    x.t > 0 ? 'traduz' : (x.soFormatador ? 'só formata número/data' : 'nada'),
  ]),
);

texto += `\n\nTelas de topo em src/components/views/: ${telas.length}`;
texto += `\n  com ao menos uma chamada de t(): ${comT.length} (${pct(comT.length, telas.length)})`;
texto += `\n  que importam de lib/i18n mas SÓ formatadores (numero/data/dataHora): ${soFmt.length} → ${soFmt.map((x) => x.nome).join(', ')}`;
texto += `\n  sem nenhuma chamada de t(): ${semT.length} (${pct(semT.length, telas.length)})`;
texto += `\n\nRotas declaradas em src/lib/rotas.ts: ${rotasUnicas.length} → ${rotasUnicas.join(' ')}`;
texto += `\n\nTelas visitadas pelo e2e de pseudo-localização: ${visitadas.length} → ${visitadas.join(' ')}`;
texto += `\n  cobertura sobre as telas de topo: ${pct(visitadas.length, telas.length)}`;
texto += `\n  cobertura sobre as rotas declaradas: ${pct(visitadas.length, rotasUnicas.length)}`;

export default publicar('06 — telas, rotas e cobertura do e2e', texto, {
  telas: telas.length, comT: comT.length, semT: semT.map((x) => x.nome),
  rotas: rotasUnicas, visitadasPeloE2E: visitadas, detalhe: telas,
});
