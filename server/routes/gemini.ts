/**
 * O TUTOR DE CHAT — `POST /api/gemini/chat`, montado em `/api/gemini`.
 *
 * Era a única ROTA DE NEGÓCIO escrita dentro do `server.ts`: 170 linhas de cascata de LLM no meio
 * do bootstrap de infraestrutura, o que fazia o arquivo-deus (703 linhas) misturar "como o processo
 * sobe" com "o que o tutor responde". A change `servidor-app-e-bootstrap` (Fase 3) separou as duas
 * coisas; aqui não há nenhuma decisão nova — é a mesma cascata, com os mesmos timeouts, a mesma
 * quota gerenciada e as mesmas respostas.
 *
 * A CASCATA, em ordem: Groq (nuvem, só com entitlement e reserva de quota) → Gemini → Ollama local.
 * O local é o piso, e é ele que faz o plano gratuito continuar conversando sem gastar a chave do dono.
 *
 * OS SEIS `console.*` DESTE ARQUIVO SÃO DÍVIDA HERDADA, e estão marcados um a um.
 *
 * A regra `no-console` do `eslint.config.js` cobre `server/routes/` porque `console` no caminho de
 * request é log que nenhum agregador vê (achado F5-04). Estas seis linhas vieram INTACTAS do
 * `server.ts`, onde a regra não alcançava — três são mensagens de BOOT (a inicialização do cliente
 * Gemini, que o `.env` decide) e três são o diagnóstico da cascata, que é o único sinal de "o
 * provedor recusou" que existe hoje. Trocá-las pelo `log()` mudaria o formato da saída, e esta
 * change move código sem mudar comportamento. A migração é da fase de observabilidade.
 */
import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { prepareLlmRequest } from "../ai/llmRequest";
import { chamarChat, type MensagemDeChat } from "../ai/llmClient";
import { llmDeNuvem, llmLocal, MODELO_GEMINI_PADRAO } from "../ai/provedores";
/* F14-02: a leitura de env sai do handler e passa pelo inventario declarado em lib/config. */
import { chaveDoGemini, modeloDoGemini } from "../lib/config";
import { hasEntitlement } from "../lib/entitlements";
import { reserveManagedCall, refundManagedCall } from "../lib/usageQuota";

export const geminiRouter = Router();

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
let clienteResolvido = false;

/**
 * O CLIENTE É RESOLVIDO NA PRIMEIRA CHAMADA, NÃO NO IMPORT — e isso não é preferência de estilo.
 *
 * Enquanto este código morava no `server.ts`, ele rodava depois do `dotenv.config()` daquele
 * arquivo. Num módulo importado, o corpo executa ANTES do corpo de quem importa: um
 * `new GoogleGenAI(...)` no topo leria `GEMINI_API_KEY` antes de o `.env` ter sido carregado e o
 * self-host perderia a chave sem nenhum sinal. Memoizado, então a mensagem de boot continua saindo
 * uma vez só — o `criarApp()` chama esta função no mesmo ponto do boot em que a inicialização
 * acontecia antes.
 */
export function iniciarClienteGemini(): GoogleGenAI | null {
  if (clienteResolvido) return ai;
  clienteResolvido = true;
  const apiKey = chaveDoGemini();

  if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
    try {
      ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
          // P1-10: era a ÚNICA chamada externa do servidor sem timeout algum — sem `signal` e
          // sem `httpOptions.timeout`, uma requisição pendurada segurava um slot do event loop
          // para sempre. 30s alinha com o caminho do Groq (tryGroqChat).
          timeout: 30_000,
        }
      });
      // eslint-disable-next-line no-console -- boot, herdado do server.ts (ver docblock)
      console.log("Gemini client initialized successfully.");
    } catch (err) {
      // eslint-disable-next-line no-console -- boot, herdado do server.ts (ver docblock)
      console.error("Error initializing Gemini client:", err);
    }
  } else {
    // eslint-disable-next-line no-console -- boot, herdado do server.ts (ver docblock)
    console.log("Nenhuma chave de LLM em nuvem — usando LLM local (Ollama) quando disponível.");
  }
  return ai;
}

/**
 * AS DUAS TENTATIVAS DE LLM — agora sobre o cliente unico (`server/ai/llmClient.ts`).
 *
 * Havia aqui duas copias completas da mesma chamada HTTP, com politicas diferentes: 60 s e sem
 * teto de saida no local, 30 s e temperatura 0.7 na nuvem, cada uma com o seu tratamento de erro e
 * a sua cadeia de env para descobrir modelo e endereco (auditoria de 2026-09-07, achado A31). O
 * que sobra aqui e o que e ESPECIFICO deste endpoint: montar as mensagens no formato do chat e
 * devolver `null` quando nao deu, porque quem chama e uma cascata.
 */
function mensagensDeChat(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string,
): MensagemDeChat[] {
  return [
    { role: "system" as const, content: systemInstruction || "" },
    ...messages.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
  ];
}

async function tryOllamaChat(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string
): Promise<string | null> {
  const prov = llmLocal();
  // 60 s: o modelo local roda na CPU de quem esta usando o app, e ali a espera e o preco de nao
  // depender de nuvem. E a unica politica que continua diferente do padrao, e por isso explicita.
  const r = await chamarChat({ ...prov, messages: mensagensDeChat(messages, systemInstruction), timeoutMs: 60_000 });
  if (!r.ok) {
    // eslint-disable-next-line no-console -- diagnostico da cascata, herdado do server.ts
    console.warn("LLM local (Ollama) indisponível:", r.causa);
    return null;
  }
  return r.texto ?? null;
}

