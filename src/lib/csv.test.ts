import { test, expect } from 'vitest'
import { toCsv } from './csv'

const BOM = '﻿'

test('plain values join with commas and CRLF row endings', () => {
  expect(toCsv(['a', 'b'], [['1', '2'], ['3', '4']])).toBe(BOM + 'a,b\r\n1,2\r\n3,4')
})

test('output starts with a UTF-8 BOM', () => {
  expect(toCsv(['a'], [['x']]).startsWith('﻿')).toBe(true)
})

test('value containing a comma is quoted', () => {
  expect(toCsv(['name'], [['Doe, Jane']])).toBe(BOM + 'name\r\n"Doe, Jane"')
})

test('value containing a double quote is quoted and the quote doubled', () => {
  expect(toCsv(['q'], [['say "hi"']])).toBe(BOM + 'q\r\n"say ""hi"""')
})

test('value containing a newline is quoted', () => {
  expect(toCsv(['n'], [['line1\nline2']])).toBe(BOM + 'n\r\n"line1\nline2"')
})

test('null and undefined become empty cells', () => {
  expect(toCsv(['a', 'b', 'c'], [[null, undefined, 'x']])).toBe(BOM + 'a,b,c\r\n,,x')
})

test('numbers are stringified', () => {
  expect(toCsv(['int', 'float'], [[42, 3.5]])).toBe(BOM + 'int,float\r\n42,3.5')
})

test('headers row comes first', () => {
  const lines = toCsv(['h1', 'h2'], [['r1', 'r2']]).slice(BOM.length).split('\r\n')
  expect(lines[0]).toBe('h1,h2')
  expect(lines[1]).toBe('r1,r2')
})

test('empty rows array yields just the header line', () => {
  expect(toCsv(['a', 'b'], [])).toBe(BOM + 'a,b')
})
