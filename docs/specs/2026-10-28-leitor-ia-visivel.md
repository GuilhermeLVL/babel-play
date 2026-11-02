# Leitor: as ferramentas de IA à vista (2026-10-28)

## Problema

O dono não consegue ver nem testar o que o leitor tem de tradução e de IA:

- O **parceiro de leitura** (6 modos, `POST /api/ai/leitura/parceiro`) existe no servidor e tem cliente
  (`src/data/rotas/parceiroDeLeitura.ts`), mas **nenhuma tela o usa**.
- **Explicar** existe na barra de seleção, mas só aparece com a flag `ia_de_estudo` ligada (desligada em produção) e
  **some em silêncio** quando não está: quem abre o leitor não sabe que a ferramenta existe nem por que falta.
- Tudo aparece só **depois de selecionar texto**; não há lugar que liste o que o leitor sabe fazer.
- Não existe traduzir o **capítulo** (só o trecho e a palavra).
- No `npm run dev:local` as flags nascem desligadas (sementes das migrações), então o dono não consegue ligar nada
  sem a CLI de operação.

## Decisões

1. **Nenhuma IA nova no servidor.** Só telas e um cliente de tradução que usa o `gateway.mt` (o mesmo tradutor do leitor: no aparelho, com a cascata de sempre).
   O parceiro e o explicar continuam exatamente como o servidor os decide (flag, plano, cota, retenção zero, menores).
2. **Privacidade igual à atual.** Nada novo é gravado no servidor. O trecho só sai do aparelho quando a pessoa aperta
   um botão de IA de nuvem; livro trazido continua limitado à seleção e 2 vizinhos (`montarTrechos`). Tradução de
   capítulo usa o `gateway.mt` do leitor: no aparelho; só se ele não estiver pronto e a pessoa autorizou a IA de nuvem, os parágrafos vão à nuvem (retenção zero), como já acontece com "Traduzir" no trecho. A tela diz isso.
3. **Menores seguem as travas existentes.** A tela não decide idade: pergunta ao servidor e mostra a recusa. Perfil
   protegido nunca vê botão de planos; o motivo `idade` explica sem oferta.
4. **Ferramentas sempre visíveis, com motivo.** Um botão "IA" no cabeçalho abre a lista; cada ferramenta diz se está
   disponível ou por quê não ("Em breve", "Faz parte dos planos pagos", "Entre na sua conta", "Você usou as de hoje;
   volta amanhã", "Precisa de internet", "Liberado quando um responsável autorizar"). Na barra de seleção,
   Explicar e Perguntar ficam visíveis e desabilitados (`aria-disabled` + texto lido por leitor de tela).
5. **Lógica pura primeiro.** `estadoDaFerramenta` (`src/core/leitura/ferramentasDeIa.ts`) recebe fatos (flag, plano,
   conta, idade, cota) e devolve disponível ou o motivo. Os textos ficam na UI, com `t()`.
6. **Copy ética** (`copy-br-etica`): tom de ajuda, sem preço, sem contagem regressiva, sem culpa; o plano só é citado
   como fato, e o link "Conhecer os planos" não aparece no perfil protegido.
7. **Testar local.** `npm run dev:local` liga `ia_de_estudo` e `parceiro_de_leitura` por `FLAGS_LIGADAS_NO_DEV`,
   mecanismo só-dev: ignorado com `NODE_ENV=production`, com `AUTH_REQUIRED=1` e no Worker. O plano `selfhost` já
   tem `parceiroDia: null` (sem teto), então não muda nada em `planos.ts`.

## O que fica de fora

- Resumir o capítulo (continua sendo só o resumo de sessão de captura).
- Tradução de capítulo por IA de nuvem; qualidade de tradução além do que o `gateway.mt` já dá.
- Gravar respostas do parceiro no servidor ou no histórico; cache local das respostas.
- Mudar cotas, planos, flags de produção, classificação etária ou o catálogo.
- Aplicar a migração do parceiro (PG 0014) no staging: documentado em `docs/leitor-ia-como-testar.md`, feito no deploy.

## Critérios de aceite

- Em qualquer livro aberto há um botão "IA" que lista as 4 ferramentas com estado e motivo, por teclado e leitor de tela.
- A barra de seleção mostra Explicar e Perguntar mesmo indisponíveis, com a razão.
- O painel do parceiro cobre os 6 modos, a pergunta livre, carregando, erro, 402/429 e "tentar de novo".
- "Traduzir este capítulo" mostra progresso, é cancelável, não trava a página e não altera o livro.
- Em produção/staging nenhuma flag muda por causa do mecanismo de dev (teste).
