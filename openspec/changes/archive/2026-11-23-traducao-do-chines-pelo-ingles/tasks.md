## 1. Implementação

- [x] 1.1 `separarEmFrases` reconhece `。！？` (`src/core/texto/frases.ts`)
- [x] 1.2 Par zh→en no worker (`mtWorker.ts`) e revisão fixada do modelo (`revisoesDosModelos.ts`)
- [x] 1.3 Pivô no `OpusMtLocal` (`supports`, `preload`, `translate`)
- [x] 1.4 `expectedModelIds` e `mtCoverage` com o par
- [x] 1.5 Testes: `tests/traducao-zh-pivo.test.ts` e `tests/outros-idiomas.test.ts`

## 2. Verificação

- [x] 2.1 `npm run typecheck`, lint e suíte completa
- [x] 2.2 No Chrome 155, perfil novo, sem consentimento, Translator desligado: `我喜欢学习中文。今天天气很好,我们去公园散步吧!` → "Gosto de aprender chinês. É um bom dia. Vamos dar um passeio no parque!" (`tradução degradou para opus-mt-local`)

## 3. Pendências

- [ ] 3.1 Escrita do Whisper em zh (tradicional às vezes, simplificada outras): normalizar para o zh-CN
- [ ] 3.2 ja/ko/ar/ru/hi → pt pelo mesmo pivô, se houver modelo X→en
