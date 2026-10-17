import { describe, expect, it } from 'vitest'

import { formatoDaLegenda, textoDaLegenda } from '../src/lib/import/legendas'

/**
 * LEGENDAS COMO MATERIAL DE ESTUDO (.srt, .vtt, .ass), LIDAS NO NAVEGADOR: o texto já existe, então não se paga transcrição.
 * Uma fala por linha, sem número de bloco, tempo, etiqueta nem repetição consecutiva.
 */
describe('formatoDaLegenda', () => {
  it('reconhece pela extensão, sem diferenciar maiúscula', () => {
    expect(formatoDaLegenda('Episodio 01.SRT')).toBe('srt')
    expect(formatoDaLegenda('aula.vtt')).toBe('vtt')
    expect(formatoDaLegenda('anime.ass')).toBe('ass')
    expect(formatoDaLegenda('anime.ssa')).toBe('ass')
  })

  it('o que não é legenda é null (segue o caminho do documento)', () => {
    expect(formatoDaLegenda('livro.pdf')).toBeNull()
    expect(formatoDaLegenda('notas.txt')).toBeNull()
    expect(formatoDaLegenda('srt')).toBeNull()
  })
})

describe('textoDaLegenda: SRT', () => {
  const srt = [
    '﻿1',
    '00:00:01,000 --> 00:00:03,000',
    '<i>Eu gosto de estudar.</i>',
    '',
    '2',
    '00:00:03,500 --> 00:00:06,000',
    'Hoje o tempo está bom,',
    'vamos passear no parque.',
    '',
    '3',
    '00:00:06,500 --> 00:00:08,000',
    '{\\an8}Tom &amp; Jerry &nbsp;chegaram.',
    '',
  ].join('\r\n')

  it('uma fala por linha: sem número, tempo, etiqueta nem BOM; as quebras do mesmo bloco se juntam', () => {
    expect(textoDaLegenda(srt, 'srt')).toBe(
      'Eu gosto de estudar.\nHoje o tempo está bom, vamos passear no parque.\nTom & Jerry chegaram.',
    )
  })

  it('a mesma fala em blocos seguidos (legenda de rolagem) aparece uma vez só', () => {
    const rolagem = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      'Olá',
      '',
      '2',
      '00:00:02,000 --> 00:00:03,000',
      'Olá',
      '',
      '3',
      '00:00:03,000 --> 00:00:04,000',
      'Tudo bem?',
    ].join('\n')
    expect(textoDaLegenda(rolagem, 'srt')).toBe('Olá\nTudo bem?')
  })

  it('japonês e outros idiomas sem espaço passam intactos', () => {
    const ja = ['1', '00:00:01,000 --> 00:00:03,000', '私は言語を勉強するのが好きです。'].join('\n')
    expect(textoDaLegenda(ja, 'srt')).toBe('私は言語を勉強するのが好きです。')
  })
})

describe('textoDaLegenda: WebVTT', () => {
  it('ignora o cabeçalho, NOTE, STYLE, identificadores e as posições do bloco', () => {
    const vtt = [
      'WEBVTT - aula 1',
      '',
      'NOTE isto é um comentário',
      '',
      'STYLE',
      '::cue { color: red }',
      '',
      'intro',
      '00:00.000 --> 00:02.000 align:start position:0%',
      '<v Professora>Bom dia, turma.</v>',
      '',
      '00:02.500 --> 00:04.000',
      'Vamos começar.',
    ].join('\n')
    expect(textoDaLegenda(vtt, 'vtt')).toBe('Bom dia, turma.\nVamos começar.')
  })
})

describe('textoDaLegenda: ASS/SSA', () => {
  const ass = [
    '[Script Info]',
    'Title: teste',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}こんにちは{\\i0}、元気ですか？',
    'Comment: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,isto é comentário',
    'Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Primeira linha\\NSegunda linha, com vírgula',
  ].join('\n')

  it('pega o último campo (que pode ter vírgulas), tira as sobreposições e junta o \\N; ignora Comment', () => {
    expect(textoDaLegenda(ass, 'ass')).toBe('こんにちは、元気ですか？\nPrimeira linha Segunda linha, com vírgula')
  })
})

describe('textoDaLegenda: o que não é legenda', () => {
  it('arquivo vazio, só cabeçalho ou texto qualquer: erro claro, nada de sessão vazia', () => {
    expect(() => textoDaLegenda('', 'srt')).toThrow(/Não achei falas/)
    expect(() => textoDaLegenda('WEBVTT\n\nNOTE só isso', 'vtt')).toThrow(/Não achei falas/)
    expect(() => textoDaLegenda('um texto qualquer sem tempos', 'srt')).toThrow(/Não achei falas/)
    expect(() => textoDaLegenda('[Script Info]\nTitle: x', 'ass')).toThrow(/Não achei falas/)
  })
})
