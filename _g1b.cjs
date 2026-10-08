const fs = require('fs');
const arq = 'src/components/minigames/TermoDoPrototipo.tsx';
let s = fs.readFileSync(arq, 'utf8');
const troca = (a, b) => { if (!s.includes(a)) throw new Error('nao achei: ' + a.slice(0, 60)); s = s.replace(a, b); };
troca("    teclas: {} as Record<string, Cor>,\n", "    teclas: {} as Record<string, Cor>,\n    /** As cores que o teclado mostra: só mudam quando o julgamento termina (`jogos4.js:343`). */\n    pintadas: {} as Record<string, Cor>,\n");
troca("    j.teclas = {};\n    j.tabs = ws.map", "    j.teclas = {};\n    j.pintadas = {};\n    j.tabs = ws.map");
troca("    const teclas = { ...j.teclas };\n    j.teclas = teclasPintadas.current;\n    pintar();", "    pintar();");
troca("      j.teclas = teclas;\n      teclasPintadas.current = teclas;\n", "      j.pintadas = { ...j.teclas };\n");
troca("  /** As cores das teclas só mudam quando o julgamento termina (`jogos4.js:343`). */\n  const teclasPintadas = useRef<Record<string, Cor>>({});\n\n", "");
troca("className={j.teclas[c] || undefined}", "className={j.pintadas[c] || undefined}");
troca("  const registrar = (t: Tab, correct: boolean) => {", "  const registrar = (t: Tab, correct: boolean, attempts: number) => {");
troca("      attempts: j.linha + 1,\n", "      attempts,\n");
troca("const p = registrar(t, true);", "const p = registrar(t, true, j.linha + 1);");
troca("registrar(t, false);", "registrar(t, false, j.max);");
troca(`      {textos && (
        <p className="pj-instr" {...(instr ? {} : { dangerouslySetInnerHTML: { __html: textos.instr } })}>
          {instr ?? undefined}
        </p>
      )}`, `      {instr ? (
        <p className="pj-instr">{instr}</p>
      ) : (
        textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />
      )}`);
troca('<div className="teclado ">', '<div className="teclado">');
troca("className={`tab-termo${t.ok && t.linhas.length <= j.linha ? ' resolvido' : ''}${t.falhou ? ' falhou' : ''}`}", "className={`tab-termo${resolvido(t) ? ' resolvido' : ''}${t.falhou ? ' falhou' : ''}`}");
troca("{t.ok && t.linhas.length <= j.linha ? (\n                  <span className=\"selo ok\">", "{resolvido(t) ? (\n                  <span className=\"selo ok\">");
troca("  if (!degraus.length) return null;\n", "  if (!degraus.length) return null;\n\n  /* O tabuleiro só ganha o selo quando o julgamento termina (`jogos4.js:344-349`): até lá a linha vencedora\n     é a de agora (`linhas.length` passa de `linha`). */\n  const resolvido = (t: Tab) => t.ok && t.linhas.length <= j.linha;\n");
fs.writeFileSync(arq, s);
let d = fs.readFileSync('src/components/minigames/DueloDoPrototipo.tsx', 'utf8');
d = d.replace('<div className="opcoes-blitz " key', '<div className="opcoes-blitz" key');
fs.writeFileSync('src/components/minigames/DueloDoPrototipo.tsx', d);
console.log('ok');
