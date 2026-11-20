# Audiolivros Fases 0–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decidir o motor de voz com número e ouvido, montar a bancada `scripts/eval-voz/` e o pré-processador pt-BR, e entregar o piloto de 10 livros pt pré-gerados (Opus no R2 de staging) tocando sincronizados no leitor, atrás da flag `audiolivros` desligada.

**Architecture:** Gerar uma vez, offline, frase a frase (a duração do clipe vira o tempo) e servir do R2; o cliente toca o áudio dentro do `Narrador` existente (mesma máquina de estados, mesmo "Ouvir", mesmo destaque), com o hash das frases do capítulo como trava e o narrador local como queda. A decisão do motor sai da F0 por critério numérico (spec 6.4) + ouvido do dono; tudo de motor fica atrás da interface `Sintetizador`.

**Tech Stack:** TypeScript (`src/core` puro), Vitest (`tests/*.test.ts`), Playwright (`tests/e2e/*.e2e.ts`), scripts `.mjs` rodados com `npx tsx`, Whisper (`@huggingface/transformers`, como `scripts/eval-fala`), `ffmpeg` do sistema com `libopus` (só no lote, não distribuído), Cloudflare R2, Drizzle/PG.

**Spec:** `docs/specs/2026-10-31-audiolivros-e-leitura.md` (citada como "spec §N"). Também: `openspec/changes/audiolivros/{proposal,design,tasks}.md`, `docs/runbooks/audiolivros.md`, relatório de pesquisa `reports/Audiolivros e leitura soluções atuais.md` (worktree `pendencias-ao-alcance`).

## SUPOSIÇÕES (confirmar na Task 2)

O dono mandou usar as respostas sugeridas pela spec §12. Onde a spec não escreve uma resposta explícita, vai a que ela implica, marcada "(implícita)". Nenhuma outra foi inventada.

1. **Escopo do primeiro lote:** piloto de **10 livros pt** (spec §11/F2), ~72 h; en/es só entram na bancada (14 frases pt + mesmas categorias em en/es), não no lote. (implícita: §8.1 e §11)
2. **Elenco no MVP:** **não manda na escolha do motor**. Decisão provisória da §4.2: Qwen3 como alvo, Chatterbox como atalho; o portão "≥ 4 timbres, acerto ≥ 80%" (§6.4 item 4) só vale "se o objetivo T3 for mantido"; sem ele, T3 usa narrador + 2 vozes. (implícita)
3. **Catálogo ouvido no Grátis:** **Sim** (§12 item 3, "Proponho Sim"); elenco e nuvem no pago. Sem alterar `src/core/planos.ts` nesta entrega.
4. **Quais 10 livros:** sugestão da §12 item 4: os mais populares do pt **com classificação aprovada** (Dom Casmurro, Os Lusíadas, Memórias Póstumas, O Guarani, A Escrava Isaura + 5 por popularidade em `public/catalogo/livros.json`); o dono escolhe e decide ortografia original × modernizada. A lista final entra em `scripts/audiolivros/piloto.json` (Task 22).
5. **Quem escuta e aprova:** dono **+ 3 a 5 convidados** (1 jovem do público, com consentimento do responsável e só apelido), §7.3 e §12 item 5; **tetos de teste da F0: US$ 5 de GPU (ou 6 h de GPU, o que vier primeiro) e US$ 2 de DeepInfra** (§8.5; confirmados pelo dono neste pedido).

## Global Constraints

- Formato: **Opus em WebM/Ogg, mono, 32 kbps** (confirmar na bancada 24/32/48 kbps); AAC 48 kbps como 2ª faixa só se o Safari falhar (spec 6.2).
- Chave R2: `audiolivros/<livroId>/<voz>/<versao>/<nn>.opus` e `<nn>.json`; `manifesto.json` por livro/voz; imutável por versão; buckets `frasy-audio` e `frasy-audio-staging`; `VITE_AUDIO_URL` abre o `connect-src`.
- Tempos `{i, t0, t1}` por frase, a duração do clipe é o tempo (sem alinhador); índice `i` = o de `frasesDoTexto` do app (teto 600 caracteres).
- Limiares automáticos (spec 7.2) pt/en/es: CER ≤ 3,0% / 2,0% / 3,0%; WER ≤ 8,0% / 5,0% / 7,0%; itens difíceis ≥ 85% / 90% / 90% (números e anos 100%); texto longo 10 min inserções+deleções ≤ 1,0%; duração/caractere fora de ±30% da mediana ≤ 3%; frase sem áudio/truncada/repetida = 0 (regera até 2 vezes); **RTF ≤ 0,5**. PROPOSTA a calibrar na F0.
- Escuta (spec 7.3): naturalidade média ≥ 3,5/5; "aguentaria 30 min" ≥ 60%; nenhum erro grave repetido em ≥ 2 ouvintes; melhor que a voz do aparelho em ≥ 0,5 ponto; ≥ 4 timbres distinguíveis com acerto ≥ 80% (só se T3 mantido). Regra final: **passa no limiar E o dono aprova**; número bom nunca aprova sozinho.
- Desempenho: **1º áudio p95 ≤ 1,5 s** (CDN), destaque da frase **≤ 300 ms** do `t0`, pós-F2 falha de carga ≤ 1%.
- Custo: teto F0 **US$ 5 GPU + US$ 2 DeepInfra**; estourar pede decisão do dono; R2 a US$ 0,015/GB-mês é ESTIMATIVA (confirmar em developers.cloudflare.com/r2/pricing).
- Regras duras: **sem Gemini** como provedor de produto; só provedor com retenção zero; **sem clonagem** (Qwen3 "Base" e caminho de referência do Chatterbox desligados; reusar `CAMPOS_DE_CLONAGEM`); nada AGPL/GPL/NC embutido no caminho distribuído sem parecer; **Kokoro/Piper só como referência** até o parecer do espeak-ng; juiz por LLM (`claude -p`/`agy -p`, nunca créditos de API) **só para texto**, nunca naturalidade.
- Menores protegidos: áudio só para quem vê o livro (`visivelPara`); sem telemetria de escuta de menor; **produção FECHADA**: ligar flag e criar bucket/domínio é ato do dono.
- Cotas e planos só em `src/core/planos.ts` (não tocar nesta entrega). `src/core` puro: sem React/rede/DOM e **sem `URL`/`TextDecoder` globais** (usar `globalThis` como `src/core/livros/manifesto.ts`; `npm run typecheck:core`).
- Textos de UI em pt-BR via `t()` ("Ouvir", chip "Voz sintetizada", "Baixar este capítulo (≈ 6 MB)…", erro "Não conseguimos tocar este capítulo agora. Vamos ler com a voz do seu aparelho.").
- Flags nascem desligadas, `regras = '{}'`, semente idempotente `ON CONFLICT DO NOTHING`; flag desligada = nenhum chunk, rota ou requisição ao CDN novo.
- Gate de CI (rodar antes de cada fechamento de fase): `npm run typecheck` · `npm run typecheck:core` · `npm run typecheck:estrito` · `npm run lint` (`--max-warnings 0`) · `npm test` · `node scripts/i18n/pseudo.mjs --check` · `npm run i18n:orfas` · `node scripts/i18n/cobertura.mjs --check` · `npm run morto:arquivos` (knip) · `npm run morto:ciclos`. `sharp` idêntico (`^0.35.4`) em `devDependencies` e `overrides` (não mexer). Nenhuma dependência nova de npm nesta entrega.
- Commits em inglês, rodapé `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git pull --rebase` antes de qualquer push (do dono).

## Review Focus

Entradas e falhas que a spec implica e nenhuma tarefa testaria sozinha, mais provável primeiro. A coluna da direita é a tarefa que fixa o teste.

1. **Texto do livro mudou depois da geração** (hash das frases ≠ manifesto): o áudio não toca, lê o narrador local, sem destaque desalinhado → T14 (validador/hash), T25 (teste `cai no narrador quando o hash não bate`).
2. **As frases do app ≠ as frases do gerador** (DOM do navegador × linkedom no Node, `Intl.Segmenter` por versão do ICU): o índice `i` desalinha em silêncio → T16 (teste de paridade com capítulo de fixture).
3. **Áudio sem rede / R2 fora do ar / 404 / Safari sem Opus**: mensagem do spec 9.4 e leitura pela voz do aparelho, sem silêncio → T23 (`escolherFaixa`, timeout), T25 (queda), T27 (e2e com `route.abort`).
4. **Capítulo vazio ou só imagem**: entra no manifesto com `frases: 0`, sem arquivo; a fila pula, não trava → T14, T17, T24.
5. **Travessão `--` (grafia antiga), `—`, ordinal/romano/data/moeda**: o motor não lê "dois-traços" nem "I V" → T3, T4.
6. **Frase longa demais para o motor**: o gerador divide no mesmo teto 600 do app (índice igual) e o adaptador sub-divide e emenda se `limiteDeCaracteres` for menor → T5, T17.
7. **Usuário menor / livro não visível**: sem "Ouvir" gravado, sem telemetria, sem requisição ao CDN → T22, T26, T27.
8. **Kill-switch (flag desliga) durante a reprodução**: a frase atual termina, a seguinte cai no narrador local, nada novo é carregado → T25.
9. **Duas abas tocando o mesmo áudio**: a segunda pausa a primeira (um "Ouvir" ativo por aparelho) → T24.

## File Structure

