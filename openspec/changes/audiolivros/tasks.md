> **Revisão de 25/11/2026** (main `897c9d25`). Legenda: **[D]** = decisão ou ato do dono; **[R]** = aparelho real. Antes, cada tarefa
> tinha "Aceite:"; passou a "Verificar:". O código das fases F0 a F2 existe e está atrás de três flags desligadas; o que falta é do dono
> (jurídico, escuta, buckets, lista dos 10 livros) e o elenco e a nuvem do livro próprio. Em toda tarefa de código: `npm run typecheck`,
> `npm run lint` e só os testes dos arquivos tocados. Produção segue fechada: ligar flag é ato do dono.

## 0. M0 Especificação

- [x] 0.1 Spec técnica, change OpenSpec e esqueleto do runbook. Feito: `docs/specs/2026-10-31-audiolivros-e-leitura.md`, `docs/runbooks/audiolivros.md`.
      Verificar: `openspec validate audiolivros` passa (CLI ainda não instalado no ambiente; rodar antes de arquivar).
- [ ] 0.2 **[D]** Dono responde as 5 perguntas em aberto (spec, seção 12). 4 de 5 confirmadas em 31/10; falta a lista dos 10 livros e a ortografia.
      Verificar: a lista final (ids de `scripts/audiolivros/piloto.json`) e a ortografia (original ou modernizada) registradas no topo da spec.

## 1. F0 Spike e decisão do motor (teto US$ 5 de GPU)

- [ ] 1.1 **[D]** Enviar a consulta jurídica (espeak-ng em WASM e no servidor; OpenRAIL-M da Supertonic: restrições sobre menores e rótulo de voz gerada).
      A pergunta está escrita (`8f6788fe`); falta enviar. Verificar: protocolo ou data de envio anotado em `docs/runbooks/audiolivros.md`; a resposta não bloqueia a F0.
- [x] 1.2 Medir os motores candidatos. Feito: adaptadores locais Supertonic 3 e Pocket TTS (`scripts/audiolivros/sintetizador-local.mjs`, `spike/`), medições de CPU,
      formulário de escuta. Kokoro REJEITADO pelo dono (vozes ruins e espeak-ng GPL embutido até em inglês); não repropor.
- [x] 1.3 Escuta cega do dono: "as vozes são ótimas" (02/11). Voz candidata de trabalho: Supertonic 3 F1 (CER pt 4,5% contra 7,9% do Pocket).
      Falta registrar quais ids do formulário foram aprovados. Verificar: CSV preenchido e a recomendação por idioma pelo critério da spec 6.4.

## 2. F1 Bancada e pré-processamento

- [x] 2.1 `scripts/eval-voz/` (montar frases, sintetizar, round-trip, itens difíceis, estabilidade, formulário, juiz de texto, relatório). Feito.
      Verificar: roda ponta a ponta em menos de 30 min por motor (conferir com o motor aprovado).
- [x] 2.2 Pré-processador pt-BR em `src/core/leitura/` (`numerosPt.ts`, `prepararTextoParaVoz.ts`). Feito: `tests/preprocessador-voz-numeros.test.ts`.
      Verificar: ≥ 60 casos (números, ordinais, romanos, moeda, siglas, travessão, reticências) verdes; o core sem React nem rede (regra de ESLint).
- [ ] 2.3 **[D]** Travar os limiares em `scripts/eval-voz/limiares.json`. Hoje PROVISÓRIOS (CER ≤ 3%, WER ≤ 8%, estabilidade ≤ 1%): nenhum motor passa neles,
      embora o dono tenha aprovado a escuta. Verificar: valores recalibrados com o veredito de escuta, aprovados pelo dono, e `recomendar.mjs` apontando o motor escolhido.

## 3. F2 Piloto de 10 livros, R2 e player

