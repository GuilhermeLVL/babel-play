#!/usr/bin/env node
/**
 * VALIDA O YAML DE TODOS OS WORKFLOWS — o gate que faltava.
 *
 * Um workflow com YAML inválido não falha: o GitHub simplesmente não o executa, e a única pista é
 * um aviso na aba Actions que ninguém abre. Foi assim que `uptime.yml` ficou inválido de
 * 2026-08-31 a 2026-09-07 sem que o vigia de uptime rodasse uma vez (auditoria de 2026-09-07,
 * achado A42). Este script roda no CI antes de tudo e falha alto, citando arquivo e linha.
 *
 *   node scripts/validar-workflows.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
let falhou = false;

for (const nome of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n)).sort()) {
  const caminho = join(DIR, nome);
  try {
    const doc = yaml.load(readFileSync(caminho, 'utf8'));
    // Um workflow sem `jobs` também não roda — o parser aceita, o GitHub não.
    if (!doc || typeof doc !== 'object' || !('jobs' in doc)) {
      console.error(`${nome}: YAML válido mas sem \`jobs\` — o GitHub não executa este arquivo`);
      falhou = true;
      continue;
    }
    console.log(`${nome}: OK`);
  } catch (err) {
    const linha = err?.mark?.line != null ? `:${err.mark.line + 1}` : '';
    console.error(`${nome}${linha}: ${String(err?.reason ?? err?.message ?? err)}`);
    falhou = true;
  }
}

process.exit(falhou ? 1 : 0);
