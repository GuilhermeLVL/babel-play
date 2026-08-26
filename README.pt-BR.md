<div align="center">

# Babel Play

**Aprenda um idioma com o que você já assiste, joga e conversa.**
Transcrição e tradução ao vivo de qualquer áudio do computador — rodando **dentro do navegador** — transformadas em jogos de vocabulário e revisão espaçada.

[🇺🇸 English](README.md) · [🇧🇷 Português](README.pt-BR.md) · [🇨🇳 中文](README.zh-CN.md) · [🇫🇷 Français](README.fr.md) · [🇪🇸 Español](README.es.md)

[![CI](https://github.com/GuilhermeLVL/babel-play/actions/workflows/ci.yml/badge.svg)](https://github.com/GuilhermeLVL/babel-play/actions/workflows/ci.yml)
[![Segurança](https://github.com/GuilhermeLVL/babel-play/actions/workflows/seguranca.yml/badge.svg)](https://github.com/GuilhermeLVL/babel-play/actions/workflows/seguranca.yml)
[![Licença: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A5%2022-339933?logo=node.js&logoColor=white)](package.json)

<img src="docs/img/capturar.png" alt="Tela de captura: legendas bilíngues produzidas no navegador" width="900">

</div>

> **Demo:** chega com o deploy público. Até lá, rode localmente em três comandos — sem chave de API.

## Experimente

```bash
npm install          # também copia os binários do ONNX Runtime / Silero VAD para public/
cp .env.example .env # defina PORT; nenhuma chave de API é necessária para o pipeline local
npm run dev          # → http://localhost:<PORT>   (abra via localhost: contexto seguro para os modelos)
```

Escolha **Continuar sem conta**: o pipeline inteiro roda localmente e **nenhuma requisição**
chega ao servidor — isso é medido, não prometido (veja [Medido, não prometido](#medido-não-prometido)).

## O que faz

| | |
|---|---|
| <img src="docs/img/hub.png" alt="Início" width="420"> | **Início** — as três frentes do app (capturar, praticar, vocabulário) com o estado real de cada uma: o que vence hoje, o que é novo, o que nunca foi jogado. Nível, ofensiva e seeds vêm de eventos medidos, nunca digitados. |
| <img src="docs/img/capturar.png" alt="Capturar" width="420"> | **Capturar** — uma aba do navegador, o som do sistema (loopback no Windows, sem configurar) ou o microfone. O Whisper transcreve no navegador (WebGPU, fallback WASM); Opus-MT, a Translator API do Chrome ou um LLM de nuvem traduzem, sempre com cadeia de fallback. Legendas flutuantes por cima do vídeo ou do jogo. |
| <img src="docs/img/jogar.png" alt="Jogar" width="420"> | **Jogar** — nove jogos curtos feitos com o *seu* vocabulário (memória, caça-palavras, soletrar, duelo relâmpago…), com trilha CEFR a partir de listas reais. O que você acerta aqui conta na revisão. |
| <img src="docs/img/sem-conta.png" alt="Modo sem conta" width="420"> | **Sem conta** — o pipeline local inteiro funciona sem cadastro; as telas que persistem dados mostram um convite em vez de um muro, e o que você fez no navegador sobe para a conta, uma vez, quando você entra. |

**Conta é opcional.** Sem ela, os dados ficam no IndexedDB; ao criar conta, sobem uma vez, de forma idempotente. Com ela, o plano é decidido pelo servidor (free: tudo local/BYOK; pro: IA de nuvem gerenciada).

## Como funciona

```mermaid
flowchart LR
    classDef src fill:#1f1f23,stroke:#e85d36,color:#f4efe6
    classDef local fill:#17171a,stroke:#7a70ff,color:#f4efe6
    classDef cloud fill:#17171a,stroke:#8f887c,color:#c9c2b6,stroke-dasharray:5
    classDef out fill:#1f1f23,stroke:#9ad29a,color:#f4efe6

    subgraph IN["🎧 Áudio de entrada"]
        A1[Aba do navegador]:::src
        A2[Som do sistema<br/><small>loopback no Windows</small>]:::src
        A3[Microfone]:::src
    end

    subgraph BROWSER["🧠 No navegador — nada sai do dispositivo"]
        VAD["Silero VAD<br/><small>AudioWorklet</small>"]:::local
        STT["Whisper<br/><small>transformers.js · WebGPU | WASM</small>"]:::local
        MT1["Opus-MT<br/><small>ONNX, local</small>"]:::local
        MT2["Translator API do Chrome"]:::local
        STORE[("IndexedDB<br/><small>modo sem conta</small>")]:::local
    end

    subgraph CLOUD["☁️ Opcional, por plano"]
        MT3["LLM / STT de nuvem<br/><small>só com conta</small>"]:::cloud
    end

    subgraph OUT["📚 Aprendizado"]
        CAP[Legendas ao vivo]:::out
        VOC[Vocabulário]:::out
        GAMES[9 jogos]:::out
        SRS["Revisão FSRS-5<br/><small>trilha CEFR</small>"]:::out
    end

    A1 & A2 & A3 --> VAD --> STT
    STT --> MT1 -. fallback .-> MT2 -. fallback .-> MT3
    STT --> CAP
    MT1 & MT2 & MT3 --> CAP
    CAP --> VOC --> GAMES --> SRS
    VOC --> STORE
```

### Três eixos independentes

```mermaid
flowchart TB
    classDef c fill:#17171a,stroke:#8f887c,color:#f4efe6
    classDef s fill:#1f1f23,stroke:#e85d36,color:#f4efe6

    UI["UI · React"]:::c --> F["<b>apiFetch</b> — o funil HTTP único<br/><small>src/data/api.ts</small>"]:::s
    F -->|"identidade = anônimo"| E["Servidor em memória sobre IndexedDB<br/><small>src/data/efemero · mesmas formas de resposta</small>"]:::c
    F -->|"identidade = conta | self-host"| API["API Express<br/><small>JWT Supabase · isolamento por usuário · rate limit · Zod</small>"]:::c
    API --> DB[("libsql / SQLite<br/><small>pronto para Turso</small>")]:::c
    API --> PLAN["Plano e papel decididos <b>só</b> aqui<br/><small>free · pro · self-host — user · admin · support</small>"]:::s
```

- **Um funil HTTP.** Toda chamada passa por `apiFetch`. Sem conta, quem responde é um servidor em memória com as mesmas formas do servidor real — a UI não sabe a diferença. Uma regra ast-grep proíbe `fetch('/api/…')` em qualquer outro lugar.
- **Identidade · plano · papel** são eixos separados; o cliente só *pinta* o plano, nunca decide.
- Criar conta migra os dados locais uma vez, de forma idempotente (`origem_local_id` único por usuário).

Detalhes em [docs/arquitetura.md](docs/arquitetura.md).

## Compatibilidade

| | |
|---|---|
| WebGPU | Chrome/Edge 113+, Safari 18+; Firefox cai para WASM (mais lento, funciona) |
| Primeira carga | ~40–80 MB de pesos do Hugging Face Hub, em cache no navegador |
| Som do sistema | loopback do Windows via servidor local (self-host), ou compartilhar aba/tela em qualquer lugar |
| Threads WASM | exigem cross-origin isolation (`CROSS_ORIGIN_ISOLATION=1`); senão, thread única |

## Medido, não prometido

Tudo abaixo vem de scripts do repositório; números de uma execução de 2026-08.

- **Modo sem conta: 0 requisições a `/api`** no fluxo completo (sonda com `fetch` contador).
- **Contraste**: 0 nós abaixo do WCAG AA em 14 combinações de tema/esquema/perfil; 0 alvos abaixo de 24 px.
- **Capacidade** (um processo, cpuset de 4 CPUs, carga de escrita): ~300 req/s; mais workers de cluster *reduzem* a vazão porque o SQLite tem um escritor só — escalar é trocar o banco, não somar processos.
- **Auth**: 7 vetores de token forjado (alg:none, confusão de algoritmo, iss/aud errados, expiração…) recusados pelo verificador real, e um controle positivo aceito.
- 1.800+ testes automatizados; typecheck, lint, build e auditoria de dependências com allowlist nomeada a cada push.

## O que ainda não funciona

- Opus-MT int8/fp16 falha em alguns dispositivos (ONNX Runtime `qdq_actions`); cai para o próximo tradutor, que pode não existir sem conta.
- Áudio de compartilhamento de tela no Windows pode dar `NotReadableError`; use aba ou loopback.
- Rodadas jogadas sem conta não migram para a conta (sessões, áudio e cartões migram).
- Banco de escritor único: serve para beta, não para escala.
- Sem cobrança ainda — o plano é definido pelo admin.

## Verificar

```bash
npm run typecheck && npm run typecheck:core && npm run lint && npm test && npm run build
```

## Docs

[Arquitetura](docs/arquitetura.md) · [Deploy](docs/deploy.md) · [Roteiro de regressão](docs/testes-regressao.md) · [Metodologia de auditoria](docs/metodologia-de-auditoria.md) · [Plano de lançamento](docs/lancamento-2026-09.md)

## Contribuir · Segurança · Licença

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [MIT](LICENSE)
