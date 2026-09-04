# Handoff — próxima sessão (contexto zerado)

Escrito em 2026-08-31, no fim de uma sessão longa. **Cole o bloco "PROMPT" abaixo** numa conversa
nova aberta DENTRO deste repositório (`babel-play-lab`) e o trabalho continua de onde parou.

---

## PROMPT (copie daqui até o fim do bloco)

> Você está no **babel-play-lab** — a cópia de PRODUÇÃO do Babel Play (app de aprender idioma por
> imersão: captura áudio, transcreve, traduz e vira material de estudo). Existe uma segunda cópia
> chamada `TradutorWeb` que é a de ENGENHARIA, com histórico git independente: trabalho feito na
> errada não migra. Confirme que está em `babel-play-lab` antes de mexer em qualquer coisa.
>
> **Primeira coisa a fazer:** rode `openspec list` e leia
> `openspec/changes/auditoria-ux-e-economia-de-recompensas/` (proposal, design, tasks). Essa é a
> mudança que abre esta sessão, e ela vem ANTES de todo o resto da fila. Leia também
> `docs/PROXIMOS-PASSOS.md` (estado geral) e `docs/HANDOFF-PROXIMA-SESSAO.md` (este arquivo).
>
> **O trabalho desta sessão, em ordem:**
>
> 1. **Auditoria crítica na perspectiva de um usuário leigo** — tela a tela, no navegador. O dono
>    relata incoerências de ícone e nome entre telas, redirecionamentos que não levam a lugar
>    nenhum, e o problema central: **funções antigas dão liberdade demais e furam a lógica de
>    gamificação nova**. Classifique cada capacidade de edição como DIREITO (acessibilidade,
>    dados do usuário — nunca tranca) ou RECOMPENSA (estética — nunca de graça). Registre em
>    `docs/auditoria/ux-v2.md`.
> 2. **Redesenhar a curva de recompensa do passe** — hoje há 42 slots de Seeds diluídos e o
>    usuário sente que "não ganhou nada". Agrupar moeda em blocos densos, garantir que todo nível
>    entrega algo NOMEÁVEL, aceitar retrabalhar `src/lib/galeria/passe.ts` (ele foi escrito para
>    ser recomposto; os testes prendem invariantes, não a distribuição).
> 3. **Tela de perfis salvos** (salvar combinações do que o usuário possui e recuperar depois) —
>    a base existe em `src/lib/galeria/perfis.ts`, não reinvente.
> 4. **Botão "voltar ao visual original"** em Personalizar (reset para os defaults de
>    `src/lib/appearance.ts`).
> 5. Só depois, o resto da fila em `docs/PROXIMOS-PASSOS.md`.
>
> **Como esta casa trabalha (regras que já custaram caro):**
> - **OpenSpec antes do código.** Toda mudança nasce em `openspec/changes/<nome>/` com
>   proposal.md (citando `arquivo.ts:linha`), design.md, tasks.md e specs/*/spec.md no formato
>   `### Requirement:` + `#### Scenario:` com **WHEN/THEN**. `openspec list` mostra o estado.
> - **Nada de controle falso.** Botão sem ação, número inventado e "em breve" já foram removidos
>   três vezes nesta base — se a função não existe, o texto diz isso.
> - **Estado vazio honesto**: quando não há dado, a tela explica por quê (`Honestidade.tsx`).
> - **Verifique no navegador** cada mudança de UI antes de commitar, e rode a suíte completa.
> - **Comentários explicam o PORQUÊ** (a decisão, a armadilha evitada), nunca o que a linha faz.
> - Commits em português, mensagem explicando a decisão; termine com
>   `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
>
> **Ferramentas disponíveis e quando usar:**
> - **`/graphify`** (skill): mapa da aplicação em grafo. `graphify query "<pergunta>"` responde
>   sobre arquitetura a partir do grafo já construído em `graphify-out/` (não reconstrua à toa);
>   `--update --directed` reconstrói incremental. Relatório anterior: `docs/auditoria/grafo-v2.md`.
> - **`impeccable`** (skill de frontend): `node .claude/skills/impeccable/scripts/detect.mjs
>   --json <arquivos>` roda o detector de padrões ruins de design. Os sub-comandos `critique`,
>   `audit` e `polish` são o caminho para auditoria de UI — use na etapa 1.
> - **Chrome DevTools MCP**: `new_page`, `take_snapshot` (árvore de acessibilidade),
>   `evaluate_script`, `take_screenshot`. É assim que se verifica UI aqui.
> - **Subagentes** (`Agent` com `Explore`): para varrer o código em paralelo antes de planejar.
> - **Docker** está de pé: Semgrep e Trivy rodam por container (ver
>   `docs/auditoria/seguranca-v1.md` para os comandos que funcionaram no Windows).
> - **Artifacts**: protótipos de tela para aprovação antes de implementar — foi assim que a tela
>   Personalizar v4 foi aprovada.
> - Servidor local: `npm run dev:local` (porta 3100, sem login). Suíte: `npx vitest run`.
>   Gates: `npm run typecheck`, `npm run lint`, `npm run audit:gate`,
>   `./node_modules/.bin/ast-grep scan -c sgconfig.yml src server server.ts`.
> - **rtk** intercepta comandos de shell e às vezes filtra a saída — se um resultado parecer
>   estranho, confirme com `rtk proxy <comando>` ou `git diff`.
>
> **Armadilhas já pagas (não repetir):**
> - Antes de construir, PROCURE: já aconteceu de eu anotar "não existe X" e X existir pronto.
> - Heredoc de Python via bash quebra com aspas/acentos: escreva o script num arquivo e execute.
> - Medição com harness infiel mente: separe falha de infraestrutura (429/402) de erro de modelo.
>
> Comece confirmando o repositório, rodando `openspec list` e me dizendo o plano da auditoria.

---

## Estado do produto neste ponto

- **2.097 testes verdes**, typecheck/lint/ast-grep/audit-gate limpos, Semgrep sem achado real.
- Branch `eval/medicao-de-fala`, ~70 commits à frente do remoto.
- **Pronto**: cobrança Asaas em código (falta a conta sandbox), 3 planos com matriz única,
  economia v2 (conquistas voltaram a desbloquear na conta logada), observabilidade fechada,
  LGPD com interface, páginas legais, deploy e uptime desarmados esperando secrets,
  Personalizar v4 (Passe com trilha dupla, Biblioteca, Loja, Desafios), métricas de idioma com
  tempo ativo × passivo e palavras difíceis.
- **Pendências**: ver `docs/PROXIMOS-PASSOS.md` e as tasks abertas em `openspec list`.

## Dependências do dono (travam trabalho)

Conta Asaas + chave sandbox · conta DeepInfra (~US$ 5) · `HEALTH_URL` e secrets do Cloudflare no
GitHub · revisão humana de `public/privacidade.html` e `public/termos.html` · rotação das chaves
Groq e OpenRouter.
