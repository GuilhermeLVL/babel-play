# Auditoria independente — i18n e trilhas de vocabulário

## Por que

A frente de internacionalização e de trilhas produziu 191 commits e um conjunto de documentos que
afirmam o que ficou pronto. As decisões que dependem desses números são caras e difíceis de
desfazer: quantos idiomas prometer, quanto orçar em tradução, se a arquitetura caseira
(`src/lib/i18n.ts`, chave-texto, sem biblioteca) aguenta dezesseis idiomas de interface.

Esta mudança **não implementa nada**. Ela mede de novo, do zero, sem aceitar auto-relato, e emite
veredito por escrito. Toda alegação vira `CONFIRMADO | PARCIAL | REFUTADO | NÃO VERIFICÁVEL`, com
`arquivo:linha` ou comando reproduzível e saída colada.

## O que está sendo auditado

O balanço "✅ FEITO / ❌ FALTA" produzido em conversa não foi preservado. Por decisão do
solicitante, o **relatório sob auditoria** passa a ser o que o agente anterior escreveu e
commitou:

- `docs/i18n.md`
- `docs/i18n-lacunas.md`
- `docs/i18n-como-testar.md`
- `docs/auditoria/trilha-multi-idioma-v1.md`
- `openspec/changes/trilha-multi-idioma/tasks.md`

As alegações estão extraídas uma a uma em [ALEGACOES.md](./ALEGACOES.md), com linha de origem.

## Onde

Branch `multi-idioma`, worktree `.claude/worktrees/multi-idioma`, HEAD `173fcde`.

O checkout principal está em `feat/ux-economia-monetizacao` e **não contém i18n nenhum** — nem
`src/lib/i18n.ts`, nem `public/i18n/`, nem `?ui=`. Auditar a raiz mediria zero. As duas frentes
divergiram em 662 arquivos.

## Regras desta auditoria

1. **Nada é aceito por auto-relato.** Se não foi rodado, não é afirmado.
2. **Fases 0 a 6 são somente leitura.** Nenhuma correção, nenhum refactor, nenhum commit de
   código do app. Só relatório.
3. **Resultado negativo é resultado.** Onde o documento está certo, o relatório diz que está
   certo e segue. Não se inventa achado.
4. **Parada obrigatória em cada `GATE`**, esperando aceite humano explícito.
5. Correção só depois do aceite da Fase 7, e cada item vira uma proposta OpenSpec separada.

## As oito fases

| fase | entrega | estado |
|---|---|---|
| 0 | baseline reproduzível — alegado × medido × delta | **concluída** |
| 1 | verificação alegação por alegação, com veredito | **concluída** |
| 2 | censo de cobertura por tela, incluindo superfícies esquecidas | **concluída** |
| 3 | estresse por escrita e por idioma, com Playwright e captura de tela | **concluída** |
| 4 | arquitetura contra o padrão da indústria (ICU, TMS, XLIFF, BCP-47) | **NÃO EXECUTADA** |
| 5 | performance e custo, com projeção para 16 idiomas | **NÃO EXECUTADA** |
| 6 | segurança, licenciamento (CC BY-SA do Wikcionário) e conformidade | **NÃO EXECUTADA** |
| 7 | veredito, achados priorizados e sequência recomendada | **NÃO EXECUTADA** |

## O que ficou por fazer

As fases 4 a 7 **não foram executadas**. O trabalho foi interrompido para integrar a branch
`multi-idioma` em `main`. Sem elas, a auditoria **não tem veredito**: as perguntas sobre
escalabilidade, custo de tradução, licenciamento (CC BY-SA do Wikcionário) e recomendação
arquitetural seguem sem resposta medida.

O que existe hoje é o levantamento factual (fases 0 a 3) e 17 achados numerados com evidência.

## Sem `specs/`

Uma auditoria somente leitura não altera capacidade nenhuma, então não há delta spec a escrever.
Se o change precisar do molde completo da casa, é decisão do GATE 0.
