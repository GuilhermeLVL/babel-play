> Este é o método com que o projeto se mede. Os instrumentos, evidências e o registro de achados
> vivem num repositório privado de auditoria; aqui fica o MÉTODO, porque é ele que explica os
> números do README e as regras do CI. Caminhos `audit/…`, `results/…` e `openspec/…` citados
> aqui e em comentários do código apontam para esse repositório privado.

# Metodologia da auditoria

Este documento não propõe nada. Ele **descreve o que os scripts deste diretório já fazem** — a
doutrina vinha vivendo espalhada em cabeçalhos de arquivo e comentários de `achados.json`, o que
obrigava cada leitor novo a reconstruí-la lendo código.

Se este documento e o código discordarem, **o código está certo** e este arquivo está velho.

---

## 1. As seis regras

### 1.1 Todo número aponta para um campo exato de um artefato versionado

Um achado não diz "a latência é alta". Ele diz que
`audit/evidence/fase-6/carga.json` no campo `latenciaGlobal.p95` vale `790.9`.

`audit/scripts/rastrear.mjs` **reabre cada artefato citado, resolve o campo e compara**. Divergiu,
sumiu, ou o arquivo não existe: reprova o registro inteiro com exit 1. É passo do CI.

Isso torna impossível um relatório envelhecer em silêncio — que foi exatamente o que aconteceu com
`99-final.md`, escrito à mão, dizendo 34 achados quando havia 45.

### 1.2 Achado cita evidência CONGELADA; regressão compara contra o baseline VIVO

| Diretório | Natureza | Para quê |
|---|---|---|
| `audit/baseline/` | regravado a cada execução | detectar regressão entre dois pontos |
| `audit/evidence/fase-N/` | **imutável**, congelado ao fim da fase | sustentar os números de um achado |

A separação existe porque o erro já aconteceu: achados citavam o baseline vivo, o próprio commit da
auditoria mudava os números, e o validador reprovava. O erro não era o número — era a fonte.

A única exceção declarada está em `audit/evidence/PODA.md`: três descartes por volume, cada um com
motivo escrito e substituto nomeado.

### 1.3 `RESOLVIDO` exige medição "depois" **e** uma prova que roda agora

Um achado só muda para `RESOLVIDO` se tiver ao menos uma medição com `rotulo: "depois"`. E o campo
`provaDeConserto.comando` precisa rodar e satisfazer o critério **hoje**, o que
`rastrear.mjs --provar` verifica.

Na primeira vez que `--provar` rodou sobre o registro inteiro, **6 de 22 provas reprovaram**: duas
com o critério invertido, uma que nunca terminava (`npm start`), e três que denunciaram defeito real
no código. Uma delas chamava `rastrear --provar` recursivamente.

### 1.4 O veredicto vem de exercitar, nunca de uma constante

Um instrumento cujo resultado está escrito no código-fonte não é detector: é opinião com data.

`audit/scripts/midia.mjs` documenta o preço dessa lição — três vetores traziam
`resultado: 'VULNERAVEL'` como constante, e por semanas reportaram como vulnerável o que já estava
consertado. Hoje o veredicto vem de rodar a suíte que trava cada vetor: removida a guarda, o vetor
volta a ✗ sozinho.

Corolário: **"lê o código e conclui" não é medição.** O commit `2bcdcff` marca um achado como
IMPROCEDENTE com a frase *"eu inferi em vez de medir"*.

### 1.5 Gates são ratchets: falham em PIORA, não em estado ruim

Exigir zero tem um resultado previsível — o gate nasce vermelho, alguém o desliga "só até
limparmos", ninguém religa. O ratchet mantém a dívida **visível no relatório** sem travar o
trabalho, e cada correção baixa o teto.

O contrapeso: **recongelar um baseline exige `--motivo` com pelo menos 40 caracteres.** Sem isso o
ratchet vira botão de silenciar; com isso, silenciar deixa registro de quem e por quê.

Corolário: um gate não é instalado antes do conserto do que ele mede. A Fase 11 mediu nove achados
e **não adicionou nenhum gate**; a Fase 12 consertou seis e só então instalou o
`gate-seguranca.mjs`. Instalá-lo antes faria o CI falhar por dívida conhecida desde o primeiro dia.

Segundo corolário, aprendido ao escrever esse gate: **um gate de piora precisa de porta
anti-falso-verde.** Zero achados é o que ele considera ótimo — e é também o que uma montagem de
volume malfeita produz. Por isso `gate-seguranca.mjs` sai com erro (2), e não com sucesso, quando o
SAST varreu 0 arquivos ou a varredura de histórico não leu commit nenhum.

### 1.6 Relatórios de achado e de UX são GERADOS, nunca escritos à mão

`audit/reports/ACHADOS.md` sai de `rastrear.mjs`. Editá-lo à mão é escrever num arquivo que a
próxima execução sobrescreve — e desacoplar o texto dos números que ele deveria refletir.

