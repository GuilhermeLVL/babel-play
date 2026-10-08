const fs = require('fs');
const troca = (arq, de, para) => {
  let s = fs.readFileSync(arq, 'utf8');
  for (const [a, b] of de.map((x, i) => [x, para[i]])) {
    if (!s.includes(a)) throw new Error(arq + ': nao achei ' + a);
    s = s.replace(a, b);
  }
  fs.writeFileSync(arq, s);
};
const M = 'src/components/minigames/';
troca(M + 'MemoryGame.tsx',
  ["import { falarNoJogo as falar } from './noQuest';\n",
   "export default function MemoryGame({ items, ageProfile: _ageProfile, onFinish, estadoDoCartao }: MemoryGameProps) {"],
  ["import MemoriaDoPrototipo from './MemoriaDoPrototipo';\nimport { falarNoJogo as falar, useQuestNovo } from './noQuest';\n",
   "/** No desenho novo a Memória é o tabuleiro do protótipo (`MemoriaDoPrototipo.tsx`); fora dele, a de sempre. */\nexport default function MemoryGame(props: MemoryGameProps) {\n  return useQuestNovo() ? <MemoriaDoPrototipo {...props} /> : <MemoriaDeSempre {...props} />;\n}\n\nfunction MemoriaDeSempre({ items, ageProfile: _ageProfile, onFinish, estadoDoCartao }: MemoryGameProps) {"]);
troca(M + 'WordSearchGame.tsx',
  ["import { falarNoJogo as falar, useNoHeadset, useQuestNovo } from './noQuest';\n",
   "export default function WordSearchGame({ items, ageProfile, onFinish }: WordSearchGameProps) {"],
  ["import CacaPalavrasDoPrototipo from './CacaPalavrasDoPrototipo';\nimport { falarNoJogo as falar, useNoHeadset, useQuestNovo } from './noQuest';\n",
   "/** No desenho novo o Caça-palavras é o tabuleiro do protótipo (`CacaPalavrasDoPrototipo.tsx`); fora dele, o de sempre. */\nexport default function WordSearchGame(props: WordSearchGameProps) {\n  return useQuestNovo() ? <CacaPalavrasDoPrototipo {...props} /> : <CacaPalavrasDeSempre {...props} />;\n}\n\nfunction CacaPalavrasDeSempre({ items, ageProfile, onFinish }: WordSearchGameProps) {"]);
troca(M + 'BlitzGame.tsx',
  ["import { falarNoJogo as falar } from './noQuest';\n",
   "export default function BlitzGame({ items, ageProfile, onFinish }: BlitzGameProps) {"],
  ["import DueloDoPrototipo from './DueloDoPrototipo';\nimport { falarNoJogo as falar, useQuestNovo } from './noQuest';\n",
   "/** No desenho novo o Duelo é o tabuleiro do protótipo (`DueloDoPrototipo.tsx`); fora dele, o de sempre. */\nexport default function BlitzGame(props: BlitzGameProps) {\n  return useQuestNovo() ? <DueloDoPrototipo {...props} /> : <DueloDeSempre {...props} />;\n}\n\nfunction DueloDeSempre({ items, ageProfile, onFinish }: BlitzGameProps) {"]);
troca(M + 'TermoGame.tsx',
  ["import { falarNoJogo as falar, useNoHeadset, useQuestNovo, useVozNoJogo } from './noQuest';\n",
   "export default function TermoGame({ rodadas, ageProfile, onFinish }: TermoGameProps) {"],
  ["import { falarNoJogo as falar, useNoHeadset, useQuestNovo, useVozNoJogo } from './noQuest';\nimport TermoDoPrototipo from './TermoDoPrototipo';\n",
   "/** No desenho novo o Soletrar é o tabuleiro do protótipo (`TermoDoPrototipo.tsx`); fora dele, o de sempre. */\nexport default function TermoGame(props: TermoGameProps) {\n  return useQuestNovo() ? <TermoDoPrototipo {...props} /> : <TermoDeSempre {...props} />;\n}\n\nfunction TermoDeSempre({ rodadas, ageProfile, onFinish }: TermoGameProps) {"]);
troca(M + 'ScrambleGame.tsx',
  ["import { falarNoJogo as falar, useQuestNovo, useVozNoJogo, VereditoNoQuest } from './noQuest';\n",
   "export default function ScrambleGame({ rodadas, ageProfile, onFinish }: ScrambleGameProps) {"],
  ["import FraseDoPrototipo from './FraseDoPrototipo';\nimport { falarNoJogo as falar, useQuestNovo, useVozNoJogo, VereditoNoQuest } from './noQuest';\n",
   "/** No desenho novo a Frase embaralhada é o tabuleiro do protótipo (`FraseDoPrototipo.tsx`); fora dele, a de sempre. */\nexport default function ScrambleGame(props: ScrambleGameProps) {\n  return useQuestNovo() ? <FraseDoPrototipo {...props} /> : <FraseDeSempre {...props} />;\n}\n\nfunction FraseDeSempre({ rodadas, ageProfile, onFinish }: ScrambleGameProps) {"]);
troca(M + 'culturais/ChoseongGame.tsx',
  ["import { falarNoJogo as falar, useQuestNovo, VereditoNoQuest } from '../noQuest';\n",
   "export default function ChoseongGame({ items, ageProfile, onFinish, onExit }: ChoseongGameProps) {"],
  ["import { falarNoJogo as falar, useQuestNovo, VereditoNoQuest } from '../noQuest';\nimport ChoseongDoPrototipo from './ChoseongDoPrototipo';\n",
   "/** No desenho novo o Choseong é o tabuleiro do protótipo (`ChoseongDoPrototipo.tsx`); fora dele, o de sempre. */\nexport default function ChoseongGame(props: ChoseongGameProps) {\n  return useQuestNovo() ? <ChoseongDoPrototipo {...props} /> : <ChoseongDeSempre {...props} />;\n}\n\nfunction ChoseongDeSempre({ items, ageProfile, onFinish, onExit }: ChoseongGameProps) {"]);
console.log('ok');