async function tryGroqChat(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string | null> {
  const prov = llmDeNuvem();
  if (!prov) return null;
  const r = await chamarChat({
    ...prov,
    messages: mensagensDeChat(messages, systemInstruction),
    temperature: typeof opts?.temperature === "number" ? opts.temperature : 0.7,
    maxTokens: opts?.maxTokens,
  });
  if (!r.ok) {
    // eslint-disable-next-line no-console -- diagnostico da cascata, herdado do server.ts
    console.warn("LLM de nuvem indisponível:", r.causa);
    return null;
  }
  return r.texto ?? null;
}


// Full-Stack API Route for LLM Interactions (Groq em nuvem → Gemini → Ollama local)
geminiRouter.post("/chat", async (req, res) => {
  // Reserva pendente de quota gerenciada — estornada em todo caminho que não entrega
  // resposta da NUVEM (degradação para Ollama inclusive: o local não gasta a chave do dono).
  let reservaPendente = false;
  try {
    // S-06: validação + teto de tamanho do prompt e clamp de max_tokens no servidor.
    const prep = prepareLlmRequest(req.body);
    if (!prep.ok) {
      return res.status(prep.status).json({ error: prep.error });
    }
    const { messages, systemInstruction } = prep;
    const llmOpts = { temperature: prep.temperature, maxTokens: prep.maxTokens };

    // SaaS Fatia 1b — IA de nuvem GERENCIADA (Groq/Gemini) só para quem tem o entitlement. Sem ele,
    // o handler PULA a nuvem e usa o LLM local (Ollama) — não é 402 seco, porque o local é grátis e
    // um caminho válido (o free ainda conversa via Ollama; só não gasta a chave do dono).
    // Gerenciado só se o plano cobre E a reserva de quota coube; over-quota degrada para o local.
    // A reserva vem ANTES da chamada (P0-1) e cobre a tentativa de nuvem — Groq ou Gemini.
    const managed = (await hasEntitlement(req.userId, "managedCloudLlm"))
      && (reservaPendente = await reserveManagedCall(req.userId));

    // Preferência: Groq (nuvem) quando há GROQ_API_KEY e o plano cobre. Rápido e sem GPU local.
    const groqText = managed ? await tryGroqChat(messages, systemInstruction, llmOpts) : null;
    if (groqText) {
      reservaPendente = false; // consumada
      return res.json({ text: groqText, engine: "groq", local: false });
    }

    // Sem nuvem gerenciada (plano não cobre, ou sem Gemini, ou o Groq falhou): LLM local (Ollama).
    const cliente = iniciarClienteGemini();
    if (!managed || !cliente) {
      const localText = await tryOllamaChat(messages, systemInstruction);
      if (localText) {
        return res.json({ text: localText, engine: "ollama", local: true });
      }
      // Honesto: sem modelo local. `reason` diz se falta plano Pro (nuvem) ou um modelo local.
      return res.json({ text: null, unavailable: true, reason: managed ? "no_local_model" : "managed_requires_pro" });
    }

    // Map conversation to GoogleGenAI format
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await cliente.models.generateContent({
      // Modelo cravado ate 07/09 (achado A31): trocar de modelo exigia editar e reconstruir a imagem.
      model: modeloDoGemini() || MODELO_GEMINI_PADRAO,
      contents,
      config: {
        systemInstruction,
        // M-02: o caminho Gemini ignorava os parâmetros do cliente (fixava 0.7, sem teto de saída).
        // Agora respeita temperature e o max_tokens JÁ CLAMPADO por prepareLlmRequest.
        temperature: prep.temperature ?? 0.7,
        maxOutputTokens: prep.maxTokens,
      },
    });

    // M-02: toda resposta agora carrega `engine` (o caminho Gemini não carregava — o cliente não
    // conseguia saber qual provedor respondeu).
    reservaPendente = false; // consumada pelo Gemini
    res.json({ text: response.text || "No response received from the model.", engine: "gemini", local: false });
  } catch (error: any) {
    // eslint-disable-next-line no-console -- diagnostico da cascata, herdado do server.ts
    console.error("Gemini API Error:", error);
    // Erro na nuvem: tentamos o LLM local como alternativa honesta.
    //
    // P2-2: aqui ia `req.body.messages` CRU, pulando `prepareLlmRequest` — o teto de 100k
    // chars (server/ai/llmRequest.ts) não se aplicava neste ramo, então um prompt gigante
    // que fosse rejeitado no caminho normal entrava pelo caminho de erro. Revalidamos.
    const prepFallback = prepareLlmRequest(req.body);
    if (!prepFallback.ok) {
      return res.status(prepFallback.status).json({ error: prepFallback.error });
    }
    const localText = await tryOllamaChat(prepFallback.messages, prepFallback.systemInstruction);
    if (localText) {
      return res.json({ text: localText, engine: "ollama", local: true });
    }
    res.json({ text: null, unavailable: true, reason: "no_local_model" });
  } finally {
    // Degradou para Ollama, falhou, ou nem chegou à nuvem: a reserva não virou chamada paga.
    if (reservaPendente) await refundManagedCall(req.userId);
  }
});
