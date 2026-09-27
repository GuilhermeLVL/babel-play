import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * OS JOGOS DE PONTA A PONTA NA EDIÇÃO ESTÁTICA (QA dos jogos, 2026-09-26).
 *
 * Cada teste abre um jogo pela Trilha embutida, joga a rodada até o fim de rodada comum
 * (`ResultadoDaRodada`, com "Voltar aos jogos") e confere o comportamento que o QA consertou:
 *  - Caça-palavras: marcar a palavra por TOQUE (tocar a 1ª e a última letra) no celular e por
 *    TECLADO (Enter nas duas pontas) no desktop — antes, os dois caminhos não marcavam nada;
 *  - Mala: a palavra nova aparece DEPOIS da contagem 3-2-1 (antes abria e fechava debaixo dela);
 *  - Choseong: quando o tempo acaba, a resposta aparece antes da próxima palavra;
 *  - Tabu: escolher errado mostra a certa antes de trocar de carta;
 *  - Duelo e Karuta: as teclas 1–9 escolhem a alternativa.
 *
 * DETERMINISMO. As respostas saem do mesmo arquivo que o app baixa (`dist/trilha/en.json`): a pista
 * é a tradução, e o teste procura a palavra que a tem. Os jogos de áudio ganham uma voz FALSA em
 * `speechSynthesis` (duas vozes, en-US e pt-BR) que registra o que foi dito — é assim que o teste
 * "ouve" a Karuta e o Ditado sem depender das vozes da máquina. Os passeios têm teto de voltas e
 * esperas curtas e fixas: nada aqui depende de sorteio do jogo para passar.
 */

const DIST = path.join(process.cwd(), 'dist', 'trilha', 'en.json');
type Registro = [string, string, string?, string?];
const TRILHA = JSON.parse(readFileSync(DIST, 'utf8')) as { niveis: Record<string, Registro[]> };
const REGISTROS: Registro[] = Object.values(TRILHA.niveis).flat();

const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const POR_TRADUCAO = new Map<string, string[]>();
for (const [palavra, traducao] of REGISTROS) {
  const k = norm(traducao);
  POR_TRADUCAO.set(k, [...(POR_TRADUCAO.get(k) ?? []), palavra]);
}
const palavrasDe = (pista: string) => (POR_TRADUCAO.get(norm(pista)) ?? []).map((p) => p.toLowerCase());

const JOGOS = [
  'memory', 'wordsearch', 'termo', 'blitz', 'scramble', 'escuta', 'ditado', 'karaoke', 'karuta',
  'choseong', 'tenis', 'koffer', 'bao', 'vitendawili', 'shiritori', 'cadavre', 'taboo',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((jogos: string[]) => {
    try {
      for (const j of jogos) localStorage.setItem(`babel_tour_${j}`, '1');
    } catch {
      /* storage bloqueado */
    }
    const w = window as unknown as {
      __falas: Array<{ t: string; lang: string }>;
      webkitSpeechRecognition: unknown;
      SpeechRecognition: unknown;
    };
    w.__falas = [];
    const s = window.speechSynthesis;
    if (s) {
      const vozes = [
        { name: 'Teste en', lang: 'en-US', localService: true, default: true, voiceURI: 'en' },
        { name: 'Teste pt', lang: 'pt-BR', localService: true, default: false, voiceURI: 'pt' },
      ];
      try {
        Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', {
          configurable: true,
          get() {
            return (this as { __v?: unknown }).__v ?? null;
          },
          set(v) {
            (this as { __v?: unknown }).__v = v;
          },
        });
      } catch {
        /* navegador sem o protótipo */
      }
      s.getVoices = () => vozes as unknown as SpeechSynthesisVoice[];
      s.speak = (u: SpeechSynthesisUtterance) => {
        w.__falas.push({ t: u.text, lang: u.lang });
        setTimeout(() => {
          u.onstart?.(new Event('start') as SpeechSynthesisEvent);
          setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 120);
        }, 10);
      };
      s.cancel = () => {};
    }
    /* Reconhecimento de fala falso: "ouve" a última coisa que a voz falou. Os DOIS nomes: o
       Chromium recente expõe `SpeechRecognition` sem prefixo, e o jogo prefere esse. */
    w.SpeechRecognition = w.webkitSpeechRecognition = class {
      onresult?: (e: unknown) => void;
      onend?: () => void;
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: w.__falas.at(-1)?.t ?? '' }]] });
          this.onend?.();
        }, 200);
      }
      stop() {}
      abort() {}
    };
  }, JOGOS);
});

