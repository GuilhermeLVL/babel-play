## Context

- **O que já existe** (só falta publicar e ligar): `BergamotLocal` (um worker por par), `bergamotModelo.ts` (par, bytes, sha256,
  falha lembrada), `modelosDoBergamot.json` (`pares` = pt-en embutido; `paresDoCdn` = 15 pares X→en, ~423 MB no bucket),
  `scripts/modelos/publicar-bergamot-no-r2.ts` (confere o sha256 do `.gz`, `Cache-Control: immutable`, `--seco`,
  `--via=wrangler`) e a escada `routeMt` (`bergamotVenceNoPar`: X→en e pivô; saindo do inglês, nunca).
- **Como o Bergamot entra hoje**: `resolveMt` cria `TradutorLocalComBergamot(BergamotLocal, OpusMtLocal)` para o binding
  `opus-mt-local`. Os perfis (`src/gateway/profiles.ts`) só listam `chrome-translator`, `opus-mt-local`, `server-llm-mt`,
  `mymemory`. O registro (`registroDeMotores.ts`) já tem a linha `bergamot-local`, mas com `adapterId: 'opus-mt-local'`.
- **Números (todos com fonte na pesquisa; nenhum é medida nova)**: Bergamot 80–130 ms/frase no desktop e ~31 MB por par (37 MB
  com lex e vocab no Remote Settings) contra opus-mt 130–1.196 ms e ~113 MB; heap do WASM 0.4.9 de 550–743 MB no desktop; ~250–371 MB
  após as correções da Mozilla, medido só no build nativo (issue #957); +7,9 chrF++ do Bergamot vem de 54 frases sem IC (indício,
  não prova). A bancada Etapa 5 (`docs/auditoria/eval/bancada-2026-09-etapa5.md`) decidiu pt→en a favor do Bergamot (COMET +0,028,
  IC exclui 0) e en→pt contra (português europeu, gold de conversa piora).
- **Licença**: pesos Mozilla = MPL-2.0 pela declaração do README, sem campo no registro e sem lista dos corpora; EuroNano =
  Apache-2.0 nos pesos, mas TED2020 CC BY-NC-ND na lista de dados (E-004 = inconclusivo).
- **Restrições**: Gemini proibido; retenção zero (a tradução local não manda texto a ninguém); atende menores; planos e cotas
  intocados; importação e tradução local rodam no navegador; teto de 20 MB é limite de CONFIRMAÇÃO, não de proibição.

## Decisions

### D1. Uma flag por mudança de comportamento: `traducao_local_por_direcao`

Nasce DESLIGADA. Migrações PROVISÓRIAS: PG `0026_flag_traducao_local_por_direcao.sql` e SQLite `0068`, semente idempotente
(`ON CONFLICT DO NOTHING`), sem regra de plano, reversão `DELETE FROM flags` (o padrão de `rum_latencia`, PG 0023/SQLite 0065);
snapshots, journals, `PainelFlags`, `docs/flags.md` e o teste de baseline junto. A numeração é conferida no PR contra a `main`
(outras frentes também criam migrações).

A flag gateia o USO, não a publicação: `parDoBergamot`/`bergamotOferecido` só devolvem pares de `paresDoCdn` e o worker só escolhe o
runtime novo com a flag ligada. Assim, publicar no R2 e definir `VITE_BERGAMOT_MODELOS_URL` não muda o comportamento de ninguém
até a flag ligar. Alternativa descartada: usar só a variável de ambiente como chave (liga para todos de uma vez, sem rollout por
conta nem reversão sem novo build).

### D2. Rota por direção lida de dado, não de `if` espalhado

Hoje "só pt→en embutido, X→en no CDN, saindo do inglês nunca" está em `bergamotVenceNoPar`, `parDoBergamot` e comentários. A
mudança concentra a decisão numa tabela pura em `src/core/` (`direção → motor, com o motivo`), com três linhas:

| Direção                 | Motor padrão                                   | Quando muda                                                           |
| ----------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| X→en (pares publicados) | `bergamot-local`, reserva `opus-mt-local`      | par sem arquivo publicado ou `aprovadoPeloDono: false`: opus-mt       |
| en→pt-BR                | `opus-mt-local` com `>>pt_br<<`                | só com o veredito `aprovado` do teste cego (D4) o leve passa à frente |
| X→Y sem inglês (pivô)   | 1ª perna Bergamot, 2ª perna da linha de `en→Y` | idem acima por perna                                                  |

Alternativa descartada: manter a regra no código do roteador e editar a cada veredito. O veredito do teste cego é dado
versionado (`veredito` por par no catálogo), e o código só o lê; reverter é trocar o dado.

### D3. Runtime: build WASM do `inference/` da Mozilla, vendorizado sem modificação, por chave de build

