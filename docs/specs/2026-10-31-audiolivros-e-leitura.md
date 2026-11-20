# Audiolivros e apoio à leitura: plano de solução completa, escalável e útil

Status: proposta para decisão do dono (nenhum código) · Data: 2026-10-31 · Autor: Guilherme (com Claude)

Base factual: `reports/Audiolivros e leitura soluções atuais.md` (pesquisa de 31/10/2026, no worktree
`pendencias-ao-alcance`; citado como **[relatório §N]**) e as 6 notas em `research_notes/Audiolivros e leitura soluções atuais/`.
Parte do que já existe: `docs/specs/2026-10-26-livros-e-leitura.md`, `docs/specs/2026-10-28-narracao-v2.md`,
`docs/specs/2026-10-28-avatar-elenco-ia.md` e `openspec/changes/avatar-interprete/`. A proposta OpenSpec é
`openspec/changes/audiolivros/`; o operacional é `docs/runbooks/audiolivros.md`.

**Nada aqui é parecer jurídico.** Onde há número sem fonte vai escrito ESTIMATIVA; onde falta dado vai NC (não confirmado).
Produção segue FECHADA e ligar flag é ato do dono.

---

## Respostas do dono (31/10/2026)

O dono aprovou o plano de execução em 31/10/2026, incluindo as cinco suposições abaixo. Onde a spec §12 não escreve uma
resposta explícita, vale a que ela implica, marcada "(implícita)".

1. **Escopo do primeiro lote:** piloto de **10 livros pt** (§11/F2), ~72 h; en/es só entram na bancada (14 frases pt +
   mesmas categorias em en/es), não no lote. (implícita: §8.1 e §11) Confirmada na aprovação do plano em 31/10/2026.
2. **Elenco no MVP:** **não manda na escolha do motor**. Decisão provisória da §4.2: Qwen3 como alvo, Chatterbox como
   atalho; o portão "≥ 4 timbres, acerto ≥ 80%" (§6.4 item 4) só vale "se o objetivo T3 for mantido"; sem ele, T3 usa
   narrador + 2 vozes. (implícita) Confirmada na aprovação do plano em 31/10/2026.
3. **Catálogo ouvido no Grátis:** **Sim** (§12 item 3); elenco e nuvem no pago. Sem alterar `src/core/planos.ts` nesta
   entrega. Confirmada na aprovação do plano em 31/10/2026.
4. **Quais 10 livros:** sugestão da §12 item 4: os mais populares do pt **com classificação aprovada** (Dom Casmurro,
   Os Lusíadas, Memórias Póstumas, O Guarani, A Escrava Isaura + 5 por popularidade em `public/catalogo/livros.json`).
   Sugestão aceita; pendente: o dono escolhe os 10 ids e a ortografia (Task 22). A lista final entra em
   `scripts/audiolivros/piloto.json`, com ids `pg-…`/`se-…` reais do catálogo.
5. **Quem escuta e aprova:** dono **+ 3 a 5 convidados** (1 jovem do público, com consentimento do responsável e só
   apelido), §7.3 e §12 item 5; **tetos de teste da F0: US$ 5 de GPU (ou 6 h de GPU, o que vier primeiro) e US$ 2 de
   DeepInfra** (§8.5). Confirmada na aprovação do plano em 31/10/2026.

---

## 1. Problema

O Frasy já tem leitor de livros, narrador por frase com a voz do aparelho (`src/lib/leitor/narrador.ts`), voz natural da
nuvem para o intérprete (`voz_natural`) e a heurística de elenco (`src/core/avatar/elenco/`). Mas hoje:

1. **A voz do aparelho varia muito** por celular, sistema e idioma. No Safari as vozes baixáveis nem aparecem [relatório §2, opção E].
   Para quem aprende idioma, uma voz ruim atrapalha mais do que ajuda.
2. **Não há audiolivro de verdade**: nada pronto para tocar, sem depender do aparelho, com a frase destacada em sincronia.
3. **O motor neural local está travado por licença**: o Kokoro em pt-BR/es usa o espeak-ng (GPL-3.0) e o `phonemizer` do npm
   embute esse binário com rótulo Apache [relatório §2]. O repositório já decidiu não embutir motor neural até haver parecer.
4. **Sem método de qualidade**: temos bancada para transcrição e tradução (`scripts/eval-fala`) e nenhuma para voz. Nenhum modelo
   tem avaliação independente de narração longa em pt-BR [relatório §1, item 4].
5. **Custo de nuvem sob demanda para todos não escala**: cada pessoa que ouve o mesmo clássico pagaria de novo o mesmo áudio.

## 2. Objetivos

| #   | Objetivo                                                                                          | Como saberemos (resumo; detalhe na seção 11)                           |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| O1  | Qualquer pessoa ouve um clássico do catálogo com boa voz, sem depender do aparelho                | Audiolivro pré-gerado do catálogo piloto aprovado pelo ouvido do dono  |
| O2  | A frase em voz alta fica destacada no texto, retoma de onde parou e funciona offline por capítulo | Critérios de aceite F2                                                 |
| O3  | Quem traz o próprio livro ouve no aparelho, sem enviar nada a terceiros por padrão                | Nenhuma requisição leva o texto do livro sem consentimento (teste e2e) |
| O4  | Custo marginal por usuário próximo de zero no catálogo; teto em USD na nuvem paga                 | Seção 8 e critérios F4                                                 |
| O5  | Qualidade medida como medimos a transcrição: bancada + limiares + ouvido do dono                  | `scripts/eval-voz/` e relatório da F0/F1                               |
| O6  | Chegar ao usuário final com segurança: flags desligadas, staging, beta, %, kill-switch            | Seção 9 e runbook                                                      |

## 3. Fora do escopo

- **Clonagem de voz** (nenhum caminho, nem "voz parecida com famoso"); o código de clonagem dos modelos fica desligado [relatório §7].
- **Exportar áudio de livro trazido pela pessoa** (obra possivelmente protegida) e **ZIP/MP3 de download** do catálogo nesta entrega
  (a spec de 26/10 previa o ZIP, NAR05; ver seção 5.4 para a divergência).
- **Tradução de Libras/sinais**, avatar obrigatório (o avatar é opcional e nunca a única forma de acesso).
- **Livro com direito autoral no catálogo**: só domínio público e já curado.
- **Classificador de nível de leitura próprio** (o relatório §6 mostra que não há base permissiva pronta); fica para outra change.
- **Ligar qualquer flag em produção**, contratar fornecedor, definir preço (decisões do dono).

## 4. Opções consideradas

### 4.1 Arquitetura geral