- `src/core/leitura/`: `numerosPt.ts`, `prepararTextoParaVoz.ts` (F1b), `audiolivro.ts` (contrato do manifesto, `hashDasFrases`, `frasePorTempo`, `temposDasFrases`) — puro.
- `src/lib/leitor/audiolivro/`: `faixa.ts`, `manifesto.ts`, `capituloOffline.ts`, `reprodutor.ts` — rede, cache, `<audio>`.
- `src/lib/leitor/narrador.ts` (modificar), `src/components/views/leitor/{BarraDoNarrador.tsx,LeitorDoLivro.tsx}` (modificar), `ChipVozSintetizada.tsx`, `BotaoBaixarCapitulo.tsx` (novos, em chunk lazy).
- `scripts/eval-voz/` (bancada), `scripts/audiolivros/` (interface `Sintetizador`, lote, conferência), `server/db/migrations-pg/<próximo>_flags_audiolivros.sql`.
- Testes: `tests/preprocessador-voz-*.test.ts`, `tests/audiolivro-*.test.ts`, `tests/eval-voz-*.test.ts`, `tests/e2e/audiolivros.e2e.ts`.

---

## Fase 0: spike e decisão do motor

### Task 1: Consulta jurídica (espeak-ng/WASM) [F0, manual, não bloqueia]

**Files:** Create `docs/pesquisa/2026-11-xx-audiolivros-consulta-juridica.md`.
**Interfaces:** Produces: o arquivo com a pergunta enviada e a data; a resposta (quando vier) alimenta G1.

- [ ] **Step 1:** Escrever no arquivo a pergunta **exata** da spec 6.4: "Distribuir ao navegador um WASM derivado de espeak-ng (GPL-3.0), carregado em Web Worker por um app React com outra licença, é obra combinada ou agregação? E rodar o espeak-ng/Piper/Kokoro apenas no nosso servidor, entregando só áudio gerado, cria alguma obrigação sobre o áudio ou o código?", com a nota "Não é parecer; a F0 testa só motores sem espeak-ng".
- [ ] **Step 2:** O dono envia ao jurídico. **Aceite:** campo "Enviada em: <data>" preenchido; resposta pendente não bloqueia nenhuma tarefa.
- [ ] **Step 3:** `git add docs/pesquisa/2026-11-xx-audiolivros-consulta-juridica.md && git commit -m "docs(audiolivros): record the espeak-ng legal question"`.

### Task 2: Registrar e confirmar as suposições com o dono [F0, manual]

**Files:** Modify `docs/specs/2026-10-31-audiolivros-e-leitura.md` (topo, bloco "Respostas do dono"); Modify `openspec/changes/audiolivros/tasks.md` (marcar 0.2).
**Interfaces:** Produces: as 5 respostas fixas que as Tasks 22 e 28 consomem (lista dos 10 livros, ouvintes).

- [ ] **Step 1:** Copiar a seção "SUPOSIÇÕES" deste plano para o topo da spec como "Respostas do dono (31/10/2026)", com as marcas "(implícita)".
- [ ] **Step 2:** O dono confirma ou corrige cada uma. **Aceite:** cinco linhas sem "(implícita)" ou com a correção; item 4 traz os 10 ids `pg-…`/`se-…` reais do catálogo.
- [ ] **Step 3:** `npx prettier --check docs/specs/2026-10-31-audiolivros-e-leitura.md`, commit `docs(audiolivros): record owner answers to the open questions`.

---

## Fase 1 (parte pré-requisito do spike): pré-processador e bancada mínima

> Ordem de execução ≠ ordem das fases: o roundtrip do spike normaliza números com o mesmo pré-processador, então as tarefas 3–10 (F1) vêm antes de rodar a F0 (tarefas 11–12). A F0 continua sendo o portão: **nada de F2 antes da tarefa 12**.

### Task 3: Pré-processador pt-BR, parte A: números, ordinais, romanos, moeda, datas [F1b]

**Files:** Create `src/core/leitura/numerosPt.ts`; Test `tests/preprocessador-voz-numeros.test.ts`.
**Interfaces:**

- Produces: `cardinalPt(n: number, genero?: 'm'|'f'): string` (0 a 999 999 999 999); `ordinalPt(n: number, genero?: 'm'|'f'): string` (1 a 999); `romanoParaNumero(s: string): number | null` (`null` se não for romano canônico); `moedaPt(reais: number, centavos: number, moeda: 'BRL'|'USD'): string`; `dataPt(dia: number, mes: number, ano: number | null): string`.

