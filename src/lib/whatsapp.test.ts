import { test, expect } from 'vitest'
import { renderWaVars } from './whatsapp'

test('substitutes {{first_name}} inside a slot value', () => {
  expect(renderWaVars({ '1': 'Hi {{first_name}}!' }, 'Sarah')).toEqual({ '1': 'Hi Sarah!' })
})

test('passes static slot values through unchanged', () => {
  expect(renderWaVars({ '1': '{{first_name}}', '2': 'Saturday 9am' }, 'Omar')).toEqual({ '1': 'Omar', '2': 'Saturday 9am' })
})

test('substitutes every occurrence of the token', () => {
  expect(renderWaVars({ '1': '{{first_name}} {{first_name}}' }, 'A')).toEqual({ '1': 'A A' })
})

test('empty map renders to an empty map', () => {
  expect(renderWaVars({}, 'Sarah')).toEqual({})
})