/* ─────────────────────────── costura ─────────────────────────── */

async function abrirLobbyDaTrilha(page: Page) {
  await page.goto('/jogar');
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
  const pular = page.getByRole('button', { name: 'Pular apresentação' });
  if (await pular.isVisible().catch(() => false)) {
    await pular.click();
    await page.getByRole('button', { name: /Começar/ }).click();
  }
  await dispensarModais(page);
  await page.getByRole('radio', { name: /Trilha/ }).click();
  await page.getByRole('button', { name: /Usar estas palavras/ }).click();
  await expect(page.locator('#grade-de-jogos')).toBeVisible({ timeout: 15_000 });
}

/** As recompensas do fim de rodada (baú, conquista, nível) são diálogos: fecha um por um. */
async function dispensarModais(page: Page) {
  for (let i = 0; i < 6; i++) {
    const b = page.getByRole('dialog').getByRole('button', { name: /^(Resgatar e continuar|Continuar)$/ }).first();
    if (!(await b.isVisible().catch(() => false))) return;
    await b.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

/**
 * O "Continuar" de um jogo que tem tela própria antes do fim comum (Duelo, Cadavre). Centralizado
 * antes do clique: no celular, rente à borda, ele fica atrás da barra de navegação fixa.
 */
async function continuarNoPalco(page: Page) {
  const b = page.getByRole('main').getByRole('button', { name: /^Continuar$/ }).first();
  if (!(await b.isVisible().catch(() => false))) return;
  await b.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
  await b.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function abrirJogo(page: Page, titulo: RegExp) {
  await abrirLobbyDaTrilha(page);
  const carta = page.locator('#grade-de-jogos').getByRole('button', { name: titulo }).first();
  await expect(carta).toBeEnabled({ timeout: 15_000 });
  await carta.scrollIntoViewIfNeeded();
  await carta.click();
  const comecar = page.getByRole('button', { name: /^(Começar|Jogar agora|Começar a rodada)/ }).first();
  if (await comecar.isVisible().catch(() => false)) await comecar.click();
  await expect(page.locator('#palco')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
}

/** O fim de rodada comum: dispensa as recompensas e revela a raspadinha. */
async function chegarAoResultado(page: Page) {
  const voltar = page.getByRole('button', { name: /Voltar aos jogos/ });
  for (let i = 0; i < 60 && !(await voltar.isVisible().catch(() => false)); i++) {
    await continuarNoPalco(page);
    await dispensarModais(page);
    const revelar = page.getByRole('button', { name: 'Revelar sem raspar' });
    if (await revelar.isVisible().catch(() => false)) await revelar.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await expect(voltar, 'a rodada deveria terminar no fim de rodada comum').toBeVisible({ timeout: 5000 });
}

async function terminou(page: Page) {
  return (
    (await page.getByRole('button', { name: /Revelar sem raspar|Voltar aos jogos|Resgatar e continuar/ }).first().isVisible().catch(() => false)) ||
    (await page.getByText(/^Fim da rodada$/).first().isVisible().catch(() => false))
  );
}

const textos = async (l: Locator) => (await l.allInnerTexts()).map((t) => t.trim());
const ultimaFala = (page: Page) =>
  page.evaluate(() => (window as unknown as { __falas: Array<{ t: string; lang: string }> }).__falas.at(-1));

/* ─────────────────────────── os jogos ─────────────────────────── */

test('Memória: fecha todos os pares', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Memória/);
  const cartas = page.locator('[data-tour="mesa"] > button');
  const n = await cartas.count();
  const t: string[] = [];
  for (let i = 0; i < n; i++) t.push(((await cartas.nth(i).getAttribute('data-texto')) ?? '').toLowerCase());
  const usados = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (usados.has(i)) continue;
    const j = t.findIndex((x, k) => k !== i && !usados.has(k) && palavrasDe(t[i]).includes(x));
    if (j < 0) continue;
    usados.add(i).add(j);
    await cartas.nth(i).click();
    await cartas.nth(j).click();
    await page.waitForTimeout(200);
  }
  await chegarAoResultado(page);
});

test('Caça-palavras: marca por toque (celular) ou por teclado (desktop)', async ({ page }, info) => {
  await abrirJogo(page, /^Jogar: Caça-palavras/);
  const celulas = page.locator('[data-tour="grade"] > button');
  const n = await celulas.count();
  const lado = Math.round(Math.sqrt(n));
  const letras = await textos(celulas);
  const G = (l: number, c: number) => letras[l * lado + c];
  const achar = (w: string) => {
    const W = w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    for (let l = 0; l < lado; l++)
      for (let c = 0; c < lado; c++)
        for (const [dl, dc] of [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]) {
          let ok = true;
          for (let k = 0; k < W.length && ok; k++) {
            const L = l + dl * k;
            const C = c + dc * k;
            if (L < 0 || C < 0 || L >= lado || C >= lado || G(L, C) !== W[k]) ok = false;
          }
          if (ok) return [l * lado + c, (l + dl * (W.length - 1)) * lado + c + dc * (W.length - 1)] as const;
        }
    return null;
  };
  const pistas = await textos(page.locator('[data-tour="pistas"] li > span:first-child'));
  const achadas = () => page.locator('[data-tour="pistas"] li [aria-label="encontrada"]').count();
  let primeira = true;
  for (const p of pistas) {
    let pos: readonly [number, number] | null = null;
    for (const w of palavrasDe(p)) if ((pos = achar(w))) break;
    if (!pos) continue;
    const antes = await achadas();
    const [a, b] = [celulas.nth(pos[0]), celulas.nth(pos[1])];
    if (primeira && info.project.name.startsWith('mobile')) {
      await a.tap();
      await b.tap();
    } else if (primeira) {
      await a.focus();
      await page.keyboard.press('Enter');
      await b.focus();
      await page.keyboard.press('Enter');
    } else {
      const [ba, bb] = [await a.boundingBox(), await b.boundingBox()];
      await page.mouse.move(ba!.x + ba!.width / 2, ba!.y + ba!.height / 2);
      await page.mouse.down();
      await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    if (primeira) {
      await expect.poll(achadas, { message: 'a primeira palavra deveria ser marcada' }).toBe(antes + 1);
      primeira = false;
    }
    await page.waitForTimeout(150);
  }
  // o que não coube no dicionário, revela
  for (let i = 0; i < 10 && !(await terminou(page)); i++) {
    const olho = page.getByRole('button', { name: 'Revelar esta palavra' }).first();
    if (await olho.isVisible().catch(() => false)) await olho.click();
    await page.waitForTimeout(200);
  }
  await chegarAoResultado(page);
});

test('Soletrar (Termo): a escada chega ao fim digitando as palavras', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Soletrar/);
  for (let volta = 0; volta < 16 && !(await terminou(page)); volta++) {
    const pistas = await textos(page.locator('[data-tour="tabuleiro"] .tab-termo:not(.resolvido):not(.falhou) .pista'));
    if (!pistas.length) {
      await page.waitForTimeout(800);
      continue;
    }
    const colunas = await page.locator('[data-tour="tabuleiro"] .tab-termo').first().locator('.linha-termo').first().locator('> *').count();
    const w = palavrasDe(pistas[0]).find((x) => x.replace(/[^a-z]/g, '').length === colunas) ?? 'x'.repeat(colunas);
    await page.keyboard.type(w, { delay: 20 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
  }
  await chegarAoResultado(page);
});

test('Duelo: responde pelas teclas 1–4 até o fim', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Duelo/);
  for (let v = 0; v < 30; v++) {
    if (await page.getByRole('button', { name: /^Continuar$/ }).isVisible().catch(() => false)) break;
    const pergunta = page.locator('[data-tour="pergunta"]');
    if (!(await pergunta.isVisible().catch(() => false))) break;
    const cand = palavrasDe(await pergunta.innerText());
    const alts = await textos(page.locator('[data-tour="alternativas"] button'));
    const i = Math.max(0, alts.findIndex((a) => cand.includes(a.toLowerCase())));
    await page.keyboard.press(String(i + 1));
    await page.waitForTimeout(550);
  }
  await chegarAoResultado(page);
});

test('Frase embaralhada: monta com a dica até o fim', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Frase embaralhada/);
  for (let v = 0; v < 8 && !(await terminou(page)); v++) {
    const pecas = page.locator('[data-tour="pecas"] button');
    for (let d = 0; d < 20 && (await pecas.count()) > 0; d++) {
      await page.getByRole('button', { name: /Próxima palavra/ }).click();
      await page.waitForTimeout(60);
    }
    await page.locator('[data-tour="conferir"]').click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1600);
  }
  await chegarAoResultado(page);
});

