# ESPECIFICAÇÃO TÉCNICA (OPEN SPEC): SUÍTE DE MINIGAMES CULTURAIS "JUICED"
**Módulo:** `@core/minigames` & `src/components/minigames/`  
**Branch de Trabalho:** `feature/minigames-prototypes-juiced` (Isolada de `main`)  
**Autor:** Engenharia de Front-end, Arquitetura de Games & Game Feel Specialist  
**Status:** Especificação Proposta / Pronta para Implementação  

---

## 1. VISÃO GERAL E OBJETIVO ARQUITETURAL

O objetivo desta especificação é formalizar a arquitetura técnica, os contratos de estado, o loop de jogabilidade e, fundamentalmente, a **Camada de Game Feel ("Juice")** para a suíte de minigames do Babel Play, integrando princípios de SLA (Second Language Acquisition) e neurociência comportamental do aprendizado.

Cada minigame opera como um componente sandbox desacoplado:
1. **Zero State Leakage:** Não polui stores globais; troca de dados exclusivamente via `MinigameItem[]` e callback `onFinish(report: RoundReport)`.
2. **Tokens de Design Puros:** Respeito absoluto à paleta limpa do Babel Play (`bg-surface`, `border-border-subtle`, `text-ink`, `bg-accent`, `bg-accent-soft`), evitando neons artificiais.
3. **Imersão Sensorial Máxima ("Juice"):** Cada ação do usuário gera retorno sensorial imediato (< 16ms) via física de mola nos botões, screen shake, partículas dinâmicas, escalonamento de pitch sonoro e haptic feedback.

---

## 2. ARQUITETURA DE COMPONENTES E CONTRATOS

```mermaid
flowchart TD
    Host["Host View / Play.tsx"] -->|Injeta Props Imutáveis| Sandbox["Minigame Sandbox Component"]
    
    subgraph Engine ["Core Game Engine"]
        State["useReducer / useState<br/>(turnos, combo, tempo)"]
        Feel["GameFeelContext / useGameFeel()<br/>(shakes, particles, audio, haptics)"]
        FSRS["FSRS Difficulty Mapper<br/>(tempo, tentativas, dicas)"]
    end

    Sandbox --> Engine
    Engine -->|onFinish(RoundReport)| Host
```

### 2.1 Contrato Universal de Props (`BaseMinigameProps`)
```typescript
export interface BaseMinigameProps<TItem = MinigameItem> {
  items?: TItem[];
  ageProfile: AgeProfileType; // 'kids' | 'pro' | 'senior'
  audioUrl?: string | null;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}
```

---

## 3. ESPECIFICAÇÃO DOS 9 MINIGAMES CULTURAIS

| Minigame | Cultura / Idioma | Fase SLA | Mecânica Central & Dinâmica |
| :--- | :--- | :--- | :--- |
| **1. Karuta Arena** | 🇯🇵 Japão | Fase 1 (A1) | **Audio-Slap Reflex:** Varredura no tatame com decoys, áudio nativo e golpe imediato (*Kimariji 3x*). |
| **2. Shiritori Express** | 🇯🇵/🇰🇷 Japão / Coreia | Fase 2 (A2) | **Cadeia Fonológica Sem Fim:** Conexão da última à primeira letra com 100+ palavras e digitação livre (+100 pts). |
| **3. Choseong Arena** | 🇰🇷 Coreia do Sul | Fase 2 (A2) | **Decifrador Consonantal:** Preenchimento de blocos 3D com teclado físico/virtual e Modo Febre (Fever). |
| **4. Ich packe meinen Koffer** | 🇩🇪 Alemanha | Fase 3 (B1) | **Mala de Viagem & Acusativo:** Mala tátil que fecha no recall da memória de trabalho e declinação (*einen/eine/ein*). |
| **5. Tense Tennis** | 🇪🇸/🇲🇽 Espanha / LatAm | Fase 3 (B1) | **Pelota Gramatical:** Rebatida do verbo no tempo exigido pelo placar eletrônico sob pressão de tempo. |
| **6. Bao Mancala** | 🌍 África Oriental / Swahili | Fase 3 (B1) | **Semeadura Morfológica:** Raiz lexical no tabuleiro com captura de covas de afixos válidos (-OR, -ION, RE-). |
| **7. Cadavre Exquis** | 🇫🇷 França | Fase 4 (B2) | **Laboratório Surrealista:** Montagem de sentenças absurdas por constituintes sintáticos com declamação via TTS. |
| **8. Taboo Arena** | 🌐 Global / ESL | Fase 5 (C1) | **Forja da Circunlocução:** Paráfrases legais, Power-ups (Bomba, Dica, +15s) e Modo Forja Livre com Taboo Radar. |
| **9. Vitendawili Enigmas** | 🌍 Swahili / África | Fase 5 (C2) | **Charadas Culturais Tradicionais:** Decifração de metáforas sociopragmáticas com 3 cartas ilustradas táteis e dicas. |