| Opção                                                                    | O que é                                                                                | Custo                                                                                                                                    | Risco                                                                                             | Qualidade                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **0. Não fazer / só Web Speech do aparelho**                             | Manter o narrador atual                                                                | Zero                                                                                                                                     | Experiência desigual (Safari sem vozes baixáveis); sem sincronia confiável; sem diferencial       | Varia por aparelho; boa só em iOS/Mac recentes |
| **1. TTS sob demanda no servidor para todos**                            | Cada "Ouvir" chama a nuvem e guarda cache                                              | Linear no uso: ~US$ 0,054 por hora ouvida (via Chatterbox no DeepInfra, `planos.ts`) ou GPU 24 h/dia (US$ 245/mês no mínimo, ESTIMATIVA) | Latência do 1º áudio; nuvem de terceiros com texto de livro; cota e abuso; cai se o provedor cair | Boa, mas igual para todos só se a cota deixar  |
| **2. Pré-gerar o catálogo em lote e servir do R2 (T1)**                  | Gerar uma vez, offline, áudio + tempos por frase; guardar no R2; todos ouvem do CDN    | Único: ~US$ 4 a 163 conforme escopo e caminho (seção 8); armazenamento ~US$ 0,5/mês                                                      | Precisa do motor aprovado e do ouvido do dono; cada correção de texto exige regerar o capítulo    | A melhor escolhida e revisada uma vez          |
| **3. Narração no aparelho + nuvem Premium para o livro do usuário (T2)** | Padrão local; nuvem só com plano, consentimento e cota                                 | Zero no padrão; ≤ US$ 0,60/mês por Premium no teto (já na matriz)                                                                        | Livro do usuário com direito autoral: por isso sem exportar áudio                                 | Aparelho: variável. Nuvem: boa                 |
| **4. Personagens e "quem fala" (T3)**                                    | Regra de travessão/aspas + LLM só nas implícitas, gerado OFFLINE por livro do catálogo | Zero de API (`claude -p`/`agy -p`, seção 10 do doc do elenco)                                                                            | Sem benchmark em pt/es [relatório §4]; falso atribuído soa mal                                    | Só vale com gold set nosso                     |

### 4.2 Escolha do caminho de geração em lote (dentro da opção 2)

| Caminho                                            | Prós                                                                                                       | Contras                                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. GPU alugada pontual (RunPod etc.)               | Controle total, serve Qwen3-TTS (9 vozes, elenco), sem terceiro lendo texto; ~US$ 0,34 a 0,89/h (RTX 4090) | Montar e manter o script do servidor; RTF desconhecido até a F0                                                                                                 |
| B. Perna `tts` já existente (Chatterbox/DeepInfra) | Zero infraestrutura nova; ~US$ 0,054 por hora de áudio; texto é domínio público (sem dado pessoal)         | Só voz padrão (sem elenco); o contrato de retenção da DeepInfra ainda está pendente no repositório; sem tempo por frase (resolve-se sintetizando frase a frase) |
| C. Máquina local do dono (Mac/GPU)                 | US$ 0                                                                                                      | Lento, ocupa a máquina; Qwen3-TTS pede CUDA                                                                                                                     |

**Decisão provisória: A como alvo, B como atalho do piloto se a bancada aprovar o Chatterbox.** A escolha final sai da F0.

## 5. Recomendação e decisões já tomadas

Resumo em 8 linhas:

1. Fazer a opção **2 (T1) + 3 (T2) + 4 (T3)**, nessa ordem, e **não** fazer a opção 1 como padrão.
2. T1: catálogo de domínio público **pré-gerado offline**, áudio Opus + JSON de tempos por frase no R2, servido por CDN. Custo único, escala por armazenamento.
3. T2: livro do usuário **narrado no aparelho** (Web Speech); voz natural da nuvem só **Premium/planos com `vozNatural`**, com consentimento e as cotas atuais.
4. T3: elenco gerado offline para o catálogo, consumido por `planejarElenco(..., previas)` (ponto de extensão já pronto).
5. **Motor decidido na F0**, por critério numérico (seção 6.4). Candidatos: Qwen3-TTS CustomVoice, Chatterbox pt-BR (voz padrão), VoxCPM2; Piper `faber` como baseline sujeito a parecer. **Kokoro pt/es só com parecer sobre o espeak-ng.**
6. **Qualidade antes de produto**: `scripts/eval-voz/` espelha `scripts/eval-fala`; o ouvido do dono decide, o limiar elimina.
7. Chegada ao usuário: **3 flags novas desligadas**, staging, beta fechado por lista (`ids` + `percentual: 0`), % gradual, kill-switch, runbook.
8. Planos: **proposta** (o dono decide): Ouvir clássicos do catálogo em todos os planos (custo marginal ~0); voz de nuvem para livro próprio e elenco no pago.

### 5.1 Decisões já tomadas pela pesquisa e pelo repositório (não reabrir sem fato novo)

| Decisão                                                                     | Fonte                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Nenhum motor com espeak-ng/`phonemizer` WASM no navegador sem parecer       | [relatório §2]; `docs/specs/2026-10-28-narracao-v2.md` ("Nenhum motor neural é embutido") |
| Nada de pesos não comerciais (Fish, Voxtral, F5, XTTS, MMS, Higgs)          | [relatório §7]                                                                            |
| Sem clonagem; Qwen3 "Base" e caminho de referência do Chatterbox desligados | [relatório §7]; `CAMPOS_DE_CLONAGEM` em `server/ai/provedoresDeVoz.ts`                    |
| Gemini proibido; juiz de áudio da literatura (Gemini) não serve             | CLAUDE.md; [relatório §8.4]                                                               |
| Texto de livro do usuário não vai a terceiros sem consentimento             | CLAUDE.md (retenção zero, menores); `docs/specs/2026-10-26-livros-e-leitura.md`           |
| Juiz por LLM (`claude -p`/`agy -p`) só para texto, nunca para naturalidade  | [relatório §8.4]; memória do dono (juízes sem créditos de API)                            |
| Quem decide a voz é o ouvido do dono + limiar                               | Pedido do dono (31/10/2026)                                                               |
| Produção fechada; ligar flag é do dono                                      | `docs/GUIA-DO-DONO.md`                                                                    |

### 5.2 Escolha: JSON de tempos por frase (e não SMIL) como formato primário

O foliate-js vendorizado tem `MediaOverlay` (SMIL) [relatório §5], mas o Frasy já narra **por frase** com o `Intl.Segmenter`
(`frasesDoCapitulo.ts`) e o elenco usa o **índice da frase**. Um JSON por capítulo com `{i, t0, t1}` casa com isso, é minúsculo e valida
contra o hash do texto (`public/catalogo/manifestos/<livro>.json` já guarda hashes por parágrafo). SMIL/EPUB 3 Media Overlays fica como
**exportação futura opcional**, fora do escopo. NC: se o `MediaOverlay` do foliate destaca por palavra (precisa ler o fonte; tarefa da F2).

### 5.3 Sincronia sem alinhador

Estratégia (a) do relatório §5: **sintetizar frase a frase e concatenar**, de modo que a duração de cada clipe é o próprio tempo. Evita
WhisperX/MFA. Custo: pausas entre frases e parágrafos viram parâmetros nossos (já existem em `estilosDeLeitura`). Alinhador (WhisperX BSD-2,
MFA MIT) fica como plano B para um motor que só entregue o capítulo inteiro.

### 5.4 Divergência com a spec de 26/10 (NAR05)

A spec de 26/10 previa "gerar um MP3 por capítulo **sob demanda, com cache compartilhado**, só no pago, e baixar um ZIP". Esta proposta
**substitui** isso por pré-geração em lote (opção 2) porque o catálogo é fixo e o custo por uso some. O ZIP exportável sai desta entrega (a
decisão de oferecê-lo depois é do dono, seção 12). Atualizar a spec de 26/10 ao arquivar a change.

## 6. Design

### 6.1 Três trilhas