Opção A (rejeitada): ficar no 0.4.9 e só publicar os pares (menor risco, mas mantém 550–743 MB por idioma e a dependência parada
desde 2022). Opção B (escolhida): script em `scripts/` que gera o `.wasm` e a cola da versão de `BERGAMOT_VERSION` (v0.6.0 no
levantamento), servidos do próprio domínio (CSP `script-src` e `worker-src` não mudam), com aviso MPL e registro em `FONTES.md`;
os arquivos ficam sem modificação (patch = publicar o fonte desse arquivo sob MPL). Opção C (rejeitada): o artefato
`bergamot-translator` 3.0 que o Firefox baixa do Remote Settings (MPL-2.0, 4,96 MB): o binding JS dele mora no Firefox e a
compatibilidade com o loader do app não foi verificada; pode virar controle do A/B, não a base.

Chave de build `antigo|novo`; o 0.4.9 permanece no `package.json` por um ciclo. A troca só acontece depois do portão 3 e do
teste do 2º modelo em sequência (issue #1488 da Mozilla: `memory access out of bounds` ao criar um segundo modelo depois de uma
tradução longa; afeta o pivô, que cria dois modelos). Mitigação já prevista: criar os dois modelos antes de traduzir e, em
erro, cair no opus-mt na perna seguinte.

### D4. en→pt-BR: teste cego decide, opus-mt `>>pt_br<<` é o padrão

Candidatos: Mozilla en→pt (variante "mista", issue #1081 aberta, sem previsão), EuroNano en→xx (~18,6 MB por direção, variante
não declarada; ADIADO pelo portão de licença), e a reserva opus-mt en-ROMANCE com `>>pt_br<<` (~113 MB, acima do limite de
confirmação, Apache-2.0/CC-BY-4.0 conforme o card). O token `>>pt_br<<` já é enviado por `OpusMtLocal`/`mtWorker`
(`'Xenova/opus-mt-en-ROMANCE'`, "só pt tem o ID do token"); a primeira tarefa confirma por teste que a saída usa o alvo `pt_br`.

**Protocolo do teste cego** (escrito e commitado ANTES de ver qualquer saída, como o `criterio.md` do laboratório):

- Frases: 100 frases en→pt, retiradas do gold de conversa e do FLEURS/WMT já na bancada (`gold:en-pt`, `fleurs:en-pt`, `wmt:en-pt`),
  50 de legenda/conversa e 50 de texto limpo. Nunca texto de usuário nem de menor.
- Sistemas: opus-mt `>>pt_br<<` (controle), Mozilla en→pt e, só se o portão 1 abrir, EuroNano. Saídas embaralhadas por frase,
  rótulo do sistema oculto, semente fixa e gabarito guardado à parte.
- Avaliadores: no mínimo 2 brasileiros nativos, independentes, que não viram os sistemas; cada um marca por frase
  "soa brasileiro / soa português de Portugal / indeterminado" e dá nota 1–5 de naturalidade. Pelo menos 20 frases se repetem
  entre os dois para medir concordância (kappa); kappa < 0,4 invalida a rodada.
- Critério de aprovação do leve: (i) pt-PT marcado em < 10% das frases (por avaliador e na união); (ii) COMET e chrF++ pareados sem
  piora no IC 95% contra o opus-mt em `fleurs:en-pt` e `gold:en-pt`; (iii) naturalidade não pior que o controle no IC 95%.
  Falhou um: opus-mt `>>pt_br<<` fica. n = 100 dá IC largo (±~10 pontos em proporção): o teste serve para REPROVAR o leve com
  clareza ou aprová-lo quando está longe do limite; resultado na faixa 8–12% vale "inconclusivo", que também mantém o opus-mt.
- Ética: avaliação de adultos, sem dado pessoal; menores não avaliam; planilha sem nome nem e-mail (o dono guarda o vínculo).

Alternativa descartada: julgador LLM no lugar dos humanos (regra do projeto permite LLM-as-judge só via `claude -p`/`agy -p`, mas
variante regional é justamente onde o julgador erra; serve de triagem, não de veredito).

### D5. Bergamot declarado nos perfis

`bergamot-local` passa a ser binding explícito em `mt` dos perfis `free-web`, `local-private` e `cloud-quality`, ANTES de
`opus-mt-local`; `resolveMt` ganha o caso `bergamot-local` que devolve a mesma instância composta (singleton por `adapterId`
compartilhando o `OpusMtLocal` de reserva, para não carregar dois opus-mt). `registroDeMotores.ts` troca `adapterId` da linha
`bergamot-local` para o próprio id. Compatibilidade: perfil salvo só com `opus-mt-local` continua funcionando, e o composto
continua mandando o X→en ao Bergamot. Com a flag desligada o binding `bergamot-local` responde `supports() = false` para tudo
que não seja pt→en. Alternativa descartada: deixar escondido e só documentar (o disjuntor, a telemetria e o painel seguem sem
nome e uma falha do Bergamot é cobrada do opus-mt).

### D6. Medir antes de decidir: três A/B, nesta ordem

Todos seguem o protocolo do laboratório (`design.md` de `lab-medicao-legenda-traduzida` e
`docs/auditoria/protocolo-do-laboratorio-de-latencia.md`): `criterio.md` commitado antes, mesmo áudio e mesmo aparelho, ≥ 10 rodadas
ABAB com a 1ª descartada, diferença pareada por fala com IC 95% por bootstrap (`ab.mjs`), guardas ao lado.