- [ ] 3.1 **[D]** Buckets `frasy-audio(-staging)`, domínio e `VITE_AUDIO_URL` na CSP. Verificar: teste de CSP verde; `curl -I` no clipe mostra `Cache-Control` imutável e `Range` 206.
- [x] 3.2 `scripts/audiolivros/gerar-livro.mjs` (síntese frase a frase, Opus, `{i,t0,t1}`, manifesto com hash, retentativa ≤ 2). Feito: `tests/audiolivros-gerar.test.ts`.
      Falta gerar os 9 livros restantes: só `ws-pt-dom-casmurro` tem o capítulo 1 (`publicados.json`, voz `F1` provisória). Verificar: 0 frases sem áudio e capítulos nos limiares (2.3).
- [x] 3.3 Player sincronizado no leitor (botão Ouvir, destaque, retomar, chip "Voz sintetizada", baixar capítulo). Feito: `src/lib/leitor/audiolivro/`, `tests/audiolivro-ui.test.tsx`, `tests/audiolivro-reprodutor.test.ts`.
      Falta: sono e fila (conferir no código) e Safari. Verificar: e2e de destaque ≤ 300 ms do `t0`; retoma na mesma frase; 1º áudio p95 ≤ 1,5 s em staging; **[R]** Safari real de 6 GB.
- [x] 3.4 Flags `audiolivros`, `audiolivros_nuvem`, `audiolivros_elenco` (PG 0017, SQLite 0059). Feito: `tests/audiolivros-flags.test.ts`, `docs/flags.md`.
- [ ] 3.5 **[D]** Amostra de 5% ouvida e aprovada. Verificar: aprovação registrada (data e ids dos capítulos ouvidos).
- [ ] 3.6 Título do capítulo falado duas vezes ("I. I."): decidir se entra no áudio ou se o pré-processador o pula. Verificar: teste do pré-processador com título igual ao primeiro parágrafo.

## 4. F3 Elenco

- [ ] 4.1 `scripts/livros/gerar-elenco.mjs` offline (`claude -p` ou `agy -p`, nunca créditos de API). Não existe ainda.
      Verificar: arquivos de elenco válidos em `validarMarcacaoDaIa`; nenhuma chamada paga no log.
- [ ] 4.2 Gold set (≥ 200 falas pt; 100 es e en). Verificar: ≥ 90% de acerto nas explícitas e ≥ 75% nas implícitas; abaixo disso o livro fica só com narrador.
- [ ] 4.3 Faixas de timbre no lote e uso da flag `audiolivros_elenco`. Verificar: ouvintes distinguem ≥ 80% dos personagens (portão da spec 6.4, item 4).

## 5. F4 Livro do usuário e nuvem do plano pago

- [ ] 5.1 Consentimento por livro e uso da flag `audiolivros_nuvem`. Verificar: e2e com rede vazia: nenhum texto sai sem consentimento.
- [ ] 5.2 Queda para voz do aparelho em 402, 429 e 503 e desconto de `vozCaracteresMes` e `vozCaracteresDia`.
      Verificar: testes de rota e de cota; teto ≤ US$ 0,60 por mês no plano com `vozNatural` (hoje o Plus, 150 mil caracteres por mês), declarado antes de ligar.
- [ ] 5.3 Perfil de menor sem a opção. Verificar: teste de perfil protegido (a opção não renderiza, sem requisição ao servidor).

## 6. F5 Beta fechado e F6 abertura gradual

- [ ] 6.1 **[D]** Beta com 10 a 30 convidados (`ids`, `percentual: 0`), métricas e feedback na tela.
      Verificar: 2 semanas; nota ≥ 3,8/5; erro ≤ 1%; abandono em 60 s ≤ 35%.
- [ ] 6.2 **[D]** Gates G1 a G8 fechados e textos de produto revisados com a skill `copy-br-etica`. Verificar: checklist do runbook assinado pelo dono.
- [ ] 6.3 **[D]** Abertura gradual 5%, 25%, 50%, 100% (menores só do degrau 3 e depois do parecer do ECA Digital). Verificar: cada degrau com ≥ 3 dias sem estourar limites e reversão ensaiada (flag off).
- [ ] 6.4 Arquivar a change e atualizar a spec de 26/10 (NAR05). Verificar: `openspec archive audiolivros` sem erro.