test('Qual foi?: escolhe a palavra que a voz disse', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Qual foi/);
  for (let v = 0; v < 8 && !(await terminou(page)); v++) {
    const ops = page.locator('[data-tour="alternativas"] button');
    await expect(ops.first()).toBeEnabled({ timeout: 5000 }).catch(() => {});
    if (await terminou(page)) break;
    const f = await ultimaFala(page);
    const alts = await textos(ops);
    const i = Math.max(0, alts.findIndex((a) => a === f?.t));
    await page.keyboard.press(String(i + 1));
    await page.waitForTimeout(1100);
  }
  await chegarAoResultado(page);
});

test('Ditado: escreve o que ouviu (caixa e pontuação não contam)', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Ditado/);
  for (let v = 0; v < 8 && !(await terminou(page)); v++) {
    const entrada = page.locator('[data-tour="entrada"]');
    if (!(await entrada.isEnabled().catch(() => false))) {
      await page.waitForTimeout(400);
      continue;
    }
    const f = await ultimaFala(page);
    await entrada.fill(`${(f?.t ?? 'x').toUpperCase()}!`);
    await page.keyboard.press('Enter');
    await expect(page.locator('#palco')).toContainText('100%');
    await page.waitForTimeout(1400);
  }
  await chegarAoResultado(page);
});