- [ ] **Step 1: Write the failing test** com `it.each` (≥ 40 casos, nomes `cardinalPt: <entrada>`): `0`→"zero"; `1`→"um" (`f`: "uma"); `21`→"vinte e um"; `100`→"cem"; `101`→"cento e um"; `200`→"duzentos"; `1000`→"mil"; `1001`→"mil e um"; `1100`→"mil e cem"; `1889`→"mil oitocentos e oitenta e nove"; `2024`→"dois mil e vinte e quatro"; `1000000`→"um milhão"; `2000000`→"dois milhões"; `1000001`→"um milhão e um"; ordinais `1`→"primeiro" (`f`: "primeira"), `10`→"décimo", `21`→"vigésimo primeiro", `100`→"centésimo"; romanos `IV`→4, `XIX`→19, `MCMXC`→1990, `IIII`→`null`, `ABC`→`null`, `""`→`null`; moeda `(1234,56,'BRL')`→"mil duzentos e trinta e quatro reais e cinquenta e seis centavos", `(1,0,'BRL')`→"um real", `(0,50,'BRL')`→"cinquenta centavos", `(5,0,'USD')`→"cinco dólares", `(1000000,0,'BRL')`→"um milhão de reais"; datas `(12,3,1889)`→"doze de março de mil oitocentos e oitenta e nove", `(1,5,null)`→"primeiro de maio", `(2,5,null)`→"dois de maio".
- [ ] **Step 2: Run** `npx vitest run tests/preprocessador-voz-numeros.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** as funções acima em `src/core/leitura/numerosPt.ts`, sem `Intl`/DOM; tabelas de unidades/dezenas/centenas e a regra do "e" (entre classes e depois de "mil" quando o resto é < 100 ou centena redonda). Ordinal: tabelas de unidades/dezenas/centenas. Dia 1 é ordinal ("primeiro"), demais dias cardinais.
- [ ] **Step 4: Run** o arquivo + `npm run typecheck:core` → PASS.
- [ ] **Step 5: Commit** `feat(core): add pt-BR number, ordinal, roman, currency and date words`.

### Task 4: Pré-processador pt-BR, parte B: `prepararTextoParaVoz` [F1b]

**Files:** Create `src/core/leitura/prepararTextoParaVoz.ts`; Test `tests/preprocessador-voz-texto.test.ts`.
**Interfaces:**

- Consumes: Task 3.
- Produces: `export type IdiomaDeVoz = 'pt'|'en'|'es'`; `export interface OpcoesDoPreparo { dicionario?: Readonly<Record<string, string>>; ortografia?: 'original'|'modernizada' }`; `export function prepararTextoParaVoz(texto: string, idioma: IdiomaDeVoz, opcoes?: OpcoesDoPreparo): string`; `export const VERSAO_DO_PREPROCESSADOR = '1'` (vai ao manifesto).

- [ ] **Step 1: Write the failing test** (≥ 35 casos; somados à Task 3, **≥ 60**; os dois arquivos casam com `tests/preprocessador-voz*.test.ts`):
  - números no texto: "em 1889" → "em mil oitocentos e oitenta e nove"; "1.234,56" → "mil duzentos e trinta e quatro vírgula cinquenta e seis"; "50%" → "cinquenta por cento"; "R$ 1.234,56" → texto da moeda; "12/03/1889" → data por extenso; "1º de maio" → "primeiro de maio"; "2ª" → "segunda".
  - romanos só com gatilho (`capítulo|século|tomo|livro|parte|canto|ato|cena|volume`, ou nome próprio capitalizado antes): "Capítulo IV" → "Capítulo quatro"; "século XIX" → "século dezenove"; "Pedro II" → "Pedro segundo"; "Luís XIV" → "Luís catorze" (ordinal até 10, cardinal de 11 em diante); **negativos**: "MIL" solto, "Vi" e "DI" ficam; "I" em `en` nunca muda.
  - siglas: "CPF" → "cê pê efe"; "USP" → "u ésse pê"; "IBGE" → "i bê gê é"; "ONU" e "NASA" ficam (lista `SIGLAS_PRONUNCIAVEIS`).
  - abreviações: "Sr." → "Senhor", "Sra." → "Senhora", "Dr." → "Doutor", "etc." → "etcétera", "cap." → "capítulo", "nº 5" → "número cinco".
  - travessão: `--Bom dia, disse ele.` → `Bom dia, disse ele.`; `—Vamos?` → `Vamos?`; `- Vamos?` no início de linha → `Vamos?`; `Ela --a Capitu-- sorriu` → `Ela, a Capitu, sorriu`; "guarda-chuva" intacto; "—" no meio de frase vira ", ".
  - reticências: "Bem..." → "Bem…"; "Não sei.... talvez" → "Não sei… talvez"; "…" intacto.
  - `dicionario: { Capitu: 'Capitú' }` troca palavra inteira preservando maiúscula inicial; `ortografia: 'modernizada'`: "annos"→"anos", "hontem"→"ontem", "immenso"→"imenso", "tambem"→"também"; sem a opção ('original') nada muda.
  - `en`/`es`: só regras neutras (travessão, reticências, espaços); "1889" e "Dr." ficam; vazio e só espaços → "".
  - **idempotência:** `f(f(x)) === f(x)` para 10 entradas dos casos acima.
- [ ] **Step 2: Run** `npx vitest run tests/preprocessador-voz-texto.test.ts` → FAIL.
- [ ] **Step 3: Implement** `prepararTextoParaVoz` em `src/core/leitura/prepararTextoParaVoz.ts` como pipeline de regras puras na ordem: dicionário → ortografia → travessão → reticências → moeda/data/% → ordinais → romanos → números → abreviações → siglas → espaços. Tabelas `ABREVIACOES`, `SIGLAS_PRONUNCIAVEIS`, `MODERNIZACAO` e `NOMES_DAS_LETRAS` exportadas só se um teste as usar (knip). Travessão no início da linha ou da string é removido; `--` ou `—` no meio vira `, `.
- [ ] **Step 4: Run** `npx vitest run tests/preprocessador-voz` + `npm run typecheck:core && npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(core): add prepararTextoParaVoz with 60+ pt-BR cases`.

### Task 5: Interface `Sintetizador` e adaptadores [F1c]

**Files:** Create `scripts/audiolivros/sintetizador.mjs`, `scripts/audiolivros/wav.mjs`; Test `tests/audiolivros-sintetizador.test.ts` (importa de `../scripts/audiolivros/…` como `tests/release.test.ts`).
**Interfaces:**

- Consumes: `CAMPOS_DE_CLONAGEM` de `server/ai/provedoresDeVoz.ts`.
- Produces (JSDoc `@typedef`): `ClipeDeAudio = { wav: Uint8Array; duracaoS: number; taxaHz: number; tempoDeSinteseS: number }`; `Sintetizador = { id: string; versao: string; idiomas: string[]; limiteDeCaracteres: number; vozes(): Promise<{id: string; idioma: string}[]>; sintetizar(texto: string, o: { voz: string; idioma: string; velocidade?: number }): Promise<ClipeDeAudio>; fechar?(): Promise<void> }`; `criarSintetizadorHttp({ id, versao, url, limiteDeCaracteres?, tokenEnv? }): Sintetizador` (contrato: `POST {url}/sintetizar {texto, voz, idioma}` → `audio/wav` + cabeçalho `X-Tempo-Sintese`; `GET {url}/vozes`); `criarSintetizadorDeepInfra({ modelo, voz }): Sintetizador` (chave só de `process.env.DEEPINFRA_API_KEY`, corpo conferido contra `CAMPOS_DE_CLONAGEM`); `criarSintetizadorFalso({ duracaoPorCaractereS?, limiteDeCaracteres? }): Sintetizador` (WAV de silêncio de duração determinística); `sintetizarComLimite(s: Sintetizador, texto: string, o): Promise<ClipeDeAudio>`; em `wav.mjs`: `duracaoDoWav(wav: Uint8Array): number`, `emendarWavs(clipes: Uint8Array[], pausaS: number): Uint8Array`.

- [ ] **Step 1: Write the failing test:** (a) falso devolve `duracaoS === texto.length * 0.06` ±1 ms e `duracaoDoWav` concorda; (b) `sintetizarComLimite` com `limiteDeCaracteres: 100` e 250 caracteres chama `sintetizar` 3 vezes (corte em pontuação/espaço) e `duracaoS` = soma das 3 + 2 × pausa; (c) `criarSintetizadorDeepInfra` lança "campo de clonagem de voz no pedido" quando o corpo traz `reference_audio`/qualquer item de `CAMPOS_DE_CLONAGEM` e não lê a chave de arquivo; (d) `criarSintetizadorHttp` com `fetch` injetado devolve `ClipeDeAudio` e `tempoDeSinteseS` do cabeçalho.
- [ ] **Step 2: Run** `npx vitest run tests/audiolivros-sintetizador.test.ts` → FAIL.
- [ ] **Step 3: Implement** os módulos acima (WAV PCM 16-bit mono; `fetch` injetável por parâmetro `{ fetch }` para teste). Nenhum adaptador de GPU específico: o servidor de cada candidato só precisa honrar o contrato HTTP (Task 11).
- [ ] **Step 4: Run** o teste + `npm run morto:arquivos` (os scripts entram por `scripts/**/*.mjs`) → PASS.
- [ ] **Step 5: Commit** `feat(audiolivros): add engine-agnostic Sintetizador interface and adapters`.

### Task 6: Corpus de frases e gabarito (`montar-frases.mjs`) [F1a]

**Files:** Create `scripts/eval-voz/montar-frases.mjs`, `scripts/eval-voz/fontes/` (trechos de domínio público com origem e licença no cabeçalho de cada arquivo), gerado `scripts/eval-voz/corpus-voz.jsonl`; Test `tests/eval-voz-corpus.test.ts`.
**Interfaces:**

- Produces: linha do JSONL `{ id: string; idioma: 'pt'|'en'|'es'; texto: string; categoria: string; itens: { texto: string; aceita: string[]; tipo: 'nome'|'numero'|'sigla'|'ano' }[] }`; `lerCorpus(caminho: string): CorpusItem[]` exportada de `scripts/eval-voz/comum.mjs`.

- [ ] **Step 1: Write the failing test:** o corpus tem **exatamente 14 itens `pt`** com as categorias da spec §7.1 (Dom Casmurro cap. I, cap. V, diálogo com "--", Eça, soneto, números, romanos/ordinais, siglas, nomes estrangeiros, estrangeirismo, homógrafos, frase longa, entonação, reticências); ≥ 1 item em `en` e em `es` por categoria aplicável; ids únicos; todo item com `itens[]` tem `aceita` não vazio (formas por extenso e em dígitos); a frase "longa" tem > 600 caracteres; nenhum texto é de obra protegida (cada fonte tem `licenca: 'dominio-publico'` no cabeçalho).
- [ ] **Step 2: Run** `npx vitest run tests/eval-voz-corpus.test.ts` → FAIL.
- [ ] **Step 3: Implement** `montar-frases.mjs` (lê `fontes/*.txt` com cabeçalho `# id | idioma | categoria | licenca`, escreve o JSONL; gabarito dos itens difíceis em `fontes/gabarito.json`, escrito à mão e revisado pelo dono).
- [ ] **Step 4: Run** `npx tsx scripts/eval-voz/montar-frases.mjs && npx vitest run tests/eval-voz-corpus.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(eval-voz): add 14-sentence pt corpus with hard-item gabarito`.

### Task 7: Roundtrip Whisper com WER/CER e itens difíceis [F1a]

**Files:** Create `scripts/eval-voz/medir-roundtrip.mjs`, `scripts/eval-voz/comum.mjs` (funções puras); Test `tests/eval-voz-roundtrip.test.ts`.
**Interfaces:**

- Consumes: `normalizarPt`, `agregar` de `src/core/eval/wer.ts`; `prepararTextoParaVoz` (Task 4); `ClipeDeAudio` (Task 5).
- Produces: `normalizarParaComparar(texto: string, idioma: IdiomaDeVoz): string` (**a mesma função nos dois lados**: `normalizarPt(prepararTextoParaVoz(texto, idioma))`, sem acento removido); `medirTrecho(ref: string, hip: string, idioma): { wer: number; cer: number }`; `acertoDosItens(hip: string, itens: CorpusItem['itens']): { acertos: number; total: number; porTipo: Record<string, [number, number]> }`; `avaliarContraLimiares(medidas, limiares): { passou: boolean; falhas: string[] }`.

- [ ] **Step 1: Write the failing test:** (a) "em 1889" na referência e "em mil oitocentos e oitenta e nove" na hipótese dão WER 0 (números por extenso dos dois lados); "R$ 5" × "cinco reais" também 0; (b) hipótese com uma palavra trocada em 10 dá WER 0,10; (c) `acertoDosItens` conta "Capitu" (nome) errado como 0/1 e ano com `aceita` em dígitos ou por extenso como 1/1; (d) `avaliarContraLimiares` reprova CER 3,1% em pt e aprova 3,0%, reprova "números e anos" < 100%.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** as funções puras em `comum.mjs` e o CLI `medir-roundtrip.mjs --motor <id> --voz <id> --entrada <dir de wavs>` que roda Whisper com **as mesmas opções de `scripts/eval-fala/medir-wer.mjs`** (`condition_on_previous_text=false`, corte de silêncio nas pontas) e grava `docs/auditoria/eval/voz-<motor>-<voz>.json`.
- [ ] **Step 4: Run** o teste → PASS.
- [ ] **Step 5: Commit** `feat(eval-voz): add roundtrip WER/CER with symmetric normalization and hard items`.

### Task 8: Sintetizar, RTF e estabilidade [F1a]

**Files:** Create `scripts/eval-voz/sintetizar.mjs`, `scripts/eval-voz/medir-estabilidade.mjs`; Modify `scripts/eval-voz/comum.mjs`; Test `tests/eval-voz-estabilidade.test.ts`.
**Interfaces:**

- Consumes: `Sintetizador`, `sintetizarComLimite` (Task 5).
- Produces: `rtf(tempoDeSinteseS: number, duracaoS: number): number`; `estabilidadeDoTrecho(ref: string, hip: string, idioma): { insercoes: number; delecoes: number; taxa: number }`; `foraDaMediana(frases: { id: string; duracaoS: number; caracteres: number }[], tolerancia = 0.3): { ids: string[]; fracao: number }`.

- [ ] **Step 1: Write the failing test:** `rtf(30, 60) === 0.5`; trecho de 100 palavras com 1 repetida → `insercoes: 1`, `taxa: 0.01`; 1 omitida → `delecoes: 1`; `foraDaMediana` marca a frase com duração/caractere 31% acima da mediana e não marca a de 29%; `fracao` = marcadas ÷ total.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** as três funções (alinhamento por palavras com a distância de edição já usada em `wer.ts`) e os CLIs: `sintetizar.mjs --motor <id> --voz <id> [--longo]` grava WAV por frase em `$CLAUDE_JOB_DIR/tmp/eval-voz/<motor>/` (fora do git), registra RTF e pico de memória (`process.memoryUsage()` do servidor via cabeçalho `X-Memoria-MB` do contrato HTTP); `--longo` sintetiza o trecho de ~10 min.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(eval-voz): add synth runner with RTF and long-text stability metrics`.

### Task 9: Formulário de escuta cega e juiz de texto [F1a]

**Files:** Create `scripts/eval-voz/gerar-formulario.mjs`, `scripts/eval-voz/julgar-texto.mjs`; Test `tests/eval-voz-escuta.test.ts`.
**Interfaces:**

- Produces: `sortearCega(amostras: { motor: string; voz: string; arquivo: string }[], semente: number): { itens: { voz_cega: string; arquivo: string; ancora?: true; repetida?: true }[]; chave: Record<string, string> }` (inclui **1 âncora ruim** e **2 frases repetidas**; a chave `voz_cega → modelo` sai em arquivo separado); `lerCsvDeEscuta(csv: string): LinhaDeEscuta[]` com colunas exatas `ouvinte, idioma, frase_id, voz_cega, naturalidade, clareza, erros[], comentario` (`erros[]` = lista separada por `|`); `resumirEscuta(linhas, chave): Record<string, { naturalidade: number; aguenta30: number; errosGravesRepetidos: number; ouvintes: number }>`; `montarPromptDoJuizDeTexto(ref: string, hip: string): string` (só texto; a rubrica proíbe julgar naturalidade, prosódia ou timbre).

- [ ] **Step 1: Write the failing test:** mesma `semente` → mesma ordem; `chave` não aparece no HTML do formulário; 2 repetidas e 1 âncora presentes; `lerCsvDeEscuta` rejeita cabeçalho com coluna faltando; `resumirEscuta` calcula média 4,0 para notas [5,3] e `errosGravesRepetidos` = 1 quando o mesmo erro grave aparece em 2 ouvintes; o prompt do juiz contém "não avalie naturalidade" e nenhum caminho de áudio.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `julgar-texto.mjs` usa `claude -p`/`agy -p` como `scripts/avatar/juiz-elenco.mjs` (máx. 3 chamadas em paralelo, cache em `$CLAUDE_JOB_DIR/tmp/juiz-voz/`, **só texto de domínio público do corpus**, nunca créditos de API) e classifica a diferença em nome errado / número lido errado / omissão / repetição.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(eval-voz): add blind listening form, CSV summary and text-only LLM judge`.

### Task 10: Relatório, `limiares.json` e `recomendar` [F1a/F0]

**Files:** Create `scripts/eval-voz/relatorio.mjs`, `scripts/eval-voz/limiares.json`, `scripts/eval-voz/recomendar.mjs`; Test `tests/eval-voz-recomendar.test.ts`.
**Interfaces:**

- Consumes: `avaliarContraLimiares` (Task 7), `resumirEscuta` (Task 9).
- Produces: `limiares.json` com os valores da spec 7.2 e `"provisorio": true`; `recomendar(candidatos: Candidato[], limiares, idioma, opcoes: { t3Mantido: boolean }): { escolhido: string | null; motivos: Record<string, string[]> }` com `Candidato = { id; licencaLimpa: boolean; temComponenteGpl: boolean; medidas; rtf: number; ttfaP95S?: number; timbresDistinguiveis?: number; acertoTimbres?: number; naturalidade: number; aguenta30: number; errosGravesRepetidos: number; melhorQueAparelho: number }`; `relatorio.mjs --fase 0` imprime a tabela RTF/GB/CER/WER/vozes/duração por frase/GPL e a recomendação por idioma no formato de `docs/auditoria/eval/`.

- [ ] **Step 1: Write the failing test** (portões da spec 6.4, nesta ordem): reprova `temComponenteGpl: true` (motivo "GPL no caminho distribuído"); reprova `rtf: 0.51` e aprova `0.5`; reprova `ttfaP95S: 3.1` quando informado e aprova `3.0`; com `t3Mantido: true` reprova `acertoTimbres: 0.79`/`timbresDistinguiveis: 3`; entre os aprovados vence a maior `naturalidade`; **nenhum** passa → `escolhido: null` e motivo "opção 0 + T2" ; `naturalidade: 3.49` ou `aguenta30: 0.59` ou `melhorQueAparelho: 0.4` reprovam.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `recomendar` (função pura exportada) e os dois CLIs. `limiares.json` é lido por `avaliarContraLimiares`; não duplicar números em código.
- [ ] **Step 4: Run** `npx vitest run tests/eval-voz && npm run morto:arquivos` → PASS.
- [ ] **Step 5: Commit** `feat(eval-voz): add report, provisional thresholds and numeric engine recommendation`.

---

## Fase 0 (execução): medir, ouvir, decidir

### Task 11: Medir os candidatos nas 14 frases [F0, operacional; teto US$ 5 GPU + US$ 2 DeepInfra]

**Files:** Create `scripts/audiolivros/spike/servidor-<candidato>.py` (um por candidato, contrato HTTP da Task 5, rodado com `uv run`), `docs/pesquisa/2026-11-xx-audiolivros-spike-recibos.md` (recibos); Output `docs/auditoria/eval/voz-*.json`.
**Interfaces:** Consumes: Tasks 5–10. Produces: um JSON por candidato/voz com RTF, GB (VRAM/disco), CER/WER, itens, estabilidade.

- [ ] **Step 1: Guarda de custo.** Antes de alugar GPU registrar no arquivo de recibos: teto "US$ 5 ou 6 h de GPU (o que vier primeiro)" e "DeepInfra US$ 2 (≈ 37 h de áudio)". Chaves só em `.env`/secrets do host (`RUNPOD_API_KEY`, `DEEPINFRA_API_KEY`), nunca no repo.
- [ ] **Step 2: Subir os candidatos** numa RTX 4090 Community (US$ 0,34/h; **medir o RTF nela, não numa H200**): Qwen3-TTS CustomVoice 0,6B e 1,7B (vozes prontas; **modelo "Base"/clonagem desligado**), VoxCPM2, Piper `faber` (somente referência; GPL possível), Chatterbox pt-BR voz padrão **via perna DeepInfra** (`criarSintetizadorDeepInfra`; caminho de clonagem desligado). Web Speech entra **só na escuta cega** (a saída não é capturável em Node; WER n/a). Kokoro: medir só como referência, se houver tempo no teto.
- [ ] **Step 3: Rodar** por candidato: `npx tsx scripts/eval-voz/sintetizar.mjs --motor <id> --voz <v>` e `npx tsx scripts/eval-voz/medir-roundtrip.mjs …` e `--longo` para estabilidade; pt (14 frases) primeiro, en/es só se sobrar teto. Para cada um anotar: lista de vozes, se expõe duração por frase, se embute componente GPL, GB.
- [ ] **Step 4: Desligar a GPU** e colar o recibo (valor e horas). **Aceite:** soma ≤ US$ 5 GPU e ≤ US$ 2 DeepInfra; um JSON por candidato; `npx tsx scripts/eval-voz/relatorio.mjs --fase 0` imprime a tabela completa.
- [ ] **Step 5: Commit** `docs(audiolivros): record F0 engine measurements and receipts`.

### Task 12: Escuta cega, recomendação e portão da F0 [F0, manual do dono]

**Files:** Create `docs/pesquisa/2026-11-xx-audiolivros-spike.md`, `docs/pesquisa/2026-11-xx-audiolivros-escuta.csv` (+ chave em arquivo separado, fora do git até a decisão); Modify `openspec/changes/audiolivros/tasks.md` (1.1–1.3).
**Interfaces:** Produces: `motorDecidido` (id do `Sintetizador`, voz, bitrate) e a decisão sobre o Opus 24/32/48 kbps que a Task 17 consome.

- [ ] **Step 1:** `npx tsx scripts/eval-voz/gerar-formulario.mjs --fase 0` (3 a 5 vozes por idioma, mais Web Speech e a âncora); dono e 3 a 5 ouvintes preenchem o CSV (spec 7.3).
- [ ] **Step 2:** `npx tsx scripts/eval-voz/relatorio.mjs --fase 0 --escuta <csv> --chave <arquivo>` → recomendação por idioma pelo critério numérico (Task 10). Teste cego 24/32/48 kbps com Opus do mesmo trecho; escolher o menor bitrate sem diferença audível (padrão 32).
- [ ] **Step 3:** Escrever o relatório da F0 (RTF, GB, CER/WER, vozes, duração por frase, GPL, recomendação, recibo, custo do lote recalculado com o RTF medido: GPU-hora = horas de áudio × RTF × 1,2).
- [ ] **Step 4: Portão. Aceite:** o dono escreve "motor aprovado: <id>/<voz>" ou "nenhum aceitável: ficar em opção 0 + T2" no relatório. No segundo caso, **parar aqui**: as Tasks 14–28 não são executadas.
- [ ] **Step 5: Commit** `docs(audiolivros): F0 spike report and engine decision`.

### Task 13: Calibrar e travar os limiares [F1 fecha]

**Files:** Modify `scripts/eval-voz/limiares.json` (remover `provisorio`); Test `tests/eval-voz-limiares.test.ts`.

- [ ] **Step 1: Write the failing test:** `limiares.json` tem `provisorio` ausente e, por idioma, exatamente: CER 3,0/2,0/3,0; WER 8,0/5,0/7,0; itens 85/90/90 (números e anos 100); estabilidade 1,0; fora da mediana 3; sem áudio 0; RTF 0,5 — **ou** a alteração vem com `justificativa` escrita por campo (spec 7.2: "afrouxar só com justificativa").
- [ ] **Step 2: Run** → FAIL (arquivo ainda provisório).
- [ ] **Step 3:** Ajustar contra o baseline da F0 (Web Speech/Piper) com o dono; remover `provisorio`; registrar justificativas.
- [ ] **Step 4: Run** `npx vitest run tests/eval-voz-limiares.test.ts` + o pipeline completo de um motor: `time (npx tsx scripts/eval-voz/…)` **< 30 min** (aceite F1) → PASS.
- [ ] **Step 5: Commit** `feat(eval-voz): lock calibrated thresholds`.

---

## Fase 2: piloto de 10 livros, R2 e player

### Task 14: Contrato do manifesto e hash das frases [F2]

**Files:** Create `src/core/leitura/audiolivro.ts`; Test `tests/audiolivro-manifesto.test.ts`.
**Interfaces:**

- Consumes: `normalizarParaManifesto` de `src/core/livros/manifesto.ts`.
- Produces:

  - `export interface FraseComTempo { i: number; t0: number; t1: number }`
  - `export interface CapituloDeAudio { nn: number; duracaoS: number; bytes: number; sha256: string; frases: number; hashDasFrases: string }` (`frases: 0` ⇒ `bytes: 0`, `duracaoS: 0`, sem arquivo)
  - `export interface ManifestoDeAudio { versao: 1; livroId: string; idioma: string; voz: string; motor: string; versaoDoMotor: string; versaoDoPreprocessador: string; hashDoTexto: string; capitulos: CapituloDeAudio[]; criadoEm: string; rotulo: 'voz sintetizada'; licencaDoTexto: string; classificacao: string; formato: { codec: 'opus'|'aac'; kbps: number; canais: 1 }; elenco?: boolean }`
  - `export function hashDasFrases(frases: readonly string[]): Promise<string>` (SHA-256 de `frases.map(normalizarParaManifesto).join('\n')`, 16 hex; `globalThis.crypto.subtle`)
  - `export function hashDoLivro(hashesDosCapitulos: readonly string[]): Promise<string>`
  - `export function validarManifesto(bruto: unknown, livroId: string): { ok: true; manifesto: ManifestoDeAudio } | { ok: false; motivo: string }` (estrito: campo desconhecido, `rotulo` diferente, `canais !== 1`, `nn` repetido ou fora de ordem, `frases` negativo, `hashDoTexto` ≠ `hashDoLivro(capitulos.map(c => c.hashDasFrases))` → recusa)
  - `export function frasesIntegras(m: ManifestoDeAudio, nn: number, frasesDoApp: readonly string[]): Promise<boolean>`
  - `export function chaveDoCapitulo(m: Pick<ManifestoDeAudio,'livroId'|'voz'>, versao: number, nn: number, ext: 'opus'|'json'): string` → `audiolivros/<livroId>/<voz>/<versao>/<nn>.<ext>` (`nn` com 2 dígitos)

- [ ] **Step 1: Write the failing test:** manifesto válido passa; cada violação acima é recusada com `motivo` específico; capítulo `frases: 0` sem bytes é aceito; `frasesIntegras` é `true` com as mesmas frases, `false` se uma palavra mudou **ou** se duas frases trocaram de lugar **ou** se uma frase foi acrescentada; `hashDasFrases` ignora diferença de espaços (normalização) mas não de acento; `chaveDoCapitulo({livroId:'pg-1012',voz:'v1'},2,3,'opus')` = `audiolivros/pg-1012/v1/2/03.opus`.
- [ ] **Step 2: Run** `npx vitest run tests/audiolivro-manifesto.test.ts` → FAIL.
- [ ] **Step 3: Implement** em `src/core/leitura/audiolivro.ts` (sem `TextEncoder`/`URL` diretos: `globalThis`, como `manifesto.ts`).
- [ ] **Step 4: Run** o teste + `npm run typecheck:core` → PASS.
- [ ] **Step 5: Commit** `feat(core): add audiobook manifest contract, strict validation and sentence hash`.

### Task 15: Tempos por frase e busca por tempo [F2]

**Files:** Modify `src/core/leitura/audiolivro.ts`; Test `tests/audiolivro-tempos.test.ts`.
**Interfaces:**

- Produces: `temposDasFrases(clipes: readonly { duracaoS: number; fimDeParagrafo: boolean }[], pausas: { frase: number; paragrafo: number }): FraseComTempo[]` (pausa depois da frase, `paragrafo` quando `fimDeParagrafo`; `t0` da frase `k+1` = `t1` de `k` + pausa; a última não leva pausa); `frasePorTempo(tempos: readonly FraseComTempo[], t: number): number` (índice da frase cujo `[t0, t1 + pausa seguinte)` contém `t`; `-1` antes de `t0` da primeira; última se `t` passa do fim).

- [ ] **Step 1: Write the failing test:** clipes [2, 3, 1] s, pausas `{frase:0.2, paragrafo:0.4}`, `fimDeParagrafo` [false,true,false] → `{0,2.0}`, `{2.2,5.2}`, `{5.6,6.6}`; `frasePorTempo(…, 2.1)` = 0 (na pausa pertence à anterior), `2.2` = 1, `-0.1` = -1, `99` = 2; lista vazia → -1; 10 000 frases em < 5 ms por consulta (busca binária).
- [ ] **Step 2–4:** rodar (FAIL) → implementar (valores padrão de pausa vêm de `OPCOES_PADRAO_DA_NARRACAO`: 0 e 0,4 s; o chamador passa) → rodar (PASS).
- [ ] **Step 5: Commit** `feat(core): add per-sentence timing and time lookup for audiobooks`.

### Task 16: Paridade das frases entre o gerador (Node) e o app [F2]

**Files:** Create `scripts/audiolivros/capitulos.mjs`, `tests/fixtures/audiolivros/capitulo-paridade.xhtml`; Test `tests/audiolivro-paridade.test.ts` (`// @vitest-environment jsdom`).
**Interfaces:**

- Consumes: `textoDoDocumento` e `frasesDoDocumento` de `src/lib/leitor/frasesDoCapitulo.ts`, `frasesDoTexto` (teto 600).
- Produces: `frasesDoCapituloEpub(xhtml: string, idioma: string): { texto: string; fimDeParagrafo: boolean }[]` em Node (DOM via `linkedom`, já dependência do servidor; injeta `NodeFilter`), com **a mesma** extração de texto do app.

- [ ] **Step 1: Write the failing test:** o mesmo XHTML (parágrafos, `<h2>`, diálogo com "--", nota `<script>`/`<rt>`, frase de 900 caracteres, ponto sem espaço "fim.\nComeço") processado no jsdom pelo app e por `frasesDoCapituloEpub` dá **a mesma lista de textos e o mesmo `fimDeParagrafo`**, e a de 900 caracteres vira ≥ 2 pedaços nos dois lados.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `capitulos.mjs` reutilizando `textoDoDocumento`/`frasesDoTexto` por import (não reimplementar); se `textoDoDocumento` exigir `NodeFilter`/`document` globais, injetá-los do `linkedom` no script, sem editar `frasesDoCapitulo.ts`.
- [ ] **Step 4: Run** → PASS. Se divergir por versão de ICU, o teste fica vermelho: é o sinal pretendido.
- [ ] **Step 5: Commit** `test(audiolivros): pin sentence parity between generator and reader`.

### Task 17: Gerador de livro (`gerar-livro.mjs`) [F2]

**Files:** Create `scripts/audiolivros/gerar-livro.mjs`, `scripts/audiolivros/opus.mjs`; Test `tests/audiolivros-gerar.test.ts`.
**Interfaces:**

- Consumes: Tasks 4, 5, 14, 15, 16 e `motorDecidido` (Task 12).
- Produces: `gerarCapitulo(entrada: { frases: { texto: string; fimDeParagrafo: boolean }[]; idioma: string; voz: string; sintetizador: Sintetizador; opcoes: OpcoesDoPreparo; pausas: { frase: number; paragrafo: number }; tentativas?: number }): Promise<{ wavs: Uint8Array; tempos: FraseComTempo[]; falhas: number[] }>` (`tentativas` padrão **2** além da primeira; frase que falha 3 vezes entra em `falhas` e o capítulo **não é publicado**); `codificarOpus(wav: Uint8Array, kbps: number): Promise<{ bytes: Uint8Array; sha256: string }>` (`ffmpeg -c:a libopus -b:a <kbps>k -ac 1 -f webm`); CLI `npx tsx scripts/audiolivros/gerar-livro.mjs --livro <id> --voz <voz> --bucket frasy-audio-staging [--dry-run]`.

- [ ] **Step 1: Write the failing test** (com `criarSintetizadorFalso`, sem ffmpeg): ordem e `tempos` batem com as durações e pausas; cada frase vai a `prepararTextoParaVoz` antes do motor; sintetizador que falha 2 vezes e acerta na 3ª → capítulo ok; falha 3 vezes → `falhas: [i]` e nenhum arquivo escrito; capítulo com 0 frases → entrada `frases: 0` no manifesto, sem `.opus`; frase de 900 caracteres usa o **mesmo** corte de `frasesDoTexto` (índice igual ao do app) e o adaptador sub-divide se o limite do motor for menor; o manifesto final passa `validarManifesto`.
- [ ] **Step 2: Run** `npx vitest run tests/audiolivros-gerar.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Upload: `wrangler r2 object put` com o `node_modules/wrangler` (como `scripts/cloudflare/r2.mjs`); `--dry-run` escreve em `$CLAUDE_JOB_DIR/tmp/audiolivros/` (nunca no repo); `versao+1` ao regerar e ponteiro em `manifesto.json` trocado por último (atômico por livro). Registrar no manifesto `motor`, `versaoDoMotor`, `VERSAO_DO_PREPROCESSADOR`, `formato.kbps`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(audiolivros): add chapter generator with retries, timings and manifest`.

### Task 18: Conferência do lote (`conferir.mjs`) [F2]

**Files:** Create `scripts/audiolivros/conferir.mjs`; Test `tests/audiolivros-conferir.test.ts`.
**Interfaces:**

- Consumes: Tasks 7, 14. Produces: `conferirLivro(entrada: { manifesto: ManifestoDeAudio; temposPorCapitulo: FraseComTempo[][]; frasesDoLivro: string[][]; arquivos: { nn: number; bytes: number; sha256: string; kbps: number; canais: number }[] }): { ok: boolean; erros: string[] }`; CLI `npx tsx scripts/audiolivros/conferir.mjs --livro <id> [--roundtrip]` (com `--roundtrip` roda Whisper por capítulo e aplica `limiares.json`: **100% dos capítulos passam**).

- [ ] **Step 1: Write the failing test:** reprova frase sem tempo (0 frases sem áudio), `t1 <= t0`, tempos que se sobrepõem, `bytes`/`sha256` diferentes do manifesto, `kbps !== 32` ou `canais !== 1`, hash das frases ≠ o do app, capítulo `frases: 0` com arquivo; aprova o caso íntegro.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(audiolivros): add batch conformance checker`.

### Task 19: Buckets e domínio [F2, MANUAL do dono; não automatizar]

**Files:** Modify `scripts/cloudflare/r2.mjs` (acrescentar `frasy-audio` e `frasy-audio-staging` à lista `BUCKETS`, com o mesmo CORS de GET/HEAD de `frasy-livros`); Modify `docs/runbooks/audiolivros.md` (§1 e §3: número da migração, buckets, comando do kill-switch 3); Test `tests/cloudflare-buckets.test.ts` (ou o teste existente de `r2.mjs`, se houver).
**Interfaces:** Produces: nomes de bucket usados por `gerar-livro.mjs --bucket`.

- [ ] **Step 1: Write the failing test:** `r2.mjs --dry-run` lista os dois buckets novos e **não** os cria (só imprime).
- [ ] **Step 2–3:** FAIL → editar a lista `BUCKETS` → PASS.
- [ ] **Step 4: Ato do dono (manual).** `set -a; source .env; set +a; node scripts/cloudflare/r2.mjs --dry-run` e depois `node scripts/cloudflare/r2.mjs`; no painel Cloudflare ligar o acesso público (domínio próprio, ex. `audio.frasy.com.br`, com cache longo por versão) e anotar a URL como `VITE_AUDIO_URL` no host. **Aceite:** `curl -I <VITE_AUDIO_URL>/audiolivros/<livro>/<voz>/1/01.opus` responde `200` com `cache-control` longo (`immutable`) e `access-control-allow-origin` para a origem de staging.
- [ ] **Step 5: Commit** `chore(cloudflare): declare audiobook R2 buckets`.

### Task 20: CSP e variável `VITE_AUDIO_URL` [F2]

**Files:** Modify `server/http/csp.ts` (junto de `VITE_LIVROS_URL`, linha ~157: `origemDe(env.VITE_AUDIO_URL)`; **também `media-src`** se a CSP tiver essa diretiva, pois `<audio>` usa `media-src`, não `connect-src`), `server/lib/config.ts` (entrada `VITE_AUDIO_URL`, `exigencia: 'opcional'`, `criticidade: 'degrada-capacidade'`), `.env.production.example`; Test `tests/seguranca/csp-audio.test.ts`.
**Interfaces:** Produces: `diretivasDeCsp(env).connectSrc` e `mediaSrc` contêm a origem de `VITE_AUDIO_URL`.

- [ ] **Step 1: Write the failing test** (padrão de `tests/seguranca/csp-estreita.test.ts`): sem a variável nada muda e `connectSrc` não contém `https:`; com `VITE_AUDIO_URL=https://audio.frasy.com.br/x` aparece `https://audio.frasy.com.br` em `connectSrc` e na diretiva de mídia; uma URL inválida é ignorada; `dist/_headers` gerado por `scripts/vite/cabecalhos.ts` traz o mesmo host (`tests/cabecalhos-gerados.test.ts` continua verde).
- [ ] **Step 2–4:** FAIL → implementar → PASS (`npx vitest run tests/seguranca tests/cabecalhos-gerados.test.ts`).
- [ ] **Step 5: Commit** `feat(csp): allow VITE_AUDIO_URL origin for audiobook streaming`.

### Task 21: Flags `audiolivros*` (migração, constantes, docs) [F2]

**Files:** Create `server/db/migrations-pg/<próximo número livre>_flags_audiolivros.sql` (**conferir `ls server/db/migrations-pg`**: a 0016 já é do piloto VLibras, PR #100; se ela ainda não estiver mergeada, a numeração segue o que o repositório tiver no momento); Modify `server/db/migrations-pg/meta/_journal.json` (nova entrada, `when` maior que a anterior), `src/core/planos.ts` (só constantes `FLAG_AUDIOLIVROS = 'audiolivros'`, `FLAG_AUDIOLIVROS_NUVEM`, `FLAG_AUDIOLIVROS_ELENCO`, junto de `FLAG_AVATAR_*`; **nenhuma cota**), `docs/flags.md` (3 linhas na tabela), `tests/integration/schema-pg-baseline.test.ts` (contagem de flags **+3 sobre o valor atual do arquivo**), `tests/integration/migracao-sqlite-para-postgres.test.ts` (`extrasNoDestino` + 3 chaves); Test `tests/audiolivros-flags.test.ts`.
**Interfaces:** Produces: `FLAG_AUDIOLIVROS` (consumida nas Tasks 22, 26).

- [ ] **Step 1: Write the failing test** `tests/audiolivros-flags.test.ts` **independente do número da migração**: localiza o arquivo em `server/db/migrations-pg` cujo nome contém `flags_audiolivros`, confere que o `_journal.json` tem uma entrada com esse `tag`, que o SQL tem 3 `INSERT INTO flags` (`audiolivros`, `audiolivros_nuvem`, `audiolivros_elenco`) com `false, '{}'` e `ON CONFLICT (chave) DO NOTHING`; aplica a cadeia em PGlite (`pglite://memory`) e vê as 3 flags `habilitada = false`, `regras = '{}'`; **reaplica** o SQL e confere que uma flag ligada à mão continua ligada; `docs/flags.md` cita as 3 chaves; as constantes de `planos.ts` batem com as chaves.
- [ ] **Step 2: Run** `npx vitest run tests/audiolivros-flags.test.ts` → FAIL.
- [ ] **Step 3: Implement** o SQL no molde de `0015_flags_avatar.sql` (descrições da spec 9.1; reversão `DELETE FROM flags WHERE chave IN (…)` no comentário; sem regra de plano), o `_journal.json`, as constantes, as linhas do `docs/flags.md` ("PG <número>") e as contagens de baseline.
- [ ] **Step 4: Run** `npx vitest run tests/audiolivros-flags.test.ts tests/integration/schema-pg-baseline.test.ts tests/integration/migracao-sqlite-para-postgres.test.ts` → PASS. Escrever o número real em `docs/runbooks/audiolivros.md` §1.
- [ ] **Step 5: Commit** `feat(flags): seed audiolivros, audiolivros_nuvem and audiolivros_elenco disabled`.

### Task 22: Campo `audio` no catálogo e visibilidade [F2]

**Files:** Create `scripts/audiolivros/publicar-catalogo.mjs`, `scripts/audiolivros/piloto.json` (os 10 ids da Task 2); Modify `scripts/livros/montar-catalogo.mjs` (lê `scripts/audiolivros/publicados.json` e escreve `audio` em cada livro), `src/core/livros/tipos.ts` (`audio?: { voz: string; versao: number; capitulos: number; horas: number }`), `src/core/livros/catalogo.ts` (função `temAudioVisivel`); Test `tests/audiolivro-catalogo.test.ts`.
**Interfaces:**

- Consumes: `visivelPara(livro, teto)` (`src/core/livros/catalogo.ts:36`).
- Produces: `temAudioVisivel(livro: { audio?: unknown; classificacao?: unknown }, teto: TetoDeClassificacao, flagLigada: boolean): boolean`.

- [ ] **Step 1: Write the failing test:** `false` com a flag desligada; `false` sem `audio`; `false` se `visivelPara` é `false` (menor, livro não aprovado) mesmo com `audio`; `true` só com as três condições; `montar-catalogo` não toca livros fora de `publicados.json`; nenhum id do `piloto.json` tem `classificacao` não aprovada.
- [ ] **Step 2–4:** FAIL → implementar (`public/catalogo/livros.json` **só** regenerado por script) → PASS.
- [ ] **Step 5: Commit** `feat(catalogo): expose audiobook availability gated by flag and age rating`.

### Task 23: Cliente: manifesto, faixa e capítulo offline [F2]

**Files:** Create `src/lib/leitor/audiolivro/{manifesto.ts,faixa.ts,capituloOffline.ts}`; Test `tests/audiolivro-cliente.test.ts` (jsdom).
**Interfaces:**

- Consumes: Task 14.
- Produces: `urlDoAudio(): string | null` (de `import.meta.env.VITE_AUDIO_URL`, sem `/` final); `carregarManifesto(livroId: string, voz: string, o?: { fetch?: typeof fetch; timeoutMs?: number }): Promise<ManifestoDeAudio | null>` (`null` em 404, rede, timeout 8 s, JSON fora do `validarManifesto`); `escolherFaixa(m: ManifestoDeAudio, canPlayType: (t: string) => string): { ext: 'opus'|'m4a'; mime: string } | null` (Opus só se `canPlayType('audio/webm; codecs="opus"')` ou `audio/ogg; codecs="opus"` não é `''`; senão AAC se o manifesto traz a 2ª faixa; senão `null`); `capituloBaixado(url: string): Promise<boolean>`, `baixarCapitulo(url: string, aoProgredir?: (f: number) => void): Promise<void>`, `apagarCapitulo(url: string): Promise<void>` (Cache Storage `frasy-audiolivros-v1`), `tamanhoLegivel(bytes: number): string` ("≈ 6 MB").

- [ ] **Step 1: Write the failing test:** `carregarManifesto` devolve `null` com `fetch` que rejeita, com 404, com timeout (`timeoutMs: 10` e fetch pendente) e com manifesto inválido; devolve o manifesto válido; `escolherFaixa` com `canPlayType` que responde `''` para Opus e `'maybe'` para AAC escolhe `m4a`, e com nenhum dos dois devolve `null` (**Safari sem Opus**); `urlDoAudio()` é `null` sem a variável; `baixarCapitulo`/`capituloBaixado`/`apagarCapitulo` num `caches` simulado; `tamanhoLegivel(6 * 1024 * 1024)` = "≈ 6 MB".
- [ ] **Step 2–4:** FAIL → implementar → PASS (`npx vitest run tests/audiolivro-cliente.test.ts`).
- [ ] **Step 5: Commit** `feat(leitor): add audiobook manifest loader, codec choice and offline cache`.

### Task 24: Reprodutor de capítulo (`<audio>` + destaque) [F2]

**Files:** Create `src/lib/leitor/audiolivro/reprodutor.ts`; Test `tests/audiolivro-reprodutor.test.ts` (jsdom, `HTMLAudioElement` simulado).
**Interfaces:**

- Consumes: `frasePorTempo`, `FraseComTempo` (Task 15).
- Produces: `criarReprodutor(d: { criarAudio?: () => HTMLAudioElement; agora?: () => number; canal?: BroadcastChannel | null }): ReprodutorDeCapitulo` com `carregar(url: string, tempos: readonly FraseComTempo[]): Promise<void>`; `tocarDe(i: number): Promise<void>` (seek em `canplaythrough`, como o `MediaOverlay` do foliate faz por causa do WebKit); `pausar(): void`; `retomar(): Promise<void>`; `parar(): void`; `definirVelocidade(v: number): void` (`playbackRate` com `preservesPitch = true`, faixa 0,5–2,5); `aoMudarFrase: (i: number) => void`, `aoFimDoCapitulo: () => void`, `aoErro: (motivo: 'rede'|'decodificacao') => void` (atribuíveis); `precarregar(url: string): void` (próximo capítulo); `destruir(): void`.

**Decisão sobre o `MediaOverlay` do foliate (resolvida lendo `src/lib/leitor/foliate/epub.js:395-520`; era NC na spec 5.2):** ele exige SMIL no EPUB com `par` por elemento, destaca por trecho de texto referenciado, não por palavra, e nossos EPUBs não têm SMIL nem ids por frase. **Não é reaproveitado**; só se copia o padrão (`timeupdate` dirige o destaque; seek dentro de `canplaythrough`). Licença do vendor: MIT (resolve a divergência da spec §13). Registrar em `docs/specs/…` §5.2 e no PR; nenhum patch em `foliate/`.

- [ ] **Step 1: Write the failing test:** com relógio falso e `tempos` da Task 15, `aoMudarFrase` dispara com `frasePorTempo` a cada tick e **no máximo 300 ms depois** de o `currentTime` cruzar o `t0` (o reprodutor consulta por `requestAnimationFrame`, não só `timeupdate`); `tocarDe(5)` busca `tempos[5].t0` após `canplaythrough`; `definirVelocidade(2.6)` fica em 2,5 e `preservesPitch` é `true`; `aoFimDoCapitulo` no `ended`; erro de mídia → `aoErro('rede'|'decodificacao')`; capítulo com `tempos: []` (0 frases) → `aoFimDoCapitulo` imediato **sem criar `<audio>`** (a fila pula); **duas abas:** ao `tocarDe`, o canal `BroadcastChannel('frasy-audiolivro')` anuncia `{tocando: true}` e uma instância que recebe isso chama `pausar()`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(leitor): add chapter audio player with frame-accurate sentence sync`.

### Task 25: Integrar ao `Narrador` com queda para o narrador local [F2]

**Files:** Modify `src/lib/leitor/narrador.ts` (`DependenciasDoNarrador` ganha `audioGravado?: () => AudioGravadoDoLivro | null`; `falarFrase` usa o reprodutor quando há áudio íntegro para o capítulo e o modo é `original`); Test `tests/audiolivro-narrador.test.ts` (padrão de `tests/leitor-narrador.test.ts`, jsdom, motor e reprodutor falsos).
**Interfaces:**

- Consumes: Tasks 14, 23, 24, 21.
- Produces: `interface AudioGravadoDoLivro { manifesto: ManifestoDeAudio; urlDoCapitulo(nn: number): string; reprodutor: ReprodutorDeCapitulo; flagLigada(): boolean }`; novo `aviso` `'audio-indisponivel'` em `aoAviso` (texto "Não conseguimos tocar este capítulo agora. Vamos ler com a voz do seu aparelho."); `VistaDoNarrador.gravado: boolean` (alimenta o chip). A posição retomável continua `leitor:narracao:<livroId>` (CFI da frase).

- [ ] **Step 1: Write the failing test:** (a) com manifesto íntegro, `tocar()` aciona o reprodutor e **não** o `speechSynthesis`; o destaque (`Vista.indice`) segue `aoMudarFrase`; (b) **hash das frases ≠ manifesto** → nenhum áudio é buscado, o motor local fala a frase e `gravado` é `false`; (c) `aoErro('rede')` no meio do capítulo → a frase corrente continua pelo narrador local na **mesma frase** (sem silêncio, sem pular) e `aoAviso('audio-indisponivel')` dispara **uma vez**; (d) **kill-switch:** `flagLigada()` passa a `false` durante a reprodução → a frase em curso termina, a seguinte vai ao motor local, nenhum `fetch` novo; (e) capítulo `frases: 0` é pulado; (f) recarregar (novo `Narrador`, mesmo `livroId`) retoma na **mesma frase** guardada; (g) sono "fim do capítulo" e `proxima`/`anterior`/`voltar` continuam valendo com áudio gravado; (h) modo `traducao`/`bilingue` ignora o áudio gravado e usa o narrador local.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** a delegação em `falarFrase` (mapear `frases[indice]` ao índice `i` do manifesto, que é o do app); `frasesIntegras` é chamado uma vez por capítulo em `carregarFrases()`; sem `audioGravado` (flag desligada, dependência ausente) o corpo antigo roda **sem mudança** (`tests/leitor-narrador*.test.ts` seguem verdes).
- [ ] **Step 4: Run** `npx vitest run tests/audiolivro-narrador.test.ts tests/leitor-narrador.test.ts tests/leitor-narrador-v2.test.ts tests/leitor-narrador-elenco.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(leitor): play pre-generated audio inside Narrador with local fallback`.

### Task 26: UI: Ouvir, chip, baixar capítulo, ligação com a flag [F2]

**Files:** Create `src/components/views/leitor/{ChipVozSintetizada.tsx,BotaoBaixarCapitulo.tsx}`; Modify `src/components/views/leitor/LeitorDoLivro.tsx` (`import()` dinâmico dos módulos acima e de `src/lib/leitor/audiolivro/*` **só** com `flagLigada(FLAG_AUDIOLIVROS)` e `temAudioVisivel`), `src/components/views/leitor/BarraDoNarrador.tsx` (renderizar o chip quando `vista.gravado`); Test `tests/audiolivro-ui.test.tsx` (jsdom) e `tests/audiolivro-chunk.test.ts` (padrão de `tests/avatar-bundle.test.ts`); i18n: novas chaves em `src/lib/i18n` conforme o catálogo existente.
**Interfaces:**

- Consumes: Tasks 22, 23, 25. Produces: `ChipVozSintetizada(): JSX.Element` (`role="status"`, texto "Voz sintetizada", não dispensável); `BotaoBaixarCapitulo({ url, bytes, minutos }: …)` (rótulo "Baixar este capítulo (≈ 6 MB)", alvo ≥ 44 px, `aria-live="polite"` no progresso).

- [ ] **Step 1: Write the failing test:** chip presente e acessível (`getByRole('status', { name: 'Voz sintetizada' })`) sempre que `gravado`, sem botão de fechar; sem `gravado` não aparece; **perfil de menor / livro não visível:** nem "Ouvir gravado" nem requisição ao CDN (`fetch` espiado não chamado); flag desligada → `tests/audiolivro-chunk.test.ts`: o bundle principal não referencia `src/lib/leitor/audiolivro/` (import dinâmico) e nenhuma chamada a `VITE_AUDIO_URL` ocorre; `BotaoBaixarCapitulo` mostra o tamanho antes e "Ele fica só neste aparelho e você apaga quando quiser."; todos os textos via `t()`.
- [ ] **Step 2–4:** FAIL → implementar (um único botão "Ouvir" = o `leitor-ouvir` existente; opções dentro de "Voz e modo") → PASS; rodar `node scripts/i18n/pseudo.mjs --check && npm run i18n:orfas && node scripts/i18n/cobertura.mjs --check`.
- [ ] **Step 5: Commit** `feat(leitor): add synthesized-voice chip, chapter download and flag-gated loading`.

### Task 27: e2e com áudio e R2 simulados (3 viewports) [F2]

**Files:** Create `tests/e2e/audiolivros.e2e.ts`, `tests/fixtures/audiolivros/capitulo-teste.webm` (WebM/Opus de ~5 s gerado por `ffmpeg`, duração e tempos conhecidos) e `.json`; usa `preparar`, `faladas` de `tests/e2e/_livro.ts`.
**Interfaces:** Consumes: Tasks 19–26. Os projetos `desktop-1280`, `tablet-768` e `mobile-375` do `playwright.config.ts` rodam o arquivo sem configuração extra.

- [ ] **Step 1: Write the failing e2e** (`page.route` responde manifesto, `.json` e `.opus`; nada sai para a rede real): (a) flag desligada → nenhuma requisição ao host de áudio e nenhum chip; (b) flag ligada, tocar → a frase `i` fica destacada **≤ 300 ms** depois do `t0` (medir `performance.now()` no evento de destaque vs. `currentTime`), chip "Voz sintetizada" visível; (c) recarregar → retoma na **mesma frase**; (d) `route.abort()` no `.opus` → mensagem de erro do spec 9.4 e a mesma frase sai pela `speechSynthesis` falsa; (e) manifesto com `hashDasFrases` adulterado → só o narrador local fala; (f) "Baixar capítulo" → com a rota derrubada depois, o capítulo ainda toca; (g) perfil de menor (rota de perfil simulada) → nenhum request a `audiolivros/`; (h) sem sobreposição horizontal nos 3 viewports (`scrollWidth <= clientWidth`).
- [ ] **Step 2: Run** `npx playwright test tests/e2e/audiolivros.e2e.ts` → FAIL (antes das Tasks anteriores integradas) ou falhas reais a corrigir.
- [ ] **Step 3–4:** Ajustar até **verde nos 3 projetos**; **aceite:** `npx playwright test tests/e2e/audiolivros.e2e.ts --project=desktop-1280 --project=tablet-768 --project=mobile-375` passa.
- [ ] **Step 5: Commit** `test(e2e): audiobook sync, resume, fallback and minors in 3 viewports`.

### Task 28: Piloto em staging, medidas e aprovação [F2, mistura do dono]

**Files:** Create `scripts/audiolivros/medir-ttfa.mjs`, `docs/pesquisa/2026-11-xx-audiolivros-piloto.md`; Modify `openspec/changes/audiolivros/tasks.md` (3.1–3.5), `docs/runbooks/audiolivros.md` (§3, §4 preenchidos).
**Interfaces:** Consumes: Tasks 12, 17–19, 21–22. Produces: relatório do piloto.

- [ ] **Step 1: Teste do medidor** `tests/audiolivros-ttfa.test.ts`: `p95(amostras: number[]): number` devolve o percentil 95 (nearest-rank) — `p95([…100 valores 1..100]) === 95`; reprova (`ok: false`) se > 1,5 s.
- [ ] **Step 2: Gerar o piloto** (GPU/DeepInfra só dentro do teto do lote definido **antes** pelo dono, com o RTF medido): `npx tsx scripts/audiolivros/gerar-livro.mjs --livro <id> --voz <voz> --bucket frasy-audio-staging` para cada um dos 10; `npx tsx scripts/audiolivros/conferir.mjs --livro <id> --roundtrip`. **Aceite:** 10 livros com `manifesto.json`, **100% dos capítulos nos limiares, 0 frases sem áudio**.
- [ ] **Step 3: Medir** `npx tsx scripts/audiolivros/medir-ttfa.mjs --url $VITE_AUDIO_URL --n 200` a partir do staging (**1º áudio p95 ≤ 1,5 s**) e `curl -I` (cache). Ligar `audiolivros` no staging só com `ids` do dono e `percentual: 0` (ato do dono).
- [ ] **Step 4: Amostra de 5%** dos capítulos (sorteio com semente registrada) ouvida pelo dono; passeio manual em Chrome, Safari e Android (Opus no Safari: se falhar, abrir tarefa "AAC 48 kbps como 2ª faixa"). **Aceite:** "aprovado em <data>" escrito no relatório pelo dono; sem isso a F2 não fecha.
- [ ] **Step 5: Gate de CI** (Global Constraints) e commit `docs(audiolivros): pilot report and F2 acceptance`.

---

## Planos seguintes (não detalhados aqui)

| Fase                                | Entrada (gate)                                                                          | O que a F0 libera / decide                                                                               | Quando escrever o plano          |
| ----------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| F3 Elenco                           | F2 verde; gold set ≥ 200 falas pt; motor com ≥ 4 timbres e acerto ≥ 80%                 | Se a F0 não achar ≥ 4 timbres, T3 vira narrador + 2 vozes ou sai; define se o lote usa Qwen3 CustomVoice | Após Task 12 com timbres medidos |
| F4 Livro do usuário + nuvem Premium | F1 pronta; `voz_natural` em staging; **G7** (contrato de retenção zero)                 | Pré-processador (Tasks 3–4) é reaproveitado na nuvem; decisão do Chatterbox no DeepInfra                 | Após G7 e Task 12                |
| F5 Beta fechado                     | F2 aprovada (F3/F4 opcionais); métricas §9.3 instrumentadas                             | Motor e bitrate estáveis; versão no manifesto                                                            | Após Task 28                     |
| F6 GA gradual                       | F5 ok; **G1 a G8** fechados (G1 depende da Task 1 e de a escolha usar ou não espeak-ng) | Parecer do jurídico define se Piper/Kokoro entram                                                        | Após F5 e parecer                |

## Auto-revisão

**Requisito da spec → tarefa**

| Requisito (fases 0–2)                                                                                                                        | Tarefa                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Consulta jurídica espeak-ng/WASM com a pergunta exata (6.4)                                                                                  | 1                       |
| Respostas do dono às 5 perguntas; teto US$ 5 GPU + US$ 2 DeepInfra (§12, 8.5)                                                                | 2, 11                   |
| Candidatos Qwen3 0,6B/1,7B, Chatterbox pt-BR (clonagem desligada), VoxCPM2, Piper, Web Speech nas 14 frases (F0)                             | 6, 11                   |
| Tabela RTF/GB/CER/WER/vozes/duração por frase/GPL (F0)                                                                                       | 8, 10, 11               |
| Escuta cega (CSV), recomendação por critério numérico (6.4, 7.3)                                                                             | 9, 10, 12               |
| `scripts/eval-voz/` completo: montar-frases, sintetizar, roundtrip, itens difíceis, estabilidade, formulário, juiz de texto, relatório (7.1) | 6–10                    |
| WER/CER normalizado igual nos dois lados; Whisper como `eval-fala` (7.1)                                                                     | 7                       |
| Limiares 7.2 em `limiares.json`, calibrados e travados                                                                                       | 7, 10, 13               |
| Pipeline < 30 min por motor (F1)                                                                                                             | 13                      |
| Pré-processador pt-BR, ≥ 60 casos, dicionário e ortografia (6.3, F1)                                                                         | 3, 4                    |
| Interface `Sintetizador` motor-agnóstica (F1c)                                                                                               | 5                       |
| Contrato do manifesto, hash do texto, `{i,t0,t1}`, Opus 32 kbps mono, validação estrita (6.2)                                                | 14, 15, 17, 18          |
| Gerador frase a frase, retentativa ≤ 2, 0 frases sem áudio (7.2, F2)                                                                         | 17, 18                  |
| Buckets `frasy-audio(-staging)` + `VITE_AUDIO_URL` na CSP; `curl -I` com cache (6.2, F2)                                                     | 19, 20                  |
| Campo `audio` no catálogo, visibilidade por classificação (6.2, G8)                                                                          | 22                      |
| Flag `audiolivros` (+ as duas outras), migração, `docs/flags.md`, contagem (9.1)                                                             | 21                      |
| Player: Ouvir, destaque ≤ 300 ms, retomar, sono, fila, baixar capítulo, chip (6.5)                                                           | 24, 25, 26, 27          |
| Queda para o narrador local (hash, áudio falha) (6.2, 9.7)                                                                                   | 25, 27                  |
| Kill-switch em 3 camadas; comando do ponteiro no runbook (9.7)                                                                               | 19, 25                  |
| `audiolivros` desligada não carrega nada (F2)                                                                                                | 26, 27                  |
| e2e nos 3 viewports com áudio/R2 simulados; teste de CSP e de chunk (F2)                                                                     | 20, 26, 27              |
| 1º áudio p95 ≤ 1,5 s; 5% ouvido e aprovado; Safari/Chrome/Android (F2)                                                                       | 28                      |
| `MediaOverlay` do foliate (5.2 NC)                                                                                                           | 24 (decisão registrada) |
| F3 a F6                                                                                                                                      | "Planos seguintes"      |

**Lacunas e divergências encontradas** (para o dono; nenhuma foi decidida em silêncio):

- **Pré-processador:** a spec F1 diz `src/core/texto/` "ou pasta equivalente"; o plano usa `src/core/leitura/` (ao lado de `narracao.ts`). O teste `tests/preprocessador-voz*.test.ts` da spec é respeitado.
- **`hashDoTexto`:** o manifesto de parágrafos existente (`src/core/livros/manifesto.ts`) é um conjunto de hashes **sem ordem** por livro; não detecta frase movida. O plano acrescenta `hashDasFrases` (ordenado, por capítulo) e deriva `hashDoTexto` dele. Campo novo no manifesto de áudio: `hashDasFrases` por capítulo, `formato`, `elenco?`.
- **Numeração da migração:** a spec/OpenSpec/runbook dizem "0016 provisório"; a 0016 é do piloto VLibras (PR #100). O plano manda usar o próximo número livre e o teste não depende dele; os testes `schema-pg-baseline` e `migracao-sqlite-para-postgres` terão conflito de contagem se o PR #100 e este mergearem em ordens diferentes (resolver somando).
- **`MediaOverlay`:** lido; exige SMIL, logo não serve (Task 24). Licença MIT do vendor (spec §13 dizia NC).
- **CSP:** `<audio>` usa `media-src`; a spec só cita `connect-src` (Task 20 cobre ambos se a diretiva existir).
- **Web Speech** não tem WER (áudio não capturável); entra só na escuta cega.
- **Itens que dependem de decisão do dono e não foram especificados:** lista final dos 10 livros e ortografia original × modernizada (Task 2); escolha de bitrate se a escuta divergir de 32 kbps (Task 12); teto em USD do lote do piloto (Task 28, depende do RTF medido); se `en`/`es` ganham regras de número no pré-processador (hoje só regras neutras; a spec 6.3 só detalha pt-BR).