```
T1 CATÁLOGO (domínio público)            T2 LIVRO DO USUÁRIO                  T3 ELENCO (quem fala)
 EPUB curado (R2 frasy-livros)            arquivo fica no aparelho             texto do capítulo (PD)
   │ frases = mesmo Segmenter do app        │                                    │ regra: travessão/aspas
   ▼                                        ▼                                    ▼ LLM só nas implícitas
 scripts/audiolivros/gerar-livro            Narrador (Web Speech)                 scripts/livros/gerar-elenco (offline,
   → pré-processa texto pt-BR (core)         voz do aparelho (padrão)               claude -p / agy -p, sem API)
   → TTS por frase (motor da F0)             [Premium] voz natural nuvem           → elenco/<livro>/<cap>.json
   → Opus + tempos {i,t0,t1} + manifesto     (consentimento + cota atual)          validarMarcacaoDaIa → previas
   ▼                                        ▼                                    ▼
 R2 frasy-audio(-staging) + CDN             Narrador.planejar(...)               voz por personagem no T1 (várias
   ▼                                                                              faixas de timbre) e no aparelho
 Leitor: <audio> + destaque por {i,t0,t1}
```

### 6.2 Armazenamento e contrato dos arquivos (T1)

- Bucket novo `frasy-audio` e `frasy-audio-staging` (separado de `frasy-livros` e de `frasy-midia`, que guarda áudio de sessão), domínio próprio
  com cache longo por versão (ex.: `audio.frasy.com.br`; `VITE_AUDIO_URL`; a CSP abre a origem como já faz com `VITE_LIVROS_URL`).
- Chave: `audiolivros/<livroId>/<voz>/<versao>/<nn>.opus` e `<nn>.json`; `manifesto.json` por livro/voz com: `livroId`, `idioma`, `voz`, `motor`,
  `versaoDoMotor`, `versaoDoPreprocessador`, `hashDoTexto` (do manifesto de parágrafos), `capitulos[{nn, duracaoS, bytes, sha256, frases}]`,
  `criadoEm`, `rotulo: "voz sintetizada"`, `licencaDoTexto`, `classificacao`.
- **Imutável por versão**: corrigir um capítulo gera `versao+1` e troca o ponteiro do manifesto; o cliente confere `hashDoTexto` e, se o texto
  mudou, cai no narrador local em vez de tocar áudio desalinhado.
- Formato: **Opus em contêiner WebM/Ogg, mono, 32 kbps** (ESTIMATIVA de qualidade suficiente para fala; confirmar na bancada com 24/32/48 kbps);
  Safari toca Opus em CAF/MP4 apenas em versões recentes (NC). Se a F2 mostrar falha no Safari, guardar **AAC 48 kbps** como segunda faixa
  (custo: +50% de armazenamento, ainda centavos).
- Lista de livros com áudio: campo `audio` opcional em `public/catalogo/livros.json` gerado por script (não editar à mão), para a ficha mostrar "Ouvir".

### 6.3 Pré-processamento de texto pt-BR (`src/core`, F1)

Puro, sem React nem rede, com teste: números, ordinais, moeda, romanos, siglas (lista e soletração), travessão `--` e `—` como troca de fala,
reticências, abreviações, dicionário de pronúncia por livro, ortografia antiga (modo "original" e "modernizado", ver bancada) e pausa por
parágrafo maior que por frase. **Regras próprias em TS** em vez de NeMo (Python) ou num2words (LGPL-2.1) [relatório §6]. O mesmo módulo serve
ao lote (T1) e à nuvem do T2.

### 6.4 Motor de voz: decisão como saída da F0

| Candidato                                   | Licença (código / pesos)                             | Por que entra                                             | Por que pode sair                                                       |
| ------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Qwen3-TTS CustomVoice / VoiceDesign         | Apache-2.0 / Apache-2.0                              | 9 timbres + instrução de estilo: **permite elenco (T3)**  | Voz nativa pt-BR NC; sem tempos nativos; precisa GPU                    |
| Chatterbox Multilingual V3 + finetune pt-BR | MIT / MIT                                            | Já é nossa perna (`MODELOS_DE_VOZ`); US$ 1/M no DeepInfra | **Só uma voz padrão**: sem elenco; exigir caminho de clonagem desligado |
| VoxCPM2                                     | Apache-2.0                                           | Voice design sem referência, 48 kHz                       | Menos testado; GPU CUDA ≥ 12                                            |
| Piper `faber` (baseline)                    | pesos CC0; código MIT (arquivado) ou GPL-3.0 (ativo) | Leve, serve de piso de comparação                         | Fonemizador espeak-ng: **só com parecer**                               |
| Kokoro pt-BR/es                             | Apache-2.0 + espeak-ng GPL                           | Leve, barato                                              | **Bloqueado até o parecer**; medir só como referência                   |

**Critério numérico de escolha (saída da F0).** Para cada idioma, o motor precisa passar nos **portões** e, entre os que passam, vence a maior
**nota humana** (seção 7.3):

1. Licença limpa (leitura do LICENSE e do model card, não de blog) e nenhum componente GPL/NC embutido no caminho que será distribuído.
2. Limiares automáticos da seção 7.2 (CER, itens difíceis, estabilidade).
3. **RTF ≤ 0,5** na GPU alugada (para o lote caber no orçamento: seção 8) e **1º áudio p95 ≤ 3 s** se o motor também for usado online (T2).
4. Se o objetivo T3 for mantido: **≥ 4 timbres distinguíveis** em pt-BR (teste cego de distinção, acerto ≥ 80%). Sem isso, o T3 usa narrador + 2 vozes.

**Pergunta exata ao jurídico (espeak-ng/WASM):** "Distribuir ao navegador um WASM derivado de espeak-ng (GPL-3.0), carregado em Web Worker por um
app React com outra licença, é obra combinada ou agregação? E rodar o espeak-ng/Piper/Kokoro apenas no nosso servidor, entregando só áudio gerado,
cria alguma obrigação sobre o áudio ou o código?" [relatório §2]. A F0 não depende da resposta (testa só motores sem espeak-ng; mede Kokoro/Piper
apenas como referência).

### 6.5 Experiência do usuário (um ponto de entrada)

Regra: **um único botão "Ouvir"** na barra do leitor (já existe a `BarraDoNarrador`); tudo mais mora atrás dele ("Voz e modo").

| Função                      | Comportamento                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ouvir                       | Livro do catálogo com áudio: toca o áudio gravado (T1). Senão: narrador local. A pessoa vê só "Ouvir"; o motor é detalhe                                      |
| Escolher voz                | Lista curta por idioma; "Voz do aparelho" sempre disponível; pré-ouvir. Nada de nomes de modelo                                                               |
| Velocidade                  | 0,5 a 2,5× (T1 usa `playbackRate` com `preservesPitch`; já é a faixa do narrador)                                                                             |
| Destaque da frase           | Sincronizado por `{i,t0,t1}`; página segue a frase (já existe "Seguir a leitura")                                                                             |
| Retomar                     | Guarda a frase (CFI) e o tempo; ao voltar, retoma da frase, no aparelho (sem servidor para menor)                                                             |
| Sono                        | 15/30/60 min ou fim do capítulo (já existe)                                                                                                                   |
| Fila de capítulos           | Segue para o capítulo seguinte; pré-carrega o próximo (a 32 kbps são ~0,24 MB por minuto: ESTIMATIVA)                                                         |
| Offline                     | "Baixar capítulo" guarda o Opus no cache do navegador (Cache Storage); aviso do tamanho antes (ex.: "≈ 6 MB, 25 min")                                         |
| Elenco                      | Só se `audiolivros_elenco`; seletor dentro de "Voz e modo", painel que já existe (`PainelDoElenco`)                                                           |
| Avatar-narrador             | Opcional (`avatar_3d`+`avatar_elenco`); nunca obrigatório; sem avatar a experiência é completa                                                                |
| Rótulo                      | Chip visível e lido pelo leitor de tela: "Voz sintetizada" (AI Act, art. 50), em todo player, fixo, não dispensável                                           |
| Acessibilidade              | Teclado (já há Espaço, setas, `[` `]`), `aria-keyshortcuts`, `aria-live` educado para troca de capítulo, alvo de toque ≥ 44 px, contraste, movimento reduzido |
| Crianças / perfil protegido | Só catálogo visível ao perfil (`visivelPara` e classificação etária aprovada); sem nuvem de livro próprio; sem telemetria de escuta; sem avatar de terceiros  |
| PiP / Legendar              | **Fase posterior, só se couber**: o mini-player do PiP mostra a frase atual e play/pausa. Não entra no MVP (evita poluir a UI)                                |

