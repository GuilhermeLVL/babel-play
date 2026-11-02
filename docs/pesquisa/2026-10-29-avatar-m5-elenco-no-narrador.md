# Elenco no Narrador: o que foi medido (M5, 2026-10-29)

Contexto: a ligação da heurística de elenco ao Narrador do leitor (`src/core/avatar/elenco/narracao.ts`,
`src/lib/leitor/narrador.ts`), atrás de `avatar_elenco`. Esta nota registra a medição do PLANO FINAL que o Narrador usa
(`planejarElenco`: marcador + mapa de vozes + corte por confiança), não da heurística isolada (essa está em
`2026-10-28-avatar-elenco-juiz.md`).

## Método

- Conjunto de ouro `tests/fixtures/elenco/ouro.json` (36 passagens, 12 por idioma), o MESMO da rodada do juiz.
- Para cada passagem: elenco = personagens da passagem, 5 vozes de mentira (A a E, A = narrador), `planejarElenco`.
- "Voz certa" = a voz atribuída é a da personagem do ouro. "Caiu no narrador" = frase de personagem que ficou sem voz
  própria (confiança < 0,5, desconhecido): o comportamento seguro, a pessoa ouve a voz de sempre.
- NENHUM limiar novo foi criado nem alterado: esta medição é descritiva. Os limiares do juiz (documento anterior)
  seguem como estão e continuam valendo para ligar `avatar_elenco` com IA. Nenhum juiz LLM foi rodado nesta etapa
  (sem créditos de API, sem `claude -p`/`agy -p`); a IA do servidor não foi implementada.
- Script pontual, fora do repositório (um teste vitest temporário que escreve JSON); reproduzível a partir do desenho
  acima.

## Resultado

| idioma | frases de personagem | voz certa  | voz errada | caiu no narrador | narração lida pelo narrador | emoção igual ao ouro |
| ------ | -------------------- | ---------- | ---------- | ---------------- | --------------------------- | -------------------- |
| pt     | 26                   | 20 (76,9%) | 1          | 5                | 28/28                       | 50/54 (92,6%)        |
| en     | 27                   | 22 (81,5%) | 1          | 4                | 27/27                       | 50/54 (92,6%)        |
| es     | 26                   | 20 (76,9%) | 1          | 5                | 28/28                       | 51/54 (94,4%)        |
| total  | 79                   | 62 (78,5%) | 3 (3,8%)   | 14 (17,7%)       | 83/83 (100%)                | 151/162 (93,2%)      |

Leitura honesta: em 3,8% das falas de personagem a voz sai trocada, e em 17,7% a personagem não tem voz própria (o
narrador lê). Narração nunca foi lida com voz de personagem (0 em 83). As frases sem pista (epíteto, autoria escrita)
são as que caem no narrador ou erram; é o limite da heurística já descrito no documento do juiz.

## Limites

- O ouro foi escrito por quem escreveu a heurística (viés a favor dela nas frases com pista).
- Livro trazido pela pessoa não tem ficha: a lista de personagens é vazia e só há narrador (a emoção ainda muda o ritmo).
- Sem juiz LLM, sem Chrome real com vozes reais: o que se ouve de verdade (timbres, troca de voz entre frases) não foi
  avaliado aqui. A cobertura é de teste com motor de voz de mentira e do e2e do fluxo.
