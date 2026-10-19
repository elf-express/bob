import { describe, expect, it } from 'vitest'

import { generateAnnotation } from './ai-annotation-service.js'

describe('generateAnnotation', () => {
  it('infers purpose and tag from the path and appends the exported name', () => {
    const result = generateAnnotation('apps/src/api/order.ts', 'export async function fetchOrders() {}')

    expect(result).toEqual({
      purpose: 'API client / data fetching: fetchOrders',
      relations: '',
      tags: ['api'],
      engine: 'rule-based',
      confidence: 'medium',
    })
  })

  it('normalises backslashes before matching path patterns', () => {
    const result = generateAnnotation('src\\routes\\files.js', '')

    expect(result).toMatchObject({ purpose: 'Express route handler', tags: ['route'] })
  })

  it('adds the test tag to a test file in a known folder', () => {
    const result = generateAnnotation('src/utils/format.test.js', '')

    expect(result).toMatchObject({ purpose: 'Pure utility function', tags: ['utility', 'test'] })
  })

  it('uses Unit test as purpose for a test file outside known folders', () => {
    const result = generateAnnotation('format.test.js', '')

    expect(result).toMatchObject({ purpose: 'Unit test', tags: ['test'] })
  })

  it('falls back to a class name when nothing is exported', () => {
    const result = generateAnnotation('lib/x.js', 'class Foo {}')

    expect(result).toMatchObject({ purpose: 'Foo', tags: [], confidence: 'medium' })
  })

  it('keeps only project-internal imports and requires as relations', () => {
    const content = [
      "import a from './a'; import b from 'vue'",
      "import c from '@/c'",
      "const d = require('../d')",
      "const e = require('express')",
      "import f from '@sa/f'",
    ].join('\n')

    expect(generateAnnotation('x.js', content).relations).toBe('./a,@/c,@sa/f,../d')
  })

  it.each([
    [null, null],
    [undefined, undefined],
    ['', ''],
  ])('returns an empty low-confidence result for %j', (filePath, content) => {
    expect(generateAnnotation(filePath, content)).toEqual({
      purpose: '',
      relations: '',
      tags: [],
      engine: 'rule-based',
      confidence: 'low',
    })
  })
})