### 6.6 Livro do usuário (T2)

- Padrão: `Narrador` com Web Speech (como hoje). Nada novo sai do aparelho.
- Voz natural da nuvem: **só** quando todos valem: flag `audiolivros_nuvem` + flag `voz_natural` + entitlement `vozNatural` + consentimento
  explícito e **por livro** (texto curto, ver seção 9.4) + perfil adulto + cota (`vozCaracteresMes/Dia`). Recusa (402/429/503) lê a mesma frase com
  a voz do aparelho (comportamento atual do narrador).
- O texto é enviado **frase a frase em tempo de leitura** (como hoje), sem cache compartilhado e sem gravar áudio do servidor (`Cache-Control: no-store`).
  Sem botão de baixar o áudio gerado. Os campos de clonagem seguem barrados (`conferirSemClonagem`).
- Mostrar antes: "esta frase usa X caracteres do seu mês" e saldo (padrão IA10 da spec de 26/10).

### 6.7 Elenco por personagem (T3)

- Já existem: heurística `marcarFrases`, mapa personagem para voz, painel do elenco, validação `validarMarcacaoDaIa` e o ponto de extensão
  `planejarElenco(textos, cfg, dist, previas)`.
- Novo: `scripts/livros/gerar-elenco.mjs` (offline, `claude -p`/`agy -p`, zero de API), saída `elenco/<livro>/<cap>.json` alinhada ao índice da frase,
  carregada como a ficha. Nada de pedir IA em tempo de leitura; livro trazido fica com a heurística.
- **Gold set nosso antes de confiar**: 3 a 5 livros do catálogo, ~200 falas anotadas à mão (pt) + 100 (es, en); baseline = regra de travessão.
  Limiar: acurácia de atribuição ≥ 90% nas explícitas e ≥ 75% nas implícitas (ESTIMATIVA de piso; o LLM pequeno chegou a 89,1% nas implícitas em
  inglês, e não há número em pt/es [relatório §4]); o que ficar abaixo de 0,5 de confiança cai no narrador.
- No áudio gravado (T1), cada falante vira uma **faixa de timbre** do motor (Qwen3 CustomVoice) ou, sem motor com vários timbres, só narrador. O
  manifesto lista `elenco: true` e as vozes usadas.

## 7. Qualidade: bancada `scripts/eval-voz/` (proposta)

Espelha `scripts/eval-fala` (`medir-wer.mjs`, `bancada/`, `src/core/eval/wer.ts` já existe). Nada instalado nesta entrega.

### 7.1 Pipeline

1. `montar-frases.mjs`: extrai por script os trechos de domínio público (Gutenberg/Wikisource curados) e gera `corpus-voz.jsonl` com: `id`, `idioma`, `texto`,
   `categoria`, `itens[]` (gabarito dos itens difíceis). **14 frases de pt** (Dom Casmurro cap. I e V, diálogo com "--", Eça, soneto, números,
   romanos/ordinais, siglas, nomes estrangeiros, estrangeirismo, homógrafos, frase longa, entonação, reticências) [relatório §8.2] + as mesmas categorias em en e es.
2. `sintetizar.mjs --motor <id> --voz <id>`: gera WAV por frase e por trecho longo (10 min), registra **RTF** (tempo de síntese ÷ duração) e memória.
3. `medir-roundtrip.mjs`: Whisper (o mesmo modelo/normalização da `eval-fala`; `condition_on_previous_text=false`, corte de silêncio nas pontas);
   normaliza referência e hipótese igual (minúsculas, sem pontuação, números por extenso, ortografia, travessão); reporta **WER e CER** com `src/core/eval/wer.ts`.
4. `medir-itens-dificeis.mjs`: acerto por item (nome, número, sigla) contra o gabarito manual; relatório por categoria.
5. `medir-estabilidade.mjs`: alinha a transcrição do trecho longo com o texto; conta inserções (repetição) e deleções (omissão); lista frases com
   duração/caractere fora de ±30% da mediana da própria voz.
6. `utmos.mjs` (opcional): UTMOS/UTMOSv2 como **sinal secundário**, sem limiar [relatório §8.1].
7. `gerar-formulario.mjs`: monta a escuta cega (A/B/C aleatório, 1 âncora ruim, 2 frases repetidas) e o CSV com as colunas
   `ouvinte, idioma, frase_id, voz_cega, naturalidade, clareza, erros[], comentario`; a chave `voz_cega → modelo` fica em arquivo separado.
8. `julgar-texto.mjs`: **juiz por LLM só para o texto** (`claude -p`/`agy -p`, sem API): classifica a diferença fonte × transcrição (nome errado,
   número lido errado, omissão, repetição) e revisa o gabarito. Não avalia naturalidade, prosódia nem timbre [relatório §8.4].
9. `relatorio.mjs`: tabela por motor/voz/idioma (CER, WER, itens, estabilidade, RTF, notas), no formato dos relatórios de `docs/auditoria/eval/`.

### 7.2 Limiares automáticos (PROPOSTA; calibrar na F0 contra o baseline Web Speech/Piper e travar em seguida)

| Métrica                                              | pt-BR  | en     | es     | Observação                                                                    |
| ---------------------------------------------------- | ------ | ------ | ------ | ----------------------------------------------------------------------------- |
| CER agregado nas 14 frases (após normalizar)         | ≤ 3,0% | ≤ 2,0% | ≤ 3,0% | Eliminatório                                                                  |
| WER agregado                                         | ≤ 8,0% | ≤ 5,0% | ≤ 7,0% | Eliminatório; afrouxar só com justificativa escrita                           |
| Itens difíceis corretos (nomes, números, siglas)     | ≥ 85%  | ≥ 90%  | ≥ 90%  | Após o pré-processador da F1; **números e anos: 100%** nas frases do gabarito |
| Texto longo (10 min): inserções + deleções           | ≤ 1,0% | ≤ 1,0% | ≤ 1,0% | Das palavras do trecho                                                        |
| Frases com duração/caractere fora de ±30% da mediana | ≤ 3%   | ≤ 3%   | ≤ 3%   | Sinaliza pausas e aceleração estranhas                                        |
| Frase sem áudio, truncada ou repetida (contagem)     | 0      | 0      | 0      | Falha dura no lote: o script regera a frase até 2 vezes                       |
| RTF no hardware do lote                              | ≤ 0,5  | ≤ 0,5  | ≤ 0,5  | Medir na GPU alugada, não em H200                                             |