---

## 4. CAMADA DE GAME FEEL (JUICE, FEEDBACK TÁTIL & MULTIPLICADORES)

Esta camada garante que a experiência de aprendizado seja viciante e dopamínica, operando sob o hook canônico `useGameFeel()` e utilitários de alta performance.

### 4.1 Sistema de Multiplicadores de Combo (Score Multiplier)
* **Escala Progressiva de Multiplicadores:**
  * **1x (Base):** Estado neutro inicial.
  * **2x (Streak):** A partir de 2 acertos consecutivos. Ícone de pontuação começa a pulsar.
  * **3x (Fire / Kimariji):** A partir de 4 acertos. Borda do HUD ganha resplendor dourado e multiplicador sobe em texto flutuante.
  * **5x (FEVER MODE):** A partir de 6 acertos consecutivos. A UI inteira entra em modo de alta energia, cronômetro ganha bônus de tempo (+2s) e as partículas dobram de densidade.
* **Quebra de Combo (Combo Break):** Um erro ou tempo esgotado reseta o combo para 1x, dispara efeito sonoro de buzzer áspero e screen shake na arena.

### 4.2 Feedback Físico e Câmera (Screen Shake & Micro-Springs)
* **Screen Shake Parametrizado:**
  * `shake(targetElement, intensity: 'soft' | 'medium' | 'heavy')`
  * `'soft'` (3px, 150ms): Erro leve de digitação ou timeout preventivo.
  * `'medium'` (6px, 250ms): Resposta errada na alternativa.
  * `'heavy'` (10px, 400ms): Violação de tabu na Taboo Arena ou perda de vida no Koffer Game.
* **Micro-Interação de Mola (Spring Buttons):**
  * Todos os botões interativos utilizam `active:scale-95 transition-transform duration-100 ease-out`, simulando um interruptor físico tátil.
  * Hover expansivo `hover:scale-[1.03]` com elevação de sombra.

### 4.3 Sistema de Partículas e Explosões Visuais
* **Engine Dupla de Partículas:**
  1. **Canvas Confetti 3D (Vitórias e Níveis Perfeitos):** Disparo de chuva de confetes tridimensionais girando na tela inteira (`canvas-confetti`) com paleta harmonizada ao tema do app.
  2. **Partículas Internas (`emitBurst`):**
     * **XP / Acerto:** Centelhas esmeralda que sobem a partir do ponto clicado.
     * **Combo / Fogo:** Partículas douradas em cone radial.
     * **Glitch / Erro:** Faíscas avermelhadas dispersas que somem em 300ms.

### 4.4 Pitch-Shifting Audio Escalation & Haptic Feedback
* **Web Audio API com Escalonamento de Pitch:**
  * A frequência do som de acerto (`play('success')`) sobe **+1 semitom para cada nível de combo** (até +6 semitons), gerando uma sensação intuitiva de progressão musical contínua.
* **Haptic Feedback Móvel (`navigator.vibrate`):**
  * Acerto simples: Pulso háptico suave de `10ms`.
  * Combo 3x+: Padrão duplo de celebração `[15ms, 30ms, 25ms]`.
  * Erro / Tabu Violado: Vibração pesada de advertência `[80ms, 40ms, 80ms]`.
  * Degradação graciosa automática quando `navigator.vibrate` não estiver disponível.

---

## 5. REGRAS DE CONTROLE DE VERSÃO & ISOLAMENTO

1. **Branch Estritamente Isolada:** Todo o desenvolvimento reside na branch `feature/minigames-prototypes-juiced`.
2. **Proteção da Branch Principal (`main`):** Nenhum commit, merge ou push pode tocar a branch principal.
3. **Auditoria Contínua:** Verificação de tipos via `npm run typecheck` com meta de zero erros antes de cada entrega.