test('Karaokê: fala, recebe a nota e termina', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Karaokê/);
  for (let v = 0; v < 8 && !(await terminou(page)); v++) {
    const falar = page.locator('[data-tour="falar"]');
    if (!(await falar.isVisible().catch(() => false))) break;
    await page.getByRole('button', { name: /^Ouvir/ }).first().click();
    await page.waitForTimeout(300);
    await falar.click();
    await expect(page.locator('#palco')).toContainText('%', { timeout: 5000 });
    await expect(page.getByRole('button', { name: /^Parar$/ })).toHaveCount(0);
    const seguir = page.getByRole('button', { name: /^(Próxima|Terminar)/ });
    const ultima = /^Terminar/.test((await seguir.innerText()).trim());
    await seguir.click();
    if (ultima) break;
    await page.waitForTimeout(400);
  }
  await chegarAoResultado(page);
});

test('Karuta: ouve a pista e golpeia pela tecla', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Karuta/);
  for (let v = 0; v < 10 && !(await terminou(page)); v++) {
    const cartas = page.locator('[data-tour="cartas"] button');
    if (!(await cartas.first().isEnabled().catch(() => false))) {
      await page.waitForTimeout(300);
      continue;
    }
    const pista = await page.evaluate(
      () => (window as unknown as { __falas: Array<{ t: string; lang: string }> }).__falas.filter((f) => /^pt/.test(f.lang)).at(-1)?.t ?? '',
    );
    const alts = await textos(cartas);
    const i = Math.max(0, alts.findIndex((a) => palavrasDe(pista).includes(a.toLowerCase())));
    await page.keyboard.press(String(i + 1));
    await page.waitForTimeout(900);
  }
  await chegarAoResultado(page);
});