Origem: números são **ESTIMATIVA** do desenho (sem benchmark em pt-BR; o relatório §1 item 4 e §11 dizem NC), por isso a regra "calibrar na F0".

### 7.3 Escuta humana e regra de decisão

- 3 a 5 ouvintes fluentes (incluir 1 jovem do público com consentimento do responsável, sem dado pessoal além de apelido), 3 a 5 vozes por idioma.
- É **triagem indicativa, não prova estatística** [relatório §8.3]. Critério de aceite da voz: **média de naturalidade ≥ 3,5/5**, **"aguentaria 30 min" ≥ 60%
  de sim**, **nenhum "erro grave" repetido em ≥ 2 ouvintes**, e **melhor que a voz do aparelho em ≥ 0,5 ponto** (senão não vale gastar).
- **Regra final: passa no limiar automático E o dono ouve e aprova.** O limiar elimina; o ouvido do dono decide. Um número bom nunca aprova sozinho,
  e a escuta do dono pode reprovar um motor que passou nos números.
- Reuso depois: a mesma bancada roda quando trocarmos de motor ou de versão (regressão) e antes de cada lote grande (amostra de 5% dos capítulos).

## 8. Custo e escala

Fontes: preços de GPU do site da RunPod (consultado em 31/10/2026: RTX 4090 US$ 0,34/h Community e US$ 0,89/h Secure; L4 US$ 0,44 a 0,59; L40S US$ 0,79 a 1,09);
voz na nuvem de `src/core/planos.ts` (Chatterbox/DeepInfra US$ 1,00 por 1M de caracteres, ~54.000 caracteres por hora ⇒ **US$ 0,054 por hora de áudio**);
R2: US$ 0,015 por GB-mês, egresso gratuito, 10 GB grátis (conhecimento do operador; a página da Cloudflare **não abriu** na pesquisa de hoje: **confirmar**
em developers.cloudflare.com/r2/pricing antes de decidir). Calculado por mim com `npm run ia:custo -- --usuarios 1000 --essencial 50 --premium 30 --testes 100`
(somente leitura): custo no pior caso US$ 103,72/mês, típico US$ 49,57, margem no pior caso US$ 64,06. Esse custo **não inclui** audiolivros.

### 8.1 Tamanho do catálogo (contado em `public/catalogo/livros.json`, 328 livros)

| Escopo           | Livros | Horas no catálogo (180 palavras/min, o valor do `montar-catalogo.mjs`) | Horas de áudio (150 palavras/min, ESTIMATIVA ×1,2) |
| ---------------- | -----: | ---------------------------------------------------------------------: | -------------------------------------------------: |
| Piloto (10 pt)   |     10 |                                                                    ~60 |                                                ~72 |
| Todo o pt        |     70 |                                                                    363 |                                                436 |
| pt + en + es     |    240 |                                                                  2.104 |                                              2.525 |
| Catálogo inteiro |    328 |                                                                  2.898 |                                              3.478 |

Mediana de um livro: 360 min (6 h); p90: 1.183 min. O piloto "10 pt" usa a mediana (ESTIMATIVA); a lista exata sai da seleção do dono (pergunta 4).
Só entram livros com **classificação etária aprovada** (303 de 328 aprovados no último commit).

### 8.2 Custo único de gerar (com 20% de retrabalho; RTF é **NC** até a F0, por isso duas hipóteses)

GPU-hora = horas de áudio × RTF × 1,2.

| Escopo           | Via GPU, RTF 0,3 (VoxCPM2 anuncia ~0,3 numa 4090 [relatório §3]) | Via GPU, RTF 1,0 (pessimista) | Via perna `tts` (DeepInfra) |
| ---------------- | ---------------------------------------------------------------: | ----------------------------: | --------------------------: |
| Piloto 72 h      |                                                       US$ 9 a 23 |                   US$ 29 a 77 |                     US$ 4,7 |
| pt 436 h         |                                                     US$ 53 a 140 |                 US$ 178 a 466 |                      US$ 28 |
| pt+en+es 2.525 h |                                                    US$ 309 a 809 |             US$ 1.030 a 2.697 |                     US$ 163 |

Faixas = RunPod Community (US$ 0,34) a Secure (US$ 0,89) por hora. Tudo é ESTIMATIVA até medir o RTF; mesmo o pior caso (US$ 2,7 mil) é custo **único**.
A coluna DeepInfra assume Chatterbox sem elenco e o contrato de retenção resolvido (texto é PD, então o risco é de contrato e não de dado pessoal).

### 8.3 Armazenamento e entrega (R2/CDN)

| Item                            | Conta                                                                          | Resultado                                    |
| ------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| Opus 32 kbps mono               | 32.000 bit/s × 3.600 s ÷ 8                                                     | **14,4 MB por hora** (ESTIMATIVA de bitrate) |
| Piloto 72 h                     | 72 × 14,4 MB                                                                   | ~1,0 GB                                      |
| pt 436 h                        | 436 × 14,4 MB                                                                  | ~6,3 GB                                      |
| pt+en+es 2.525 h                | 2.525 × 14,4 MB                                                                | ~36 GB                                       |
| JSON de tempos                  | ~600 frases/h × ~40 bytes (ESTIMATIVA)                                         | ~24 KB/h (desprezível)                       |
| Armazenamento                   | 36 GB × US$ 0,015, menos 10 GB grátis                                          | **~US$ 0,4 a 0,55/mês** (confirmar preço)    |
| Egresso                         | R2 não cobra saída; o CDN com domínio próprio cacheia na borda                 | US$ 0                                        |
| Leituras (classe B, US$ 0,36/M) | 1.000 pessoas × 10 h/mês × ~100 requisições/h (ESTIMATIVA), sem cache da borda | ~US$ 0,36/mês no pior caso                   |

Se for preciso AAC como segunda faixa (Safari), dobrar a linha de armazenamento: ainda abaixo de US$ 1/mês.

### 8.4 Gerar uma vez × gerar sob demanda

Premissa (ESTIMATIVA): 20% dos usuários ouvem 5 h/mês de catálogo.

| Usuários ativos | Horas ouvidas/mês | Sob demanda na nuvem (US$ 0,054/h) | Pré-gerado (T1, escopo pt+en+es) |
| --------------: | ----------------: | ---------------------------------: | -------------------------------: |
|           1.000 |             1.000 |                         US$ 54/mês |                 US$ ~0,5 a 1/mês |
|          10.000 |            10.000 |                        US$ 540/mês |                   US$ ~1 a 5/mês |
|         100.000 |           100.000 |                      US$ 5.400/mês |                 ~US$ 10 a 40/mês |

Sob demanda com GPU própria 24 h/dia custa no mínimo ~US$ 245/mês ocioso (RTX 4090 Community, 720 h × US$ 0,34). O custo único do lote
(US$ 4,7 a 2.697) se paga em **menos de 1 a ~50 meses**, dependendo do escopo e do uso; para o piloto e o pt, em 1 a 6 meses a partir de 1.000 usuários.
Mesmo sob demanda, o cache compartilhado reduziria o custo, mas voltaria a gastar GPU/latência no primeiro ouvinte de cada capítulo e depende de nuvem ligada.

### 8.5 Nuvem Premium para livro do usuário (T2) e coerência com `custo-de-ia`

Reaproveita as cotas que já existem em `src/core/planos.ts` (nenhum campo novo no MVP):

