# Modelos no aparelho: qualidade no Grátis, leve em qualquer PC, e uma tela para escolher

Status: implementado (staging) · Data: 2026-10-23 · Autor: Guilherme (com Claude)

## Problema

- O Grátis transcreve no aparelho com o Whisper base (18,8% de erro em português, 16,0% em espanhol,
  bancada de 09/10/2026) quando não há GPU, e no Safari. Com GPU, o small (10,8% / 9,3%) custa 589 MB e
  2,9 GB de RAM. Já existe no código um modelo três vezes melhor que o base — o **Parakeet v3** (5,8% /
  4,5%) — mas ele está atrás de uma chave escondida (`babel.stt.parakeet`) porque faltavam duas provas:
  aparelho fraco e memória.
- O dono relatou o PC quente. Os cortes de 22/10 baixaram a captura falando de ~259% para ~175% de CPU
  (Chromium sem GPU), mas o silêncio ainda custa ~19% e os textos provisórios redecodificam a fala inteira.
- Quem usa não vê nem decide nada sobre os modelos: o único painel (`ModeloNoDispositivo.tsx`, aberto pelo
  selo da Captura) mostra só os modelos da configuração atual e deixa liberar espaço. Não dá para ver tudo
  o que está guardado, baixar antes (no Wi-Fi), trocar de modelo nem testar a velocidade.

## Objetivos

- Grátis com o melhor modelo que o aparelho aguenta, escolhido sozinho: alvo de erro ≤ 7% em português e
  espanhol no computador que passa na prova (hoje 18,8% sem GPU).
- Silêncio na captura abaixo de 8% de CPU no Chromium sem GPU (medido como em
  `docs/auditoria/2026-10-22-carga-local.md`).
- Uma tela "Modelos no aparelho" em Ajustes: automático por padrão; avançado para ver, baixar, apagar,
  trocar e testar.
- Nenhum custo novo de nuvem no Grátis além da franquia de alívio que já existe (`FRANQUIA_DE_ALIVIO`,
  teto US$ 0,13/usuário/mês).

## Fora do escopo

- Modelos de linguagem no navegador para tradução (≥ 1,2 GB, exigem WebGPU e esquentam): ficam para um
  "experimental" futuro em PC forte.
