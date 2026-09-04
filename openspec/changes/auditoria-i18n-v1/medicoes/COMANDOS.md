# Comandos das medições — Fases 0 a 3

Todo número do `FASE-0-baseline.md` e do `FASE-1-verificacao.md` sai de um destes comandos ou de um `arquivo:linha`.
Rode tudo a partir da raiz do worktree:

```
c:\Users\Guilh\OneDrive\Área de Trabalho\babel-play-lab\.claude\worktrees\multi-idioma
```

## Reproduzir todas as contagens de uma vez

```bash
node openspec/changes/auditoria-i18n-v1/medicoes/rodar-tudo.mjs
```

Reescreve `medicoes/saidas/*.txt` e `medicoes/saidas/consolidado.json`. Somente leitura sobre o
código do app: só escreve dentro de `medicoes/saidas/`.

A medição 08 precisa de `npm run build` rodado antes; sem `dist/` ela se anuncia e passa.

## As medições, uma a uma

| script | responde |
|---|---|
| `01-inventario.mjs` | stack, versões, estado do git, superfície de arquivos, ICU do runtime |
| `02-chaves-catalogo.mjs` | quantas chaves cada catálogo **preenche** (não quantas declara) |
| `03-chamadas-t.mjs` | `t(`/`tp(`/`<T`, e cobertura por dois denominadores diferentes |
| `04-trilha-palavras.mjs` | recontagem das palavras: duplicata, caixa, NFC/NFD, escrita |
| `05-glosas-cobertura.mjs` | glosa e frase traduzida **por par**, não global |
| `06-telas-e-rotas.mjs` | censo de telas, quais traduzem, que fração o e2e cobre |
| `07-locale-e-caixa.mjs` | locale cravado, `toLowerCase()` sem locale, classes direcionais |
| `08-bundle.mjs` | peso do `dist/`, entrada real lida do HTML, projeção de catálogos |
| `09-divida-de-codigo.mjs` | plurais no código, template literals, texto rico, chaves de storage |
| `10-segmentacao.mjs` | erro da régua `contarPalavras` contra `Intl.Segmenter` |
| `11-desenclitico-e-amostra.mjs` | falso positivo do desenclítico; IC e poder da amostra de 60 |
| `12-normalizacao-e-frases.mjs` | consistência NFC/NFD ingestão × runtime; idioma das frases |
| `13-censo-de-cobertura.mjs` | censo por superfície (aria-label, title, servidor, meta) e por área |
| `14-estresse-por-escrita.mjs` | turco/caixa, ordenação, grafema, zh-Hans×Hant, fontes |
| `montar-fixture-gate.mjs` | monta dados ruins para provar que o gate de publicação reprova |

## Os gates do repositório, cronometrados

```bash
npm run typecheck                                          # exit 0 · 15 s
npm run typecheck:core
npm run lint                                               # exit 0 · 9 s · 35 avisos, 0 erros
npm test                                                   # exit 0 · 49 s · 2775 passando, 1 pulado, 273 arquivos
npm run build                                              # exit 0 · 14 s
node scripts/i18n/pseudo.mjs --check                       # exit 0 · 693 chaves em dia
node scripts/i18n/orfas.mjs --progresso                    # 0 órfãs · 373 t() · ~3146 literais
npm run audit:gate                                         # exit 1 · FALHA (browserslist HIGH)
./node_modules/.bin/ast-grep test -c sgconfig.yml          # exit 0 · 6 regras passando
./node_modules/.bin/ast-grep scan -c sgconfig.yml src server server.ts   # exit 0 · 3 avisos
npx playwright test                                        # exit 0 · 233 s · 14 passando
```

## Instalação limpa (isolada)

O `node_modules` do worktree é **symlink** para o do checkout principal: um `npm ci` aqui
apagaria as dependências da outra frente de trabalho. Por isso a instalação limpa foi medida
num clone separado:

```bash
git clone --depth 1 --branch multi-idioma --single-branch . "$SCRATCH/clone-limpo"   # 3 s · 46 MB
cd "$SCRATCH/clone-limpo" && npm ci --no-audit --no-fund                             # 62 s · 842 pacotes · exit 0
du -sh node_modules                                                                  # 1,4 GB
```

## Medidas pontuais coladas no relatório