| Plano (id)         | `vozCaracteresMes` | Horas de voz (÷ 54.000/h) | Custo no teto (US$ 1/M) |
| ------------------ | -----------------: | ------------------------: | ----------------------: |
| Grátis / Essencial |                  0 |                         0 |     0 (voz do aparelho) |
| Premium (R$ 19,90) |            600.000 |                     ~11 h |              ≤ US$ 0,60 |
| Plus (R$ 14,90)    |            150.000 |                    ~2,8 h |              ≤ US$ 0,15 |
| Família / Pro      |            600.000 |                     ~11 h |              ≤ US$ 0,60 |
| Teste de 14 dias   |             30.000 |                    ~0,6 h |              ≤ US$ 0,03 |

- A margem no pior caso **já** inclui esse teto (Premium: receita líquida ≈ US$ 3,15, custo no teto US$ 1,76 ⇒ margem US$ 1,39, 44%;
  `docs/estrategia-comercial-e-custos-br.md`). Compartilhar a cota existente mantém **margem ≥ 0** no pior caso e **teto em USD** por pessoa.
- Se o dono quiser uma subcota **separada** para livros (ex.: +300.000 caracteres ≈ +US$ 0,30), a margem do Premium cai de US$ 1,39 para US$ 1,09:
  ainda ≥ 0. Antes disso, exige medir o uso real (a matriz diz que são estimativas).
- `AI_BUDGET_USD_MONTH`/`_DAY` seguem como portão global (o simulador sugeriu 132 e 7 na base de 1.000 usuários). **Teto para toda via de teste:**
  o spike da F0 gasta no máximo **US$ 5 de GPU alugada ou 6 h de GPU** (o que vier primeiro); a perna DeepInfra de teste, no máximo **US$ 2** (≈ 37 h de áudio).
  Estourar o teto para o trabalho e pede decisão do dono.
- Gemini proibido; só provedores com `retencao: 'zdr'` na nuvem do T2; chave em `.env`/secrets do host, nunca em arquivo versionado.

## 9. Disponibilização até o usuário final

### 9.1 Flags (nascem DESLIGADAS; migração PG 0017, número provisório)

| Flag                 | Faz                                                                       | Depende de                                             |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `audiolivros`        | Mostra "Ouvir" com áudio gravado do catálogo (T1) e o player sincronizado | Áudio no R2 e manifesto válido                         |
| `audiolivros_nuvem`  | Permite voz natural para livro próprio (T2) com consentimento             | `voz_natural`, entitlement `vozNatural`, consentimento |
| `audiolivros_elenco` | Voz por personagem no áudio do catálogo e no narrador                     | `audiolivros`; independe de `avatar_3d`                |

Flag é interruptor de produto, não de direito: **quem pode gastar nuvem é o entitlement e a cota no servidor** (`docs/flags.md`). Desligada,
nada novo aparece e nenhum chunk/rota novo carrega.

### 9.2 Degraus de abertura (cada um com critério de saída; produção só depois do dono)

| Degrau | Onde         | Quem                                                                   | Mecanismo                                           | Fica aqui até                                                   |
| -----: | ------------ | ---------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
|      0 | Dev/testes   | Time                                                                   | Flag ligada no teste                                | F2 verde                                                        |
|      1 | Staging      | Dono                                                                   | `ids` do dono, `percentual: 0`                      | Passeio manual + Safari/Chrome/Android + escuta aprovada        |
|      2 | Beta fechado | 10 a 30 convidados adultos (lista)                                     | `ids` da lista, `percentual: 0`                     | 2 semanas com os critérios de qualidade e de risco da seção 9.3 |
|      3 | % gradual    | 5% → 25% → 50% → 100% (adultos, depois todos conforme a classificação) | `percentual` com balde estável; cada passo ≥ 3 dias | Métricas dentro do limite em cada passo                         |
|      4 | GA           | Todos conforme plano e classificação                                   | Flag 100%                                           | Estável por 2 semanas; arquivar change                          |

Menores só entram no degrau 3 em diante, depois do parecer do ECA Digital e com revisão do dono (seção 10).

### 9.3 Métricas (sem texto de livro, sem voz de pessoa; telemetria de escuta desligada por padrão para menores)

| Tipo      | Métrica                                     | Limite que PARA o avanço (ESTIMATIVA)                   |
| --------- | ------------------------------------------- | ------------------------------------------------------- |
| Sucesso   | Pessoas que tocam ≥ 5 min / quem vê "Ouvir" | ≥ 25% (meta; só informa, não bloqueia)                  |
| Sucesso   | Capítulos concluídos / iniciados            | ≥ 50%                                                   |
| Qualidade | Nota "a voz está boa?" (1 clique, opcional) | média ≥ 3,8/5; < 3,5 = pausar o degrau                  |
| Qualidade | Botão "voz errada aqui" por 1.000 frases    | ≤ 2 (corrige o capítulo e regera)                       |
| Risco     | Abandono nos primeiros 60 s                 | ≤ 35% (acima disso, investigar voz/latência)            |
| Latência  | Tempo até o primeiro áudio (T1, p95)        | ≤ 1,5 s com CDN; ≤ 3 s na nuvem (T2)                    |
| Erro      | Falha de carregamento do áudio              | ≤ 1% das reproduções                                    |
| Custo     | US$ por hora ouvida na nuvem (T2)           | ≤ US$ 0,06; custo mensal ≤ 80% de `AI_BUDGET_USD_MONTH` |
| Custo     | R2: leituras e GB                           | Alerta se > 3× a previsão                               |

Instrumentação segue as métricas existentes (Workers Analytics Engine/Langfuse, sem conteúdo); eventos novos só com contagem e identificador de livro.

### 9.4 Textos ao usuário (pt-BR, linguagem de benefício, sem manipulação; rascunho para o dono revisar)

- Botão: **Ouvir** · Chip fixo: **Voz sintetizada** · Aviso do capítulo: "Narração gerada por computador. Você pode trocar a voz ou usar a do seu aparelho."
- Offline: "Baixar este capítulo (≈ 6 MB). Ele fica só neste aparelho e você apaga quando quiser."
- Livro próprio, voz natural (consentimento por livro): "Para usar a voz natural, as frases que você ouvir serão enviadas ao nosso servidor de voz só durante a leitura.
  Não guardamos o texto nem o áudio. Se preferir, use a voz do seu aparelho: o livro não sai dele." Botões: **Usar voz natural** / **Manter no aparelho**.
- Cota: "Você usou 70% da voz natural deste mês. Depois disso, a voz do aparelho continua lendo." (sem contagem regressiva, sem urgência, sem culpa).
- Plano: "O Premium inclui voz natural para os seus livros e vozes diferentes para os personagens." Sem "últimas horas", sem "você perde", sem comparar com quem não assina.
- Erro: "Não conseguimos tocar este capítulo agora. Vamos ler com a voz do seu aparelho." Sem culpa e sem tecnês.
- Para o responsável (perfil de menor): lista de livros liberados para a idade; nada de anúncio premiado; sem nuvem de livro próprio.

### 9.5 Planos (PROPOSTA; quem decide preço e plano é o dono; sem alterar `src/core/planos.ts` nesta entrega)