Os relatórios de fase (`00-…` a `11-…`, `99-final.md`) **são** escritos à mão, e por isso carregam
um aviso: ao ler um número neles, prefira o de `ACHADOS.md`.

---

## 2. Os cinco estados de um achado

| Estado | Significa | Exige |
|---|---|---|
| `ABERTO` | medido, não corrigido | medição `antes` |
| `RESOLVIDO` | corrigido **e** provado | medição `depois` + prova que roda |
| `ACEITO` | risco assumido, ou resultado positivo registrado | `motivo` |
| `INDETERMINADO` | não foi possível provar | `motivo` |
| `IMPROCEDENTE` | o achado estava errado | `motivo` |

**`IMPROCEDENTE` existe para corrigir um viés.** Sem ele, a saída fácil para um achado mal medido é
apagá-lo e fingir que nunca existiu — o que é pior, porque some a informação de que a medição foi
mal feita. Refutar carrega o mesmo ônus de prova que afirmar.

`ACEITO` também cobre o **achado positivo**: F6-02 (zero perda de review sob carga) e F11-07
(nenhum segredo real no histórico) não são defeitos, são medições de que algo está certo. Registrá-
las dá linha de base para a próxima execução.

---

## 3. As quatro severidades

| | Critério |
|---|---|
| **P0** | perda de dado ou de dinheiro do usuário |
| **P1** | quebra função ou gate |
| **P2** | degrada |
| **P3** | higiene |

---

## 4. Anatomia de um achado

```jsonc
{
  "id": "F11-02",              // F<fase>-<n>
  "fase": 11,
  "severidade": "P2",
  "estado": "ABERTO",
  "titulo": "…",               // frase declarativa
  "detalhe": "…",              // prosa com números medidos e arquivo:linha
  "porQueImporta": "…",        // o impacto, não a repetição do detalhe
  "motivo": "…",               // obrigatório em ACEITO/INDETERMINADO/IMPROCEDENTE
  "medicoes": [
    { "rotulo": "antes|depois|parcial", "commit": "…",
      "arquivo": "audit/evidence/fase-11/…json", "campo": "a.b.0.c", "valor": 12 }
  ],
  "provaDeConserto": { "comando": "…", "criterio": "…" },
  "evidencia": ["…"]           // qualquer arquivo; só precisa existir
}
```

`commit: "PENDENTE"` é o valor correto enquanto o artefato citado ainda não estiver versionado.

---

## 5. Determinismo e instabilidade

Um instrumento cujo resultado muda entre execuções idênticas não distingue regressão de ruído.

- Todo campo que descreve a **execução** e não o **código** — timestamp, versão de scanner,
  duração — vai sob a chave `_volatil`.
- `audit/scripts/comparar.mjs` remove `_volatil` antes de comparar dois diretórios. Rodar um
  instrumento duas vezes e comparar precisa dar "sem diferenças".
- Variação que sobra, mas é conhecida, vai declarada em `audit/scripts/instabilidade.json`, com a
  **amplitude observada** e a causa. Ela continua **aparecendo** no relatório: absorvê-la numa
  tolerância silenciosa esconderia uma queda real do mesmo tamanho.

Consequência prática: quando a amplitude entre execuções idênticas passa de 100 % — como no p95 do
teste de carga — a resposta honesta sobre uma diferença de 2 % é **"não dá para saber"**.

---

## 6. Armadilhas já pagas

Cada uma custou uma medição errada. Estão aqui para não custarem duas.

