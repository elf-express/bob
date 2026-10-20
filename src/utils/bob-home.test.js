import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { copyLegacyData, resolveBobHome } from './bob-home.js'

const DB = path.join('data', 'bob-tools.sqlite')

describe('resolveBobHome', () => {
  it('沒有 BOB_HOME 時用 ~/.bob', () => {
    expect(resolveBobHome({}, '/home/u')).toBe(path.join('/home/u', '.bob'))
  })

  it('BOB_HOME 只有空白時視為沒設', () => {
    expect(resolveBobHome({ BOB_HOME: '  ' }, '/home/u')).toBe(path.join('/home/u', '.bob'))
  })

  it('BOB_HOME 有值時用它，相對路徑以 CWD 解析', () => {
    const abs = path.resolve('/srv/bob-data')
    expect(resolveBobHome({ BOB_HOME: abs }, '/home/u')).toBe(abs)
    expect(resolveBobHome({ BOB_HOME: 'rel/bob' }, '/home/u')).toBe(path.resolve('rel/bob'))
  })
})

describe('copyLegacyData', () => {
  let tmp
  let legacyRoot
  let bobHome

  const write = (root, rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-home-'))
    legacyRoot = path.join(tmp, 'pkg')
    bobHome = path.join(tmp, 'home', '.bob')
  })

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('新位置沒有 DB 時複製 data/ 與 log/，舊的保留', () => {
    write(legacyRoot, DB, 'old-db')
    write(legacyRoot, path.join('log', 'a.log'), 'old-log')
    write(legacyRoot, path.join('log', 'config-backups', 'c.json'), '{}')

    expect(copyLegacyData({ legacyRoot, bobHome })).toBe(true)

    expect(read(bobHome, DB)).toBe('old-db')
    expect(read(bobHome, path.join('log', 'a.log'))).toBe('old-log')
    expect(read(bobHome, path.join('log', 'config-backups', 'c.json'))).toBe('{}')
    expect(read(legacyRoot, DB)).toBe('old-db')
  })

  it('新位置已有 DB 時不動作', () => {
    write(legacyRoot, DB, 'old-db')
    write(bobHome, DB, 'new-db')

    expect(copyLegacyData({ legacyRoot, bobHome })).toBe(false)
    expect(read(bobHome, DB)).toBe('new-db')
  })

  it('新位置已有 log 檔時不覆寫', () => {
    write(legacyRoot, DB, 'old-db')
    write(legacyRoot, path.join('log', 'a.log'), 'old-log')
    write(bobHome, path.join('log', 'a.log'), 'new-log')

    expect(copyLegacyData({ legacyRoot, bobHome })).toBe(true)
    expect(read(bobHome, path.join('log', 'a.log'))).toBe('new-log')
  })

  it('舊位置沒有 DB 時不動作也不建目錄', () => {
    write(legacyRoot, path.join('log', 'a.log'), 'old-log')

    expect(copyLegacyData({ legacyRoot, bobHome })).toBe(false)
    expect(fs.existsSync(bobHome)).toBe(false)
  })

  it('BOB_HOME 指向舊位置本身時不動作', () => {
    write(legacyRoot, DB, 'old-db')

    expect(copyLegacyData({ legacyRoot, bobHome: legacyRoot })).toBe(false)
  })

  it('新位置的 data/ 已有其他檔案但沒有 DB 時，不刪、丟錯', () => {
    write(legacyRoot, DB, 'old-db')
    write(bobHome, path.join('data', 'notes.txt'), 'keep me')

    expect(() => copyLegacyData({ legacyRoot, bobHome })).toThrow(/data/)

    expect(read(bobHome, path.join('data', 'notes.txt'))).toBe('keep me')
    expect(fs.existsSync(path.join(bobHome, 'data.copying'))).toBe(false)
  })

  it('上次複製中斷留下 data.copying/ 時，刪掉重來', () => {
    write(legacyRoot, DB, 'old-db')
    write(bobHome, path.join('data.copying', 'bob-tools.sqlite'), 'half')

    expect(copyLegacyData({ legacyRoot, bobHome })).toBe(true)

    expect(read(bobHome, DB)).toBe('old-db')
    expect(fs.existsSync(path.join(bobHome, 'data.copying'))).toBe(false)
  })

  it('新位置已有 DB 時只清掉殘留的 data.copying/', () => {
    write(legacyRoot, DB, 'old-db')
    write(bobHome, DB, 'new-db')
    write(bobHome, path.join('data.copying', 'bob-tools.sqlite'), 'half')

    expect(copyLegacyData({ legacyRoot, bobHome })).toBe(false)

    expect(read(bobHome, DB)).toBe('new-db')
    expect(fs.existsSync(path.join(bobHome, 'data.copying'))).toBe(false)
  })
})
