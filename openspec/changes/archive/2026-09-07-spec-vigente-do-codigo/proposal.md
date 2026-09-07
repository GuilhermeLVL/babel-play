## Why

`openspec/specs/` esta vazio e `openspec/changes/archive/` tambem: nao existe uma spec vigente contra a qual comparar o codigo. Sao 29 changes abertas, 17 delas sem tarefa pendente e nunca arquivadas, uma (`imersao-aquatica-nextgen`) so com dois diretorios vazios, e duas criadas em 2026-09-06 marcadas 100% com codigo nao rastreado. O pedido desta auditoria assumia `montarRodada` server-side; o codigo tem `montarRodada` como closure de componente (`src/components/views/Play.tsx:717-995`). `docs/arquitetura.md` e de 2026-07 e `AUDITORIA-ESTADO.md:44-48` cita migrations que nao existem. Sem spec vigente, toda proxima IA repete o erro de "construir o que ja existe" que `docs/PROXIMOS-PASSOS.md` registra duas vezes. Achados A64 e secao 2.8 de `openspec/audits/2026-09-07-coerencia.md`.

## What Changes

- Criar `openspec/specs/` com uma spec por capacidade central, escrita a partir do comportamento REAL (com `arquivo:linha`), nao do desejado: `ciclo-do-usuario`, `conteudo-e-trilha`, `rodada-e-fsrs`, `economia`, `i18n`, `modo-anonimo`, `planos-e-billing`.
- Sincronizar os deltas das 17 changes concluidas para as specs principais e arquiva-las (`openspec archive`); apagar `imersao-aquatica-nextgen`.
- Changes parcialmente concluidas ganham nota de estado no `tasks.md` (o que falta, citando o achado da auditoria) em vez de ficarem ambiguas.
- `docs/arquitetura.md` passa a apontar para `openspec/specs/` como fonte; `AUDITORIA-ESTADO.md` e removido ou corrigido (migrations inexistentes).
- Regra de casa: change concluida e arquivada no mesmo PR que fecha a ultima tarefa (documentada em `CONTRIBUTING.md`).

## Capabilities

### New Capabilities
- `spec-vigente`: existe um conjunto de specs principais que descreve o produto como ele e, e todo delta parte delas.

## Impact

- `openspec/specs/**` (novos), `openspec/changes/archive/**` (17 changes movidas), `openspec/changes/imersao-aquatica-nextgen/` (removido)
- `docs/arquitetura.md`, `AUDITORIA-ESTADO.md`, `CONTRIBUTING.md`
- Nenhum arquivo de codigo.

## Pronto quando

`openspec list` lista apenas changes com tarefa pendente; `openspec validate --all` passa; `openspec/specs/` contem as 7 specs com pelo menos um `### Requirement:` por fluxo do mapa da auditoria; cada requirement cita o `arquivo:linha` que o implementa hoje.

## Dependencias e paralelismo

Depende de `linha-de-base-verde` apenas para descrever o estado pos-decisao da arvore. Paralelizavel com todas (so documentos). Deve ser concluida ANTES das changes de economia e contratos serem arquivadas, para que os deltas delas tenham base.
