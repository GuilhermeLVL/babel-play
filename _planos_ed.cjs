const fs = require('fs');
const arq = 'src/components/views/Planos.tsx';
let s = fs.readFileSync(arq, 'utf8');
const de = "      ...perguntas(anualAVenda).filter(([, , doAnual]) => doAnual).map(([q, r]): [string, string] => [q, r]),";
if (!s.includes(de)) throw new Error('x');
s = s.replace(de, "      ...(anualAVenda\n        ? perguntas(true).filter(([q]) =>\n            [t('Qual a diferença entre mensal e anual?'), t('Posso passar do mensal para o anual?')].includes(q),\n          )\n        : []),");
fs.writeFileSync(arq, s);

/* O teste: só o que é do desenho de cada tela. */
const ta = 'tests/planos-anual-desligado.test.tsx';
let x = fs.readFileSync(ta, 'utf8');
const d2 = "    expect(container.textContent).toMatch(/Como funciona o teste de 14 dias\?/)\n    expect(container.textContent).toMatch(/Posso cancelar quando quiser\?/)\n    expect(container.textContent).toMatch(/E se eu me arrepender\?/)";
if (!x.includes(d2)) throw new Error('teste');
x = x.replace(d2, "    /* As perguntas são as de cada desenho: o novo traz as quatro do protótipo (`telas2.js:53-58`). */\n    const perguntas = questLigado\n      ? [/O teste cobra sozinho no fim\?/, /Posso cancelar\?/, /7 dias para desistir com reembolso/]\n      : [/Como funciona o teste de 14 dias\?/, /Posso cancelar quando quiser\?/, /E se eu me arrepender\?/]\n    for (const p of perguntas) expect(container.textContent).toMatch(p)");
fs.writeFileSync(ta, x);

/* Os roteiros: a bancada local vende o anual; o protótipo não tem o seletor. */
const pasta = 'scripts/polimento/roteiros/';
let n = 0;
for (const f of fs.readdirSync(pasta)) {
  if (!/^(planos|oferta)/.test(f)) continue;
  const r = JSON.parse(fs.readFileSync(pasta + f, 'utf8'));
  r.app.guardar = { ...r.app.guardar, 'babel.anualForaDeVenda': '1' };
  for (const p of r.app.passos) {
    if (p.js && p.js.includes("'/api/billing/teste'") && !p.js.includes('/api/abertura')) {
      p.js = p.js.replace("if (s.includes('/api/billing/teste'))", "if (s.includes('/api/abertura')) return j({ cadastro: true, checkout: true, anual: false }); if (s.includes('/api/billing/teste'))");
      n++;
    }
  }
  fs.writeFileSync(pasta + f, JSON.stringify(r, null, 2) + '\n');
}
console.log('roteiros', n);