test('Choseong: quando o tempo acaba, a resposta aparece', async ({ page }) => {
  test.slow();
  await abrirJogo(page, /^Jogar: Choseong/);
  const aviso = page.locator('[data-aviso-da-jogada]');
  await expect(aviso, 'o tempo da 1ª palavra acaba e a resposta aparece').toBeVisible({ timeout: 25_000 });
  const revelada = await aviso.locator('b').innerText();
  expect(revelada.trim().length).toBeGreaterThan(0);
  for (let v = 0; v < 12 && !(await terminou(page)); v++) {
    const pista = page.locator('[data-tour="pista"]');
    if (!(await pista.isVisible().catch(() => false)) || (await aviso.isVisible().catch(() => false))) {
      await page.waitForTimeout(400);
      continue;
    }
    const slots = (await page.locator('#palco [lang]').first().innerText()).replace(/\s+/g, '');
    const w = palavrasDe(await pista.innerText()).find(
      (x) => x.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '') === slots.replace(/[AEIOU]/g, ''),
    );
    if (!w) {
      await page.waitForTimeout(16_000);
      continue;
    }
    await page.keyboard.type(w.toUpperCase().replace(/[^AEIOU]/g, '').toLowerCase(), { delay: 30 });
    await page.waitForTimeout(900);
  }
  await chegarAoResultado(page);
});

test('Rali: devolve escrevendo, com caixa e pontuação livres', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Rali/);
  for (let v = 0; v < 14 && !(await terminou(page)); v++) {
    const entrada = page.getByLabel('Sua devolução');
    if (!(await entrada.isEnabled().catch(() => false))) {
      await page.waitForTimeout(250);
      continue;
    }
    const w = palavrasDe(await page.locator('[data-tour="bola"] p').innerText())[0] ?? 'x';
    await entrada.fill(` ${w.toUpperCase()}. `);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
  }
  await chegarAoResultado(page);
});

test('Mala: a palavra nova aparece depois da contagem, e a mala fecha 8 de 8', async ({ page }) => {
  test.slow();
  await abrirJogo(page, /^Jogar: Mala/);
  await expect(page.getByText('Mala aberta'), 'a primeira palavra fica à vista com a rodada já andando').toBeVisible();
  const ordem: string[] = [];
  for (let v = 0; v < 400 && !(await terminou(page)); v++) {
    if (await page.getByText('Mala aberta').isVisible().catch(() => false)) {
      const itens = (await textos(page.locator('[data-tour="mala"] ol li'))).map((t) => t.split('\n')[0].replace(/^\d+\s*/, '').trim());
      if (itens.length > ordem.length) ordem.splice(0, ordem.length, ...itens);
      await page.waitForTimeout(250);
      continue;
    }
    const passo = (await page.getByText(/^Passo \d+ de \d+/).innerText().catch(() => '')).match(/Passo (\d+)/);
    if (!passo) {
      await page.waitForTimeout(250);
      continue;
    }
    const alvo = ordem[Number(passo[1]) - 1];
    expect(alvo, 'a mala nunca pede uma palavra que não foi vista').toBeTruthy();
    /* Na última palavra de um nível a mala reabre e a palheta é reembaralhada: o botão pode sumir
       entre achar e clicar. Aí a volta seguinte relê a tela. */
    await page
      .locator(`[data-tour="entrada"] button[data-palavra="${alvo}"]`)
      .click({ timeout: 1500 })
      .catch(() => {});
    await page.waitForTimeout(200);
  }
  await chegarAoResultado(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^8 de 8 palavras$/);
});

