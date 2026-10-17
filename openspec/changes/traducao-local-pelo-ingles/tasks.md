## 1. Implementação

- [x] 1.1 Tabela única `core/traducao/viaIngles.ts`, lida pelo worker, adaptador, lista de download e cobertura
- [x] 1.2 Revisões fixadas dos 14 modelos novos (`revisoesDosModelos.ts`)
- [x] 1.3 `separarEmFrases`: letra sem caixa e `؟`
- [x] 1.4 Testes: cobertura nos 15 idiomas, o que não entra (hi, vi, pares diretos), revisões, frases em coreano e árabe

## 2. Verificação

- [x] 2.1 Qualidade: mesma frase em 16 idiomas no motor real (q8); hi e vi reprovados
- [x] 2.2 Navegador, sem nuvem e com o tradutor do Chrome desligado: chip "日本語 → Português (BR)" e "私は言語を勉強するのが好きです" → "Gosto de estudar línguas."

## 3. Pendências

- [ ] 3.1 Conferir no navegador o coreano, o russo e o árabe (só o japonês e o chinês foram vistos ponta a ponta)
- [ ] 3.2 Hindi e vietnamita, se aparecer um modelo melhor ou um recurso de revisão
