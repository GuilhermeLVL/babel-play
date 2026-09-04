// Utilidades compartilhadas pelas medições da auditoria de i18n.
// Somente leitura: nada aqui escreve no código do app.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// A raiz do worktree fica quatro níveis acima: openspec/changes/<change>/medicoes/.
export const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url));

export const caminho = (...p) => join(RAIZ, ...p);
export const relativo = (abs) => relative(RAIZ, abs).split('\\').join('/');

const IGNORAR = ['node_modules', '.git', 'dist', '.cache', 'playwright-report', 'test-results'];

/** Percorre um diretório recursivamente devolvendo caminhos absolutos dos arquivos que passam no filtro. */
export function andar(dir, filtro = () => true) {
  const saida = [];
  const pilha = [dir];
  while (pilha.length) {
    const atual = pilha.pop();
    let itens;
    try { itens = readdirSync(atual, { withFileTypes: true }); } catch { continue; }
    for (const item of itens) {
      if (IGNORAR.includes(item.name)) continue;
      const p = join(atual, item.name);
      if (item.isDirectory()) pilha.push(p);
      else if (filtro(p)) saida.push(p);
    }
  }
  return saida.sort();
}

export const ehFonte = (p) => /\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p);

export const lerJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const lerTexto = (p) => readFileSync(p, 'utf8');
export const tamanho = (p) => statSync(p).size;

/** Alinha uma tabela em colunas de largura fixa. Conta pontos de código, não unidades UTF-16,
 *  senão idioma com par substituto desalinha a coluna inteira. */
export function tabela(cabecalho, linhas) {
  const todas = [cabecalho, ...linhas].map((l) => l.map((c) => String(c ?? '')));
  const larg = cabecalho.map((_, i) => Math.max(...todas.map((l) => [...(l[i] ?? '')].length)));
  const uma = (l) => l.map((c, i) => {
    const sobra = larg[i] - [...c].length;
    return i === 0 ? c + ' '.repeat(sobra) : ' '.repeat(sobra) + c;
  }).join('  ');
  return [uma(todas[0]), larg.map((n) => '-'.repeat(n)).join('  '), ...todas.slice(1).map(uma)].join('\n');
}

export const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

/** Imprime o bloco legível e devolve o objeto que o rodar-tudo consolida em JSON. */
export function publicar(nome, texto, dados) {
  console.log(`\n===== ${nome} =====\n${texto}`);
  return { nome, dados };
}