test('Bao: semeia os pedaços até o fim', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Bao/);
  for (let v = 0; v < 16 && !(await terminou(page)); v++) {
    const pista = (await page.locator('#palco p.font-display').first().innerText().catch(() => '')).trim();
    const covas = page.locator('[data-tour="tabuleiro"] .grid button');
    const pedacos = await textos(covas);
    let resto = palavrasDe(pista).find((x) => pedacos.every((p) => !p || x.includes(p.toLowerCase()))) ?? '';
    for (let k = 0; k < 8 && resto; k++) {
      const atual = (await textos(covas)).map((t) => t.toLowerCase());
      const i = atual.findIndex((t) => t && resto.startsWith(t));
      if (i < 0) break;
      await covas.nth(i).click();
      resto = resto.slice(atual[i].length);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1000);
  }
  await chegarAoResultado(page);
});

test('Vitendawili: completa as lacunas pela tecla', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Vitendawili/);
  for (let v = 0; v < 12 && !(await terminou(page)); v++) {
    const enigma = page.locator('[data-tour="enigma"]');
    if (!(await enigma.isVisible().catch(() => false))) break;
    const frase = norm(await enigma.innerText());
    const alts = await textos(page.locator('[data-tour="alternativas"] button'));
    const reg = REGISTROS.find((r) => r[2] && alts.some((a) => a.toLowerCase() === r[0].toLowerCase()) && norm(r[2]).replace(norm(r[0]), '').replace(/\s+/g, ' ').trim() === frase);
    const i = Math.max(0, reg ? alts.findIndex((a) => a.toLowerCase() === reg[0].toLowerCase()) : 0);
    await page.keyboard.press(String(i + 1));
    await page.waitForTimeout(900);
  }
  await chegarAoResultado(page);
});

test('Shiritori: encadeia pela última letra e termina no fim comum', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Shiritori/);
  for (let v = 0; v < 12 && !(await terminou(page)); v++) {
    const ponta = page.getByText('Palavra na ponta').locator('xpath=following-sibling::p[1]');
    if (!(await ponta.isVisible().catch(() => false))) {
      await page.waitForTimeout(300);
      continue;
    }
    const ultima = norm(await ponta.innerText()).slice(-1);
    const alts = await textos(page.locator('[data-tour="opcoes"] button'));
    const i = Math.max(0, alts.findIndex((a) => norm(a)[0] === ultima));
    await page.keyboard.press(String(i + 1));
    await page.waitForTimeout(600);
  }
  await expect(page.getByText('Fim da corrente'), 'a tela própria saiu: o fim é o comum').toHaveCount(0);
  await chegarAoResultado(page);
});

test('Cadavre exquis: escreve a frase e confere', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Cadavre/);
  const palavras = await textos(page.locator('[data-tour="palavras"] span.font-display'));
  await page.locator('[data-tour="frase"]').fill(`The ${palavras.join(' and ')}.`);
  await page.getByRole('button', { name: /Conferir/ }).click();
  await expect(page.locator('#palco')).toContainText(/palavras usadas: 4\/4/);
  await chegarAoResultado(page);
});

test('Tabu: errar mostra a certa antes da próxima carta', async ({ page }) => {
  await abrirJogo(page, /^Jogar: Tabu/);
  const alts = page.locator('[data-tour="alternativas"] button');
  await expect(alts.first()).toBeEnabled();
  // Qual é a certa não importa aqui: escolhe duas diferentes, e pelo menos uma é errada.
  await page.keyboard.press('1');
  const aviso = page.locator('[data-aviso-da-jogada="erro"]');
  if (!(await aviso.isVisible().catch(() => false))) {
    await page.waitForTimeout(900);
    await page.keyboard.press('1');
  }
  await expect(aviso).toBeVisible();
  await expect(aviso.locator('b')).not.toBeEmpty();
  for (let v = 0; v < 12 && !(await terminou(page)); v++) {
    await page.waitForTimeout(1900);
    if (await terminou(page)) break;
    await page.keyboard.press('1');
  }
  await chegarAoResultado(page);
});

test('Caça-conectores: na Trilha fica em "Precisam de outro material" dizendo o porquê', async ({ page }) => {
  await abrirLobbyDaTrilha(page);
  await expect(page.locator('#grade-de-jogos')).toContainText('as frases da trilha quase nunca têm conector');
});
