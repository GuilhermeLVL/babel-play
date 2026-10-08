/**
 * TRAZ O CSS DO PROTÓTIPO DE POLIMENTO PARA O APP, SEM REESCREVER.
 *
 *     node scripts/polimento/trazer-css.mjs "<pasta polimento-movimento-src do protótipo>"
 *
 * Por que copiar e não reescrever: o protótipo é um clone do DOM do desenho novo (`.q-*`, `.hud`,
 * `.cab`…) e a camada dele é ADITIVA, toda sob `html[data-px='on']`. O app passa a pôr a mesma marca
 * no `<html>` (`src/lib/polimento/base.ts`), então as regras valem como foram desenhadas, com os
 * mesmos valores. Reescrever foi como a primeira tentativa virou "aproximada".
 *
 * O que NÃO vem: a barra do protótipo, o painel de auditoria e as molduras de aparelho (não são app).
 * O que vem DEPOIS: trechos cujo comportamento em JS ainda não foi portado ficam de fora até lá
 * (senão a peça ficaria pela metade: por exemplo, o véu do painel nasce transparente e é o JS que o
 * acende). Cada trecho adiado está na tabela abaixo, com o item da lista `fidelidade/` que o destrava.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const origem = process.argv[2];
if (!origem) {
  console.error('Diga a pasta do protótipo (polimento-movimento-src).');
  process.exit(1);
}
const destino = join(dirname(fileURLToPath(import.meta.url)), '../../src/styles/polimento');

/** Linhas a tirar de cada arquivo (1 = primeira, inclusivas). `adiado`: entra quando o item for portado. */
const ARQUIVOS = {
  'polimento.css': [
    { de: 7, ate: 24, motivo: 'estrutura da página do protótipo; a do app está em polimento-app.css' },
    { de: 26, ate: 33, motivo: 'tokens de movimento e câmera lenta: estão em polimento-app.css, com --px-k fixo em 1' },
    { de: 289, ate: 302, adiado: 'jogos §6.1 Memória (giro da carta)' },
    { de: 354, ate: Infinity, motivo: 'barra do protótipo e painel da auditoria' },
  ],
  'efeitos.css': [
    { de: 215, ate: 245, motivo: 'barra do protótipo: demonstração e legenda' },
    { de: 252, ate: 314, motivo: 'molduras de aparelho do protótipo' },
  ],
  /* Dos arquivos de TELAS vem, por enquanto, só o que é da casca. O resto entra com cada tela (bloco D). */
  'telas.css': [
    { de: 1, ate: 36, adiado: 'bloco D: Capturar ao vivo, folhas da frase e da palavra' },
    { de: 44, ate: 129, adiado: 'bloco D: legendas flutuantes, oferta, planos' },
    { de: 131, ate: Infinity, adiado: 'bloco D: planos e nuance' },
  ],
  'telas2.css': [
    { de: 1, ate: 248, adiado: 'bloco D: Intérprete, Personalizar, Planos, Ajuda' },
    { de: 273, ate: Infinity, adiado: 'bloco D: Personalizar e Temporada na janela estreita' },
  ],
  'telas3.css': [{ de: 7, ate: Infinity, adiado: 'bloco D: Sessão, trilha da temporada e acertos' }],
  /* Os jogos e as miniaturas vêm inteiros: as classes são só deles (`pj-`, `rl-`, `ml-`, `mm-`, `px-mini`). */
  'minis.css': [],
  'jogos.css': [],
  'jogos3.css': [],
  'jogos4.css': [],
};

mkdirSync(destino, { recursive: true });
for (const [nome, cortes] of Object.entries(ARQUIVOS)) {
  const linhas = readFileSync(join(origem, nome), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const fora = (n) => cortes.find((c) => n >= c.de && n <= c.ate);
  const corpo = [];
  let ultimo = null;
  linhas.forEach((linha, i) => {
    const corte = fora(i + 1);
    if (!corte) {
      corpo.push(linha);
      ultimo = null;
    } else if (corte !== ultimo) {
      const ate = corte.ate === Infinity ? linhas.length : corte.ate;
      corpo.push(
        `/* [${nome}:${corte.de}-${ate}] ${corte.adiado ? 'ADIADO até portar: ' + corte.adiado : 'não vem: ' + corte.motivo} */`,
      );
      ultimo = corte;
    }
  });
  const cabecalho =
    `/* GERADO por scripts/polimento/trazer-css.mjs a partir de ${nome} do protótipo de polimento.\n` +
    `   NÃO EDITAR À MÃO: mude a tabela do script e gere de novo. As regras são as do protótipo, sem\n` +
    `   reescrita; valem sob html[data-px='on'], a marca que src/lib/polimento/base.ts põe. */\n`;
  writeFileSync(join(destino, nome), cabecalho + corpo.join('\n').trimEnd() + '\n');
  console.log(nome, linhas.length, '→', corpo.length, 'linhas');
}
