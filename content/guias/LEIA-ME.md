# Guias do Frasy: como revisar e publicar

Esta pasta tem 12 rascunhos de guias em pt-BR. Todos nascem com `revisado: false`, e só o que tiver
`revisado: true` entra no build e no `sitemap.xml` (ver `docs/specs/2026-10-25-site-publico-seo-e-anuncios.md`).
Este arquivo (`LEIA-ME.md`) não é um guia e não é publicado.

## Como publicar um guia

1. Leia o guia inteiro, com o checklist abaixo em mãos.
2. Corrija o que for preciso direto no `.md`.
3. No cabeçalho, troque `revisado: false` por `revisado: true`.
4. Ajuste `publicado` (AAAA-MM-DD) se a data de publicação real for outra.
5. Faça o build e confira `/guias` e a página do guia.

Para despublicar, volte para `revisado: false`.

## Formato do cabeçalho

```
---
titulo: "..."
descricao: "..."      até 155 caracteres (meta description)
slug: "..."           igual ao nome do arquivo, em kebab-case
publicado: "AAAA-MM-DD"
revisado: false
palavrasChave: ["...", "..."]
---
```

## Checklist por guia

**Fatos e exemplos**

- [ ] Cada exemplo em inglês/espanhol está correto, e a tradução em português é natural (não literal).
- [ ] Pronúncia, gírias, falsos cognatos e phrasal verbs conferidos em um dicionário confiável.
- [ ] Nenhum dado numérico, estudo ou estatística sem fonte. Os guias citam apenas a curva do esquecimento
      de Ebbinghaus e a ideia de prática de recuperação, de forma geral. Se quiser citar mais, confira a fonte.
- [ ] Nenhuma promessa de resultado ("fale inglês em 30 dias"). Os prazos são sempre honestos.

**O Frasy**

- [ ] As menções ao Frasy (no máximo uma por guia) descrevem só o que o app faz hoje: capturar o som do
      computador, transcrever e traduzir, guardar frases, revisão com repetição espaçada (FSRS) e jogos
      de vocabulário. Existe plano gratuito.
- [ ] Sem pressão, sem urgência, sem preço ou condição de plano (preços ficam em `src/core/planos.ts`).
- [ ] O guia continua útil sem o app.

**Público (o Frasy atende menores, a partir de 12 anos)**

- [ ] Nenhum exemplo com álcool, sexo, violência, drogas ou palavrões.
- [ ] Tom respeitoso, sem linguagem de culpa.
- [ ] A seção de reuniões pede permissão antes de gravar ou transcrever. Mantenha esse aviso.

**Qualidade editorial (Google e AdSense)**

- [ ] Texto original, escrito para ajudar o leitor, sem repetição de palavras-chave forçada.
- [ ] Estrutura com `##` e `###`, parágrafos curtos, passos concretos.
- [ ] Entre 900 e 1500 palavras, com começo, meio e fim.
- [ ] Sem HTML no Markdown.
- [ ] Links internos entre guias só para páginas que existam e estejam publicadas.

**Pontos que merecem atenção extra**

- `girias-do-ingles-americano`: gírias mudam rápido; releia as expressões e troque as que soarem datadas.
- `pronuncia-sons-dificeis-do-ingles`: as grafias aproximadas em português ("uón-tid" etc.) são aproximações; confira com
  um professor ou um dicionário com áudio.
- `espanhol-com-series-e-musicas`: tabela de falsos amigos; confira com um falante nativo se possível.
- `falsos-cognatos-ingles-portugues`: confira se cada par ainda faz sentido para o seu público.

## Guias

| Arquivo                                        | Tema                                            |
| ---------------------------------------------- | ----------------------------------------------- |
| `aprender-ingles-com-series.md`                | Séries, legendas em etapas e frases salvas      |
| `aprender-ingles-com-podcasts.md`              | Escolha por nível, escuta em camadas, shadowing |
| `ingles-em-reunioes-de-trabalho.md`            | Frases de reunião, preparação e revisão depois  |
| `girias-do-ingles-americano.md`                | Gírias e reduções com exemplos                  |
| `phrasal-verbs-mais-comuns.md`                 | Phrasal verbs por situação                      |
| `repeticao-espacada-explicada.md`              | Curva do esquecimento, intervalos, cartões      |
| `treinar-listening-do-zero.md`                 | Roteiro para iniciantes                         |
| `espanhol-com-series-e-musicas.md`             | Espanhol para brasileiros                       |
| `falsos-cognatos-ingles-portugues.md`          | Armadilhas de palavras parecidas                |
| `rotina-de-15-minutos-para-estudar-idiomas.md` | Hábito diário curto                             |
| `pronuncia-sons-dificeis-do-ingles.md`         | TH, vogais, R, H, -ed                           |
| `legendas-sem-virar-muleta.md`                 | Escada de legendas                              |
