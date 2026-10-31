## 0. M0 Especificação (esta change)

- [x] 0.1 Spec técnica `docs/specs/2026-10-31-audiolivros-e-leitura.md`, change OpenSpec e esqueleto do runbook. Aceite: `openspec validate audiolivros` passa (CLI não instalado no ambiente da escrita: rodar antes de arquivar)
- [ ] 0.2 Dono responde as 5 perguntas em aberto (spec, seção 12). Aceite: respostas registradas no topo da spec

## 1. F0 Spike e decisão do motor (2 dias; teto US$ 5 de GPU)

- [ ] 1.1 Abrir consulta jurídica (espeak-ng/WASM e servidor) com a pergunta da spec 6.4. Aceite: pergunta enviada, resposta não bloqueia a F0
- [ ] 1.2 Medir Qwen3-TTS CustomVoice (0,6B e 1,7B), Chatterbox pt-BR (voz padrão), VoxCPM2, Piper `faber` e Web Speech em pt/en/es. Aceite: tabela com RTF, GB, CER/WER nas 14 frases pt, vozes, duração por frase, componente GPL
- [ ] 1.3 Escuta cega do dono. Aceite: CSV preenchido; recomendação por idioma pelo critério da spec 6.4; recibo da GPU ≤ US$ 5

## 2. F1 Bancada e pré-processamento

- [ ] 2.1 `scripts/eval-voz/` (montar-frases, sintetizar, roundtrip, itens difíceis, estabilidade, formulário, juiz de texto, relatório). Aceite: roda ponta a ponta em < 30 min por motor
- [ ] 2.2 Pré-processador pt-BR em `src/core` (números, ordinais, romanos, moeda, siglas, travessão, reticências). Aceite: ≥ 60 casos, 100% verdes; core sem React/rede
- [ ] 2.3 Limiares calibrados em `scripts/eval-voz/limiares.json`. Aceite: valores da spec 7.2 revisados com a F0 e aprovados pelo dono

## 3. F2 Piloto de 10 livros, R2 e player

- [ ] 3.1 Buckets `frasy-audio(-staging)`, domínio e `VITE_AUDIO_URL` na CSP (ato do dono). Aceite: teste de CSP; `curl -I` mostra cache
- [ ] 3.2 `scripts/audiolivros/gerar-livro.mjs` (síntese frase a frase, Opus, `{i,t0,t1}`, manifesto com hash, retentativa ≤ 2). Aceite: 0 frases sem áudio; capítulos passam nos limiares
- [ ] 3.3 Player sincronizado no leitor (botão Ouvir, destaque, retomar, sono, fila, baixar capítulo, chip "Voz sintetizada"). Aceite: e2e destaque ≤ 300 ms do `t0`; retoma na mesma frase; 1º áudio p95 ≤ 1,5 s em staging
- [ ] 3.4 Flag `audiolivros` (migração PG 0016) e `docs/flags.md`. Aceite: desligada, nenhum chunk/rota novo carrega; teste de contagem de flags
- [ ] 3.5 Amostra de 5% ouvida e aprovada pelo dono. Aceite: aprovação registrada

## 4. F3 Elenco

- [ ] 4.1 `scripts/livros/gerar-elenco.mjs` offline (`claude -p`/`agy -p`). Aceite: arquivos válidos em `validarMarcacaoDaIa`
- [ ] 4.2 Gold set (≥ 200 falas pt; 100 es/en). Aceite: ≥ 90% nas explícitas e ≥ 75% nas implícitas; abaixo disso, narrador
- [ ] 4.3 Faixas de timbre no lote e flag `audiolivros_elenco`. Aceite: ouvintes distinguem ≥ 80% dos personagens

## 5. F4 Livro do usuário e nuvem Premium

- [ ] 5.1 Consentimento por livro e flag `audiolivros_nuvem`. Aceite: e2e com rede vazia: nenhum texto sai sem consentimento
- [ ] 5.2 Queda para voz do aparelho em 402/429/503 e desconto de `vozCaracteresMes/Dia`. Aceite: testes de rota e de cota; teto ≤ US$ 0,60/mês no Premium
- [ ] 5.3 Perfil de menor sem a opção. Aceite: teste de perfil protegido

## 6. F5 Beta fechado e F6 GA gradual

- [ ] 6.1 Beta com 10 a 30 convidados (`ids`, `percentual: 0`), métricas e feedback in-app. Aceite: 2 semanas; nota ≥ 3,8/5; erro ≤ 1%; abandono em 60 s ≤ 35%
- [ ] 6.2 Gates G1 a G8 fechados e textos de produto revisados com `copy-br-etica`. Aceite: checklist do runbook assinado pelo dono
- [ ] 6.3 % gradual 5 → 25 → 50 → 100. Aceite: cada degrau ≥ 3 dias sem estourar limites
- [ ] 6.4 Arquivar a change e atualizar a spec de 26/10 (NAR05). Aceite: `openspec archive`