- Trocar o Whisper fp16 na GPU (bug do transformers.js #1590, reaberto em 30/03/2026): só volta quando a
  biblioteca corrigir e a bancada repetir.
- Novos idiomas de tradução, nuvem nova, Moonshine v2 (empate em inglês, 2× mais lento).

## O que foi medido (23/10/2026, Mac M5 Pro, Chrome 155 e WebKit 27.2)

Fonte: `docs/auditoria/2026-10-23-bancada-mac.md` (mesma bancada e mesmas falas FLEURS de
`2026-10-09-medicoes-no-aparelho.md`). Pesquisa de apoio: `docs/auditoria/pesquisa-2026-10-23/`.

|                                                         | Parakeet v3 int8 (WASM) | Whisper base q8 (WASM, o de hoje) |
| ------------------------------------------------------- | ----------------------- | --------------------------------- |
| Erro, português (100 falas)                             | **5,8%** [4,6–7,1]      | 18,8% [16,4–21,1]                 |
| Erro, espanhol (50 falas)                               | **4,3%** [3,0–5,8]      | 15,3% [12,5–18,2]                 |
| Tempo de processar ÷ duração da fala, 1 / 2 / 4 threads | 0,30 / 0,16 / 0,10      | 0,18 / 0,11 / 0,07                |
| PC fraco simulado (2 threads, CPU 4× mais lenta)        | 0,63 (acompanha a fala) | 0,38                              |
| Safari (WebKit, 1 thread, sem isolamento, 30 falas pt)  | roda; 0,30; 4,6%        | roda; 0,18; 17,9%                 |
| Memória de pico (RSS somado, superestima)               | ~3,9 GB                 | ~2,0 GB                           |
| Download                                                | 672 MB                  | 80 MB                             |
| Texto provisório enquanto fala                          | não (só a frase final)  | sim (redecodifica a fala)         |

Também medido: o reconhecimento de voz do próprio Chrome **rodando no computador**
(`SpeechRecognition.available({processLocally:true})`) responde "downloadable" para pt-BR, es-ES e en-US
no Chrome 155. A qualidade dele ainda não foi medida.

Leitura: a diferença de erro é grande e significativa nos dois idiomas, o Parakeet acompanha a fala
até no PC fraco simulado e roda no motor do Safari. O custo real é a MEMÓRIA (quase o dobro) e o
download. A simulação não reproduz notebook de verdade (cache, banda de memória, calor).

## Opções consideradas

| Opção                                                                      | Prós                                                                                   | Contras                                                                            | Custo                      | Risco                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------- | ----------------------------- |
| A. Não fazer (Whisper base/small como hoje)                                | nada muda                                                                              | 3× mais erro em pt/es no Grátis sem GPU e no Safari; nenhuma escolha para quem usa | zero                       | baixo                         |
| B. Ligar o Parakeet no "automático" de pt/es onde couber + tela de modelos | melhor qualidade medida, sem GPU, sem nuvem; sem texto provisório ⇒ menos CPU contínua | 672 MB uma vez; ~2× memória; legenda só no fim da frase                            | zero de nuvem              | médio (memória em PC de 8 GB) |
| C. Nuvem (Workers AI, ~US$ 0,0005/min) para todo o Grátis                  | qualidade do large-v3-turbo sem pesar o PC                                             | custo cresce com o uso; áudio sai do aparelho (menores)                            | ~US$ 0,10–0,15/usuário/mês | alto (custo, privacidade)     |
| D. Reconhecimento local do Chrome como padrão                              | zero download nosso, leve                                                              | só Chrome desktop, qualidade não medida, modelo fora do nosso controle             | zero                       | médio                         |

## Recomendação

**B, com a D como camada leve depois de medida, e a nuvem só como a franquia de alívio que já existe.**
O Parakeet entrega o que o dono pediu para o Grátis (qualidade alta sem pagar e sem GPU) e já está
implementado e testado atrás de uma chave; o que falta é decidir onde ele liga, proteger a memória e
dar à pessoa a tela para escolher. Mudaria a recomendação: um notebook real de 8 GB travar ou trocar
memória com o Parakeet carregado junto do tradutor (aí ele fica só no "preciso", por escolha).

## Design

### 1. Escolha automática por aparelho (o "Automático (recomendado)")

| Aparelho                                                                   | Transcrição pt/es                                                           | Transcrição en e outros                         | Tradução                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Computador ≥ 8 GB (Chromium mede; Mac Apple pelo adaptador WebGPU `apple`) | **Parakeet** (baixa uma vez, com confirmação; enquanto baixa, Whisper base) | Moonshine (en) / Whisper base ou small (outros) | nativo do Chrome/Edge se houver; senão Bergamot; opus-mt onde falta par |
| Computador < 8 GB ou sem medida (Firefox)                                  | Whisper base q8                                                             | idem                                            | Bergamot                                                                |
| Lento demais (regulador vê o processamento ≥ 1× a fala)                    | oferece a franquia de alívio na nuvem                                       | idem                                            | idem                                                                    |
| Celular / Quest                                                            | como hoje (tiny/base, só frase final)                                       | como hoje                                       | Bergamot / nuvem com teto                                               |

- `parakeetCabeNoAparelho` (`src/gateway/sttRouter.ts`) ganha a regra do Mac Apple (todos têm ≥ 8 GB)
  e o Parakeet passa de "preciso" a padrão do "automático" em pt/es. A chave `babel.stt.parakeet`
  vira a escolha da tela.
- Memória: com o Parakeet carregado, o tradutor carrega depois (a regra de um-de-cada-vez de
  `memoriaDosModelos.ts` já existe; vale para ≤ 8 GB).

### 2. Menos calor

- **Portão de energia antes do VAD**: em silêncio claro (nível abaixo do piso medido), o Silero não roda
  a cada 96 ms. Alvo: silêncio de ~19% para < 8% de CPU (Chromium sem GPU).
- Com Parakeet não há parciais; com Whisper, o parcial só sai com fala detectada e o intervalo cresce
  quando o processamento passa de 0,5× a fala (o regulador já mede isso).
- Pressão da CPU (`PressureObserver`, já ligado no regulador): em "serious" corta parciais e threads;
  em "critical" pausa o local e oferece a nuvem de alívio.
- Download: uma aba por vez (Web Locks), `storage.persist()` já pedido.

### 3. Tela "Modelos no aparelho" (Ajustes)

- Topo: **Automático (recomendado)**, ligado. Uma frase diz o que foi escolhido e por quê
  ("Seu computador aguenta o modelo preciso de português").
- **Espaço usado** (barra com `storage.estimate`) e "Apagar todos os modelos".
- Duas listas, **Transcrição** e **Tradução**. Cada modelo é um cartão com nome simples ("Preciso",
  "Equilibrado", "Rápido"), idiomas, tamanho, selos de qualidade e de peso no computador (dos números
  da bancada, nunca só por cor), situação (baixado / não baixado / atualização) e ações:
  **Baixar**, **Usar este**, **Apagar**. Modelo que não cabe aparece desabilitado com o motivo
  ("precisa de 8 GB de memória").
- **Avançado** (recolhido): desligar o automático e fixar um modelo por tarefa; "Testar velocidade"
  (o benchmark que já existe, ≤ 3 s); "Perguntar antes de baixar acima de 100 MB".
- Reusa `modelManifest.ts` (`modeloDisponivel`, `apagarModelo`, `situacaoDaVersao`) e o painel da
  Captura (`ModeloNoDispositivo.tsx`) passa a ter um link "Ver todos os modelos".
- Linguagem para menores, alvos de 44 px, `role="progressbar"` no download, sem dados saindo do aparelho.
- Licença: o Parakeet é CC-BY-4.0 ⇒ crédito à NVIDIA na tela e em "Sobre".

## Critérios de aceite

- [ ] Dado um computador Chromium com 8 GB e pt-BR, quando a pessoa abre a Captura no automático,
      então a rota é o Parakeet (teste do roteador) e, antes do primeiro download, aparece a confirmação
      de 672 MB; enquanto baixa, a legenda sai pelo Whisper base.
- [ ] Dado Safari num Mac (adaptador `apple`), a mesma rota vale; dado Firefox sem medida, fica no Whisper base.
- [ ] Com o Parakeet e o tradutor carregados num perfil de 8 GB, nenhuma falha de memória numa captura de 10 min (e2e com áudio falso).
- [ ] Silêncio de 60 s na captura: CPU < 8% no Chromium sem GPU (script de `2026-10-22-carga-local.md`).
- [ ] A tela lista todos os modelos guardados com tamanho, apaga um e o espaço usado diminui; "Usar este" fixa o modelo e a Captura respeita; axe sem violação grave.
- [ ] Bancada: reconhecimento local do Chrome medido em pt/es/en (100 falas) antes de virar camada.

## Riscos e mitigação

- **Memória em PC de 8 GB**: tradutor depois do STT; regulador troca para o Whisper base se a página
  receber pressão/`device-lost`; a pessoa pode fixar o "Equilibrado" na tela.
- **Legenda só no fim da frase** com o Parakeet: a frase sai em ~0,1–0,3× a duração; se o dono preferir
  texto provisório, o Parakeet fica como "Preciso" e o automático segue no Whisper.
- **672 MB no primeiro uso**: confirmação, só quando a pessoa começa a capturar em pt/es, e nunca com
  economia de dados.
- **Simulação ≠ notebook real**: pedir ao dono um teste num notebook comum antes de ligar para todos
  (liga primeiro no staging).

## Plano de entrega

1. **Medir o que falta (½ dia)**: reconhecimento local do Chrome em pt/es/en; Parakeet × Moonshine em inglês (100 falas). Commit dos ajustes da bancada.
2. **Parakeet no automático (1–2 dias)**: regra do roteador + Mac Apple + confirmação de download + tradutor depois; testes do roteador e e2e.
3. **Menos calor (1 dia)**: portão de energia antes do VAD; medir antes/depois.
4. **Tela "Modelos no aparelho" (2–3 dias)**: Ajustes + link no painel da Captura; testes de unidade, e2e e axe.
5. **Camada leve do Chrome (1 dia, se a medição do passo 1 for boa)**.
   Cada passo vai para o staging e é verificado antes do próximo.

## Decisões do dono (23/10/2026)

1. O Parakeet é o **padrão do automático** em pt/es onde couber; o Whisper fica como reserva e como a
   opção "com texto provisório" na tela.
2. Liga **também no Safari do Mac** (adaptador WebGPU `apple`); o dono confirma no Safari do sistema pelo staging.
3. Não há notebook comum para testar: liga com a trava de memória (≥ 8 GB), o tradutor carregando
   depois e o regulador como proteção (troca para o Whisper base em pressão/lentidão), e acompanhamos
   pelos erros reportados.

## Decisões de implementação (plano `docs/superpowers/plans/2026-10-23-modelos-no-aparelho.md`)

- "Enquanto baixa, Whisper base" virou: no automático o Parakeet só entra com a cópia completa no
  aparelho; até lá a captura sai pelo Whisper e oferece "Baixar o modelo preciso (672 MB) para as
  próximas capturas", em segundo plano. Ninguém espera 672 MB para começar. Escolher o "Preciso" na
  mão baixa na hora, com a confirmação da folha de início.
- "Perguntar antes de baixar acima de 100 MB" virou regra fixa: no computador a folha de início confirma
  downloads acima de 300 MB (no celular continua 100 MB). Sem ajuste na tela.
- Safari do Mac: entra pelo adaptador WebGPU `apple`, com os modelos carregando um de cada vez e uma
  sentinela de queda (aba que morre com o Parakeet carregado volta ao Whisper na abertura seguinte),
  porque o WebKit já chegou a 4,2 GB no processo da página com o Whisper (correção F de 22/10/2026).

## O que foi entregue (23/10/2026, commits 013888a1..60fc1b5f)

- Parakeet no automático de pt/es onde cabe (≥ 8 GB medido ou Mac Apple), só com a cópia completa;
  modelo fixado pela pessoa (`src/gateway/modeloFixo.ts`).
- Memória: com o Parakeet, um modelo de cada vez; sentinela de queda por instância de página, com
  batimento a cada 5 min e veto visível (evento `modelo-vetado` + "Tentar de novo" na tela).
- Download do preciso em segundo plano, oferecido na Captura só sem nuvem, que solta os modelos da
  captura antes e aborta ao gravar; cópia parcial não conta.
- Portão de energia antes do Silero. **Meta de CPU não atingida**: 16% → 15–16% no silêncio (Chromium do
  Mac); o grosso do silêncio é outra coisa — fica como próxima frente (perfilar).
- Tela "Modelos no aparelho" (Ajustes → Processamento) + crédito no Sobre.
- Não feito: camada do reconhecimento local do Chrome (não devolve texto no Chrome 155 + macOS 27 beta,
  `docs/auditoria/2026-10-23-bancada-complementar.md`); e2e de 10 min com 8 GB (memória não se emula).
- Medido e não decidido: Parakeet também ganha em inglês (7,1% × 13,6% do Moonshine) — decisão do dono.