| Recurso                                      |            Grátis            | Essencial | Premium / Plus / Família / Pro |
| -------------------------------------------- | :--------------------------: | :-------: | :----------------------------: |
| Ouvir clássicos do catálogo (áudio gravado)  |             Sim              |    Sim    |              Sim               |
| Narração local do livro próprio (aparelho)   |             Sim              |    Sim    |              Sim               |
| Voz natural da nuvem no livro próprio (cota) |             Não              |    Não    |  Sim, pela `vozCaracteresMes`  |
| Elenco (vozes por personagem) no catálogo    |  1 título de demonstração?   |   Sim?    |              Sim               |
| Baixar capítulo para ouvir offline           | Sim (limite de 3 capítulos?) |    Sim    |              Sim               |

Justificativa: o catálogo pré-gerado custa quase zero por pessoa (seção 8.3), então travar o básico não paga o custo e prejudica a missão; o
diferencial pago está onde há custo real (nuvem) e valor extra (elenco). Os pontos com "?" são perguntas ao dono (seção 12). Sem anúncio dentro do player.

### 9.6 Suporte e feedback

Botão "Algo errado nesta frase?" (envia id do livro, capítulo, índice da frase e categoria; sem texto livre por padrão para menores), "Voz boa/ruim" opcional,
página de ajuda curta, e fila semanal de revisão (o dono ouve os 10 itens mais reportados). Kill-switch e playbook no runbook.

### 9.7 Kill-switch

Três camadas, da mais rápida: (1) desligar a flag pelo CLI/admin (`flags`), sem deploy; (2) `CHECKOUT_ENABLED`-style porta do plantão para a nuvem
(já existe para `voz_natural`: 503 `voz_natural_desligada`); (3) trocar o ponteiro do manifesto para a versão anterior no R2. O cliente sempre
cai no narrador local se o áudio falhar.

## 10. Legal e ético (gates antes de ligar; NÃO é parecer jurídico)

| Gate                                    | O que precisa estar pronto                                                                                                                                                                          | Fonte                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| G1 Parecer espeak-ng (GPL-3.0)          | Resposta à pergunta da seção 6.4; **motor do catálogo sem espeak-ng** não depende dele, mas qualquer uso de Piper/Kokoro depende                                                                    | [relatório §2]                                  |
| G2 Origem das vozes                     | Registrar dataset/voz de cada voz usada (faber CC0, SIWIS CC-BY etc.) e o texto da licença do model card                                                                                            | [relatório §9]                                  |
| G3 ECA Digital (Lei 15.211/2025)        | Perfil protegido por padrão, minimização, sem perfilamento, sem telemetria de escuta para menor; consulta B1 do `GUIA-DO-DONO` cobre o resto                                                        | [relatório §9]                                  |
| G4 LGPD e voz                           | Voz 100% sintética de catálogo não trata voz de pessoa; **se um dia houver ditado**, é dado sensível: nova análise. `docs/lgpd/operadores.md` e `ropa.csv` atualizados para o provedor da nuvem     | [relatório §9]; `docs/flags.md` (`voz_natural`) |
| G5 AI Act, art. 50                      | Rótulo "Voz sintetizada" visível e acessível; marca em metadados do arquivo (campo de manifesto e tag) se o áudio puder sair do app; se vale para TTS que roda no navegador e nunca exporta: **NC** | [relatório §9]                                  |
| G6 Direitos autorais                    | Catálogo: só domínio público no Brasil (Lei 9.610, art. 41), edição/tradução conferida (já há `licenca` por livro). Livro trazido: só no aparelho, uso privado, **sem exportar áudio**              | `docs/livros-catalogo.md`; [relatório §9]       |
| G7 Contrato do provedor de voz em nuvem | DPA/retenção zero registrado da DeepInfra (ou outro) antes de ligar `audiolivros_nuvem`                                                                                                             | `docs/pesquisa/2026-10-21-vozes-por-nivel.md`   |
| G8 Classificação etária                 | O áudio só aparece para quem vê o livro (`visivelPara`)                                                                                                                                             | `docs/livros-revisao-etaria-para-o-dono.md`     |

## 11. Plano de entrega por fases (estimativa em dias úteis de trabalho; ESTIMATIVA)

| Fase | Entrega                                                                      | Estimativa                                   | Depende de                                         |
| ---- | ---------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| F0   | Spike de motor com bancada mínima e decisão                                  | 2 dias                                       | GPU alugada (teto US$ 5); jurídico em paralelo     |
| F1   | Bancada `scripts/eval-voz/` completa + pré-processamento pt-BR em `src/core` | 5 a 6 dias                                   | F0                                                 |
| F2   | Lote do piloto (10 livros pt) + R2 + player sincronizado no leitor           | 8 a 10 dias                                  | F1; PR de Livros mesclado; bucket criado pelo dono |
| F3   | Elenco/voz por personagem para o piloto                                      | 5 a 6 dias                                   | F2; gold set; motor com ≥ 4 timbres                |
| F4   | Livro do usuário (aparelho) + nuvem Premium com consentimento e cota         | 6 a 8 dias                                   | F1; `voz_natural` em staging; G7                   |
| F5   | Beta fechado + métricas                                                      | ~3 dias de dev + 2 semanas de calendário     | F2 (F3/F4 opcionais)                               |
| F6   | GA gradual                                                                   | ~2 dias de dev + 1 a 2 semanas de calendário | F5 e G1 a G8                                       |

Total de engenharia: **30 a 38 dias úteis** (ESTIMATIVA), com F3 e F4 podendo andar em paralelo após F2.

### F0 · Spike e decisão do motor

- **Pronto quando:** relatório em `docs/pesquisa/2026-11-xx-audiolivros-spike.md` com, para cada candidato (Qwen3 CustomVoice 0,6B e 1,7B, Chatterbox pt-BR, VoxCPM2, Piper `faber`, Web Speech): RTF medido, GB, CER/WER nas 14 frases pt, lista das vozes, se expõe duração por frase, se embute componente GPL; e **uma recomendação por idioma** pelo critério da seção 6.4.
- **Como verificar:** rodar `node scripts/eval-voz/relatorio.mjs --fase 0` (versão mínima) e ler a tabela; o dono ouve as amostras cegas; gasto de GPU ≤ US$ 5 (recibo anexado).
- **Riscos:** nenhum motor aceitável em pt-BR ⇒ ficar na opção 0 + T2 e voltar ao jurídico sobre Kokoro/Piper.

### F1 · Bancada e pré-processamento

- **Pronto quando:** `scripts/eval-voz/` roda ponta a ponta em < 30 min por motor; o pré-processador em `src/core/texto/` (ou pasta equivalente) tem ≥ 60 casos de teste (números, ordinais, romanos, moeda, siglas, travessão, reticências) com 100% verdes; os 14 itens pt têm gabarito; limiares da seção 7.2 calibrados e gravados em `scripts/eval-voz/limiares.json`.
- **Como verificar:** `npx vitest run tests/preprocessador-voz*.test.ts`; `npm run typecheck && npm run lint`; `core` sem importar React/rede (regra de ESLint).
- **Riscos:** ortografia antiga do Gutenberg ("annos") ⇒ modo original e modernizado medidos separado.

### F2 · Piloto de 10 livros + R2 + player

