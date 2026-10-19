import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { createRefsRouter } from './refs.js'

describe('GET /api/refs', () => {
  it('lists the reference tables in public/refs', async () => {
    const app = express()
    app.use('/api/refs', createRefsRouter())

    const res = await request(app).get('/api/refs')

    expect(res.body.items.map((i) => i.file).sort()).toEqual([
      'speckit-lifecycle.json',
      'superpowers-lifecycle.json',
    ])
    expect(res.body.items[0]).toEqual({
      id: expect.any(String),
      title: expect.any(String),
      file: expect.any(String),
    })
  })
})