| Armadilha | Como evitar |
|---|---|
| Ler a contagem impressa em vez do **exit code** | `npm test` já saiu 1 com 1.737 testes verdes (F0-09) |
| Zero achados com **zero arquivos varridos** | todo coletor registra `montagemValida` / `varreduraValida` |
| Docker no Windows com espaço/acento no caminho | `shell: false` e argumentos em array — sem shell não há reescrita de caminho |
| Instrumento que semeia dados e nunca limpa | ele passa a medir a própria história (F8-04) |
| Medir com a máquina ocupada | a carga da máquina é variável; registre-a ou meça quieto (F0-10) |
| Uma amostra apresentada como valor | reporte mediana **e** distribuição, com a amplitude na mesma linha |
| Casar string num corpo JSON cru | desserialize antes: as aspas vêm escapadas (F11-02) |
| Prova de conserto com critério invertido | `grep` sai 1 quando **não** acha; `ls` sai 2 quando não existe |
| **Prova de conserto que ESCREVE na evidência** | rodá-la reescreve o "antes" com o "depois" e o registro desanda — instrumento escreve no baseline vivo, nunca em `audit/evidence/` por padrão (F13-01) |
| `docker compose up -d` numa prova | ele retorna ANTES do healthcheck; a carga não alcança o alvo e a prova reprova um conserto certo. Use `--wait` |
| Encurtar `PROVA_PRAZO_MS` para "ir mais rápido" | `ux:medir --only=performance` leva 260s medidos; com 3 min, cinco provas boas reprovam por relógio |
| Prova cujo exit code não corresponde ao critério | `carga.mjs` sai 0 com SLO reprovado; um critério sobre o ARTEFATO precisa checar o artefato |
| Segredo detectado gravado no artefato | o artefato é versionado — `--redact` e só regra/arquivo/commit |
| Instrumento que varre as saídas da própria auditoria | escrever um relatório mudava `arquivosVarridos` (873→885) |
| Ler a mensagem de erro do scanner como se fosse a causa | 3 hipóteses sobre o `&` do JSX, 3 refutadas por fixture (F11-06) |
| Adicionar validação só para a métrica subir | onde um validador dedicado é melhor, deixe-o e **diga por quê** (F11-04) |
| Schema que amplia o contrato em vez de tipá-lo | `patchVocabSchema` cobre só o que a rota já aceitava |
| Apagar o teste que o conserto contradiz | inverta a asserção **com a razão escrita** (S-13 → F11-03) |
| Porta anti-falso-verde só no JSON | quem lê o **exit code** — CI, `provaDeConserto`, `&&` no terminal — vê 0 e conclui que correu bem. `segunda-opiniao.mjs` sai **2** quando uma porta reprova (F14) |
| `npx <pacote>` cujo binário tem outro nome | responde "could not determine executable to run"; e `npx.cmd` sob `shell: false` morre com `EINVAL` no Node 24. Fixe a dependência e spawne o **binário nativo** |
| Regra de lint/AST sem fixture | uma regra errada devolve zero e isso tem a cara de "código limpo". A 1ª versão de `catch-vazio` inocentava `catch` nu se houvesse comentário **no corpo do `try`**; 3 casos, achava 1, devia achar 2 |
| Teste do auditor que suja a árvore | um caminho absoluto do Windows achatado virou **arquivo na raiz**, e o SAST devolveu achado sobre um Dockerfile que não é do projeto. Todo caminho reportado tem de resolver a partir da raiz |
| Zero achados sem **controle positivo** | `varreduraValida` prova que a montagem funcionou, não que as políticas carregaram. `trivy config` varre um alvo sabidamente ruim e exige reprová-lo antes de `0` valer (F14) |
| Campo de medição com ponto na chave | `rastrear.mjs` resolve com `campo.split('.')`; `porRegra.<id-do-semgrep>` quebra. Exponha um campo com nome sem ponto |

---

## 7. Os instrumentos

Nenhum tem atalho em `package.json`; são invocados por caminho ou pelo CI.

| Script | O que faz | Custo |
|---|---|---|
| `baseline.mjs` | a régua única — 11 coletores num comando | ~2 min |
| `comparar.mjs` | diff entre dois baselines, ignorando `_volatil` | instantâneo |
| `deteccao.mjs` | knip + jscpd + cobertura + superfície dinâmica, nos 5 status | ~2 min |
| `gate-deteccao.mjs` | ratchet de código morto | instantâneo |
| `dados.mjs` | integridade referencial, blob, FSRS, planos — **somente leitura** | ~5 s |
| `midia.mjs` | os 5 vetores de mídia, exercitados | ~10 s |
| `carga.mjs` / `carga-repetida.mjs` | carga contra o container; a segunda reporta mediana | ~1 min |
| `seguranca.mjs` | SAST, segredos, SCA, Zod, erro, capa, injeção, TOFU, ratchet de UX | ~4 min |
| `gate-seguranca.mjs` | ratchet de SAST + cobertura Zod + segredos | ~3 min |
| `golden.ts` | congela 9 jogos + FSRS-5 + vocabulário, byte a byte | ~5 s |
| `segunda-opiniao.mjs` | ferramentas de terceiro rodadas **às cegas**: Semgrep com packs disjuntos, `trivy config` (IaC), ast-grep (regras arquiteturais), `.mcp.json` | ~6 min |
| `diff-ferramentas.mjs` | classifica cada achado bruto em NOVO / JÁ CONHECIDO / FALSO POSITIVO contra a tabela versionada; **o único da fase 14 que lê `achados.json`** | instantâneo |
| `conformidade.mjs` | matriz ASVS 5.0 + OWASP LLM 2025; reabre cada artefato, resolve o campo e avalia o critério | instantâneo |
| `rastrear.mjs` | **o validador** — confere cada número e gera `ACHADOS.md` | instantâneo |
| `sonda-*.ts` | exercitam um caminho real e imprimem uma linha de JSON | segundos |

As sondas vivem em arquivo e não em `npx tsx -e` por um motivo medido: o `-e` engole o erro em
silêncio, e o coletor registra `_naoFoiPossivelDeterminar` com stderr vazio — pior do que falhar.