- **Pronto quando:** 10 livros pt com `manifesto.json` e capítulos no R2 de staging; **100% dos capítulos passam nos limiares**, **0 frases sem áudio**, amostra de 5% ouvida pelo dono e aprovada; player toca, destaca a frase, retoma e baixa o capítulo; **1º áudio p95 ≤ 1,5 s** em staging; `audiolivros` desligada não carrega nada novo; chip "Voz sintetizada" presente.
- **Como verificar:** e2e (Playwright) com áudio de teste: tocar → frase destacada ≤ 300 ms do `t0` → recarregar retoma na mesma frase; teste de contrato valida manifesto × hash do texto; teste de CSP; teste de orçamento de chunk; `curl -I` do CDN mostra cache; Safari, Chrome e Android no passeio manual.
- **Riscos:** Opus no Safari ⇒ AAC como segunda faixa; texto do capítulo mudou ⇒ hash barra e cai no local.

### F3 · Elenco

- **Pronto quando:** `gerar-elenco` produz arquivos válidos para os 10 livros; gold set (≥ 200 falas pt) com acurácia ≥ 90% (explícitas) e ≥ 75% (implícitas); abaixo disso o capítulo fica só com narrador; ouvintes distinguem ≥ 80% dos personagens; manifesto lista as vozes.
- **Como verificar:** `node scripts/avatar/juiz-elenco.mjs` (existente) + comparação com gold; `npx vitest run tests/` do elenco; escuta cega do dono.
- **Riscos:** atribuição errada soa mal ⇒ confiança mínima 0,5 e fallback ao narrador.

### F4 · Livro do usuário + nuvem Premium

- **Pronto quando:** livro trazido nunca gera requisição com seu texto sem o consentimento por livro (teste e2e: rede vazia); com consentimento, 402/429/503 caem na voz do aparelho sem silêncio; consumo desconta `vozCaracteresMes/Dia`; perfil de menor não vê a opção; teto por pessoa ≤ US$ 0,60/mês (Premium) provado por teste de cota.
- **Como verificar:** testes de rota existentes de `tts` + novos; e2e com `speechSynthesis` simulado; `npm run ia:custo` sem mudança no pior caso.
- **Riscos:** retenção do provedor (G7) ⇒ não ligar até o contrato.

### F5 · Beta fechado

- **Pronto quando:** 10 a 30 convidados por 2 semanas; nota média ≥ 3,8/5; erro de carga ≤ 1%; abandono em 60 s ≤ 35%; nenhum incidente de privacidade; lista de "voz errada" tratada.
- **Como verificar:** painel das métricas da seção 9.3 e revisão semanal do dono; checklist do runbook.

### F6 · GA gradual

- **Pronto quando:** G1 a G8 fechados; 5% → 25% → 50% → 100% sem estourar nenhum limite da seção 9.3; custo do mês ≤ 80% do orçamento; arquivar a change e atualizar `docs/flags.md`, `docs/GUIA-DO-DONO.md` e a spec de 26/10.
- **Como verificar:** relatório de fim de rollout em `docs/pesquisa/`; runbook revisado.

### Riscos gerais e mitigação

| Risco                                   | Mitigação                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Nenhum motor aceitável em pt-BR         | F0 decide cedo e barato (≤ US$ 5); plano B = só T2 + melhorar a voz do aparelho     |
| Parecer jurídico demora                 | Motores escolhidos não dependem dele; Piper/Kokoro ficam como bônus                 |
| Custo da GPU estoura                    | RTF medido na F0; lote por escopo crescente (10 → 70 → 240); teto em USD por lote   |
| Texto do livro muda e o áudio desalinha | Manifesto com hash; cliente cai no narrador local                                   |
| Qualidade cai (versão nova do motor)    | Versão no manifesto; bancada de regressão; ponteiro volta à versão anterior         |
| UI poluída                              | Um botão "Ouvir"; opções dentro de "Voz e modo"; PiP fora do MVP                    |
| Menor exposto a conteúdo/nuvem          | Classificação etária, sem nuvem de livro próprio, sem telemetria; produção fechada  |
| Dependência do PR de Livros             | F2 só começa com o leitor/catálogo mesclado (base `feat/avatar-integracao` já traz) |

## 12. Perguntas em aberto para o dono (as 5 que mudam a decisão)

1. **Escopo e prioridade de idiomas do primeiro lote:** só pt (70 livros, ~436 h) ou já en e es (240 livros, ~2.525 h)? Muda o custo de US$ 28 a US$ 163 (via nuvem) ou de US$ 53 a US$ 809 (GPU) e a quantidade de escuta humana.
2. **Elenco no MVP:** vale exigir motor com vários timbres (Qwen3), mesmo que a nuvem barata (Chatterbox, uma voz) seja mais simples? Se "sim", o T3 manda na escolha do motor.
3. **Catálogo ouvido no Grátis?** Proponho Sim (custo ~0, missão do produto), com elenco e nuvem no pago. Aceita, ou prefere limitar (ex.: 3 capítulos offline, 1 título de demonstração)?
4. **Quais 10 livros do piloto?** Sugestão: os mais populares do pt com classificação aprovada (Dom Casmurro, Os Lusíadas, Memórias Póstumas, O Guarani, A Escrava Isaura…). Você escolhe e revisa a ortografia (original × modernizada).
5. **Quem escuta e aprova?** Você sozinho, ou também 3 a 5 convidados (incluindo 1 jovem do público com consentimento)? E aceita o teto de US$ 5 de GPU + US$ 2 de DeepInfra para a F0?

## 13. Divergências e lacunas achadas nas notas (para o dono saber)

- **Piper:** MIT no `rhasspy/piper` (arquivado) e GPL-3.0 no `OHF-Voice/piper1-gpl` (ativo); a nota de avaliação só diz "fontes divergem" [relatório §11].
- **foliate-js:** nota de análise diz "NC" para licença; outras dizem MIT. Ler o `LICENSE` do vendor antes da F2.
- **Kokoro:** o problema do espeak-ng atinge também o inglês via `kokoro-js`/`phonemizer`, não só pt/es; no sherpa-onnx a doc oficial só lista "inglês e chinês" para Kokoro v1_0.
- **Spec de 26/10 (NAR05)** prevê MP3 sob demanda e ZIP; esta proposta muda para pré-geração. Registrar ao arquivar.
- **Preço do R2** não pôde ser reconferido em página oficial hoje (bloqueio de acesso): marcado "confirmar".
- **Horas do catálogo** usam 180 palavras/min (valor do script); narração real tende a ~150 palavras/min: usei ×1,2, ESTIMATIVA.
- **Pesquisa NC que afeta o plano:** RTF por modelo, vozes do Qwen3 CustomVoice e se alguma é nativa pt-BR, duração por frase em cada motor, Opus no Safari, correlação de UTMOS com humanos em pt-BR.

## 14. Fontes

- Relatório de pesquisa de 31/10/2026 e notas (caminho no topo); links de licença e de modelos estão no relatório §3, §7 e §11.
- Código e docs do repositório: `src/core/planos.ts`, `docs/flags.md`, `docs/estrategia-comercial-e-custos-br.md`, `docs/pesquisa/2026-10-21-vozes-por-nivel.md`,
  `docs/specs/2026-10-26-livros-e-leitura.md`, `docs/specs/2026-10-28-narracao-v2.md`, `docs/specs/2026-10-28-avatar-elenco-ia.md`, `docs/livros-catalogo.md`,
  `public/catalogo/livros.json`, `scripts/eval-fala/`, `server/ai/provedoresDeVoz.ts`, `server/ai/ttsProxy.ts`.
- Preços de GPU: https://www.runpod.io/pricing (consultado em 31/10/2026). R2: https://developers.cloudflare.com/r2/pricing/ (não aberto: confirmar).