```bash
# tamanho exato do dist, em bytes reais (du arredonda e esconde a diferença que importa)
node -e "const {readdirSync,statSync}=require('fs'),{join}=require('path');function s(d){let t=0,n=0;for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory()){const r=s(p);t+=r.t;n+=r.n}else{t+=statSync(p).size;n++}}return{t,n}};for(const d of ['dist','dist/assets']){const r=s(d);console.log(d,(r.t/1048576).toFixed(2)+' MiB',r.n+' arquivos')}"

# a entrada real do app: o que dist/index.html referencia
grep -oE '(src|href)="/assets/[^"]*"' dist/index.html

# o vazamento de escrita no turco, por faixa
node -e "const d=require('./public/trilha/tr.json');for(const n of Object.keys(d.niveis)){const f=d.niveis[n].filter(i=>!/\p{Script=Latin}/u.test(i[0])).length;console.log(n,f,'de',d.niveis[n].length)}"

# a regra ast-grep locale-cravado NÃO pega Intl.NumberFormat com locale literal
grep -n "Intl.NumberFormat" src/components/Honestidade.tsx
./node_modules/.bin/ast-grep scan -c sgconfig.yml src/components/Honestidade.tsx   # sem achado

# o que cada tela importa de lib/i18n (importar ≠ traduzir)
for f in src/components/views/*.tsx; do grep -oE "import \{[^}]*\} from '[^']*lib/i18n'" "$f" | head -1 | sed "s|^|$(basename $f .tsx): |"; done
```

## Fase 1 — o gate de publicação, testado com fixture

O gate (`scripts/trilha/verificar.mjs`) foi copiado sem alteração para uma árvore mínima no
scratchpad, com dados deliberadamente ruins. Nada foi escrito no repositório.

```bash
# monta a árvore e roda o gate real contra ela
node "$SCRATCH/montar-fixture-gate.mjs" "$SCRATCH/fixture-gate" '[
 {"lang":"ru","porFaixa":100,"limpa":{"boa":"слово","sujo":"word"},"suja":0.02,"taxaGlosa":0.50},
 {"lang":"ja","porFaixa":100,"limpa":{"boa":"言葉","sujo":"word"},"suja":0.30,"taxaGlosa":0.50},
 {"lang":"zh","porFaixa":100,"limpa":{"boa":"词","sujo":"word"},"suja":0.02,"taxaGlosa":0.02},
 {"lang":"tr","porFaixa":100,"limpa":{"boa":"kelime","sujo":"كلمة"},"suja":0.50,"taxaGlosa":0.50}
]'
node "$SCRATCH/fixture-gate/scripts/trilha/verificar.mjs"
# → ja e zh REPROVAM (exit 1); tr passa com 50% de escrita árabe
```

## Fase 1 — o parâmetro `?ui=`, testado em navegador

```bash
PORT=3105 npx tsx server.ts &      # servidor próprio, para não tocar no que já estiver de pé
```

Depois, com Playwright:

```js
await page.goto('http://localhost:3105/jogar?ui=../../termos.html%3f');
// rede: GET http://localhost:3105/termos.html?.json → 200 OK

await page.goto('http://localhost:3105/ajustes?ui=../../trilha/es');
await page.evaluate(() => document.documentElement.lang);
// → "../../trilha/es"
await page.evaluate(() => { try { (1234.5).toLocaleString(document.documentElement.lang) } catch (e) { return e.message } });
// → "Incorrect locale information provided"
```

Evidência: `evidencias/ui-param/ajustes-locale-envenenado.png`.

## Ressalvas de método, declaradas

- **O denominador de cobertura não é exato, e nenhum denominador seria.** O do repo
  (`scripts/i18n/orfas.mjs:52`) conta literais com acento sobre o código concatenado:
  superestima (pega JSDoc, prompt de LLM, chave de `localStorage`) e subestima ("Voltar",
  "Salvar", "Idioma" não têm acento). O meu conta nó de texto JSX e atributo visível, com
  comentários removidos: erra menos no ruído e mais na string montada em variável. Reporto
  os dois. A divergência (11,9% × 17,1%) é o intervalo honesto.
- **`rtk` intercepta comandos de shell** e às vezes filtra a saída. Onde a contagem importava,
  confirmei com uma segunda forma do mesmo comando.
- **`du -sh` arredonda**: `dist/assets` aparece como "28M" e são 27,66 MiB. A conta em bytes
  acima é a que vale.