1. **Runtime** (portão 3): 0.4.9 × WASM atual, mesmo par pt-en, sessão de 10 min, STT + MT. Métricas: memória de pico da aba e heap
   do WASM (primária), p75 de ms/frase, tempo de carga por fase (`carga-de-modelos.mjs`), taxa de erro no 2º modelo.
2. **X→en** (a): opus-mt × Bergamot por par publicado. Primária `fimDaFalaAteLegendaMs` p75 por classe; guardas: qualidade e memória.
3. **en→pt** (b): opus-mt `>>pt_br<<` × leve, só após o teste cego, com a mesma métrica primária.

### D7. Onde a qualidade se mede

A bancada de tradução existente: `scripts/eval-fala/medir-traducao.mjs` e `scripts/eval-fala/bancada/mt.mjs` geram as saídas
(`local:opus-mt`, `local:tc-big`, `bergamot:<par>`, corpora `fleurs:`, `wmt:`, `gold:`, `cascata:`), e `bancada/pontuar.py` (e
`bancada/nuvem/pontuar-comet.py`) calcula COMET `wmt22-comet-da`, BLEU e chrF++ do sacreBLEU, com IC 95% por bootstrap (1000
reamostragens, semente fixa) e diferença pareada contra o primeiro sistema. A regra de decisão já é a da bancada: troca só se o
IC pareado exclui 0 a favor E o gold de conversa não piora. Lacuna conhecida: segundo o cabeçalho de `bergamot.mjs`, nenhum corpus
da bancada tem origem em espanhol (e os demais X); a tarefa 4.2 acrescenta corpora FLEURS `X→en` dos pares a publicar (o baixador é
`baixar-corpus.py`) antes de qualquer decisão por par.

## Risks / Trade-offs

- **Licença dos pesos** (alto, impacto jurídico): MPL-2.0 só pelo README e corpora não informados; redistribuir pelo R2 é
  redistribuição. Mitigação: portão 1, `aprovadoPeloDono` por par no catálogo, o script recusa publicar sem ele, arquivos
  idênticos ao registro (sha256) e aviso MPL em `FONTES.md`. Reversão = esvaziar `VITE_BERGAMOT_MODELOS_URL` e desligar a flag.
- **Memória não medida no WASM** (alto): 250–371 MB é do build nativo. Pode não se repetir; portão 3 antes da troca, e o 0.4.9
  segue disponível. O pico real do celular (STT + MT juntos; teto de ~2 GB no iPhone) só se conhece com aparelho real.
- **Bug do 2º modelo no pivô** (médio): teste dedicado e queda para o opus-mt na perna seguinte.
- **Teste cego com n pequeno** (médio): IC largo; por isso a faixa "inconclusivo" mantém o padrão seguro. Avaliadores
  brasileiros podem divergir por regionalismo: kappa mínimo e repetição de 20 frases.
- **Download maior que 20 MB** (médio): o par X→en passa do limite de confirmação do celular/Quest; este lote NÃO baixa nada sem a
  confirmação já existente e não atrasa a 1ª legenda (o tradutor só serve depois de pronto; até lá, o motor que já responde hoje).
- **Qualidade no X→en sem IC** (médio): o ganho de +7,9 chrF++ é de 54 frases; D7 exige corpora por par e IC.
- **Mais um motor nas cadeias** (baixo): `bergamot-local` entra no disjuntor, na telemetria e no registro; um teste de grade
  prova que, falhando, a cadeia cai no opus-mt sem erro visível.
- **Privacidade** (baixo): tradução local não envia texto; o A/B usa só áudio público (FLEURS) e as saídas não levam texto de usuário.

## Como medir

| O quê               | Instrumento                                                                          | Critério de sucesso                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Latência da legenda | `fimDaFalaAteLegendaMs` p50/p75/p95 por classe, `ab.mjs` (pareado, IC 95%)           | p75 do B com IC inteiro abaixo de 0 e efeito mínimo do `criterio.md`; senão "sem diferença provada"                             |
| Qualidade           | `pontuar.py`: COMET `wmt22-comet-da` + chrF++, IC 95% pareado por par, `gold:` junto | nenhum par pior no IC 95%; gold de conversa não piora                                                                           |
| Variante pt-BR      | teste cego (D4)                                                                      | pt-PT < 10% e demais condições; senão opus-mt `>>pt_br<<`                                                                       |
| Memória             | pico da aba e heap do WASM por sessão de 10 min (laboratório; depois aparelho real)  | portão 3: WASM novo menor que o 0.4.9 no IC; REQ-018: ≤ 1,2 GB no Android de entrada, 0 abas derrubadas no iPhone em 10 min [R] |
| Download            | bytes da rede na 1ª carga e na 2ª (Cache Storage), `carga-de-modelos.mjs`            | 2ª carga sem rede; 1ª dita ao usuário antes (limite de confirmação)                                                             |
| Integridade         | sha256 por arquivo no worker                                                         | divergência = recusa e opus-mt; nunca arquivo parcial no cache                                                                  |
| Matriz de aparelhos | origem `medido` vs `emulado` em todo resultado                                       | ganho de celular, Quest ou iPhone só com origem `medido`                                                                        |
