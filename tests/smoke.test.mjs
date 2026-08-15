import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// 简单的 fake webServer：捕获注册的路由，便于驱动 Host 半的 handler
function makeHostHarness() {
  const routes = []
  const effects = []
  const ctx = {
    webServer: {
      register(route) { routes.push(route) },
    },
    get(name) {
      if (name === 'credentials') {
        return {
          async resolve(ref) {
            if (ref !== 'DEEPSEEK_API_KEY') throw new Error('unknown ref')
            return { value: 'sk-test-123' }
          },
        }
      }
      if (name === 'webServer') return this.webServer
      return undefined
    },
    effect(fn, label) { effects.push(fn) },
  }
  // Cordis 在 apply 之后执行 effect（延迟注册路由）
  function flush() {
    for (const fn of effects) fn()
    effects.length = 0
  }
  return { ctx, routes, flush }
}

// 模拟 fetch（指向 /user/balance）
function withFetch(mockImpl) {
  const original = globalThis.fetch
  globalThis.fetch = mockImpl
  return () => { globalThis.fetch = original }
}

test('Host 半：模块可加载，name/inject 正确', async () => {
  const mod = await import(path.join(ROOT, 'lib/index.js'))
  assert.equal(mod.name, 'dsh-deepseek-quota')
  assert.ok(mod.inject.includes('webServer'))
  assert.equal(typeof mod.apply, 'function')
})

test('Host 半：注册只读路由 GET /dsh-quota/balance', async () => {
  const { ctx, routes, flush } = makeHostHarness()
  const mod = await import(path.join(ROOT, 'lib/index.js'))
  mod.apply(ctx)
  flush()
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'exact')
  assert.equal(routes[0].path, '/dsh-quota/balance')
  assert.equal(typeof routes[0].handler, 'function')
})

test('Host 半：成功路径归一化官方余额响应', async () => {
  const { ctx, routes, flush } = makeHostHarness()
  const mod = await import(path.join(ROOT, 'lib/index.js'))
  mod.apply(ctx)
  flush()
  const restore = withFetch(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '14.92', granted_balance: '0.00', topped_up_balance: '14.92' }],
    }),
  }))
  try {
    let sent = null
    const res = { writeHead: (s, h) => { sent = { status: s, headers: h } }, end: (body) => { sent.body = JSON.parse(body) } }
    await routes[0].handler({ method: 'GET' }, res)
    assert.equal(sent.status, 200)
    assert.equal(sent.body.ok, true)
    assert.equal(sent.body.data.totalBalance, 14.92)
    assert.equal(sent.body.data.currency, 'CNY')
    assert.equal(sent.body.data.grantedBalance, 0)
    assert.ok(sent.body.data.updatedAt)
  } finally {
    restore()
  }
})

test('Host 半：上游错误信封透传', async () => {
  const { ctx, routes, flush } = makeHostHarness()
  const mod = await import(path.join(ROOT, 'lib/index.js'))
  mod.apply(ctx)
  flush()
  const restore = withFetch(async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { message: 'Authentication Fails', type: 'authentication_error', code: 'invalid_api_key' } }),
  }))
  try {
    let sent = null
    const res = { writeHead: (s, h) => { sent = { status: s, headers: h } }, end: (body) => { sent.body = JSON.parse(body) } }
    await routes[0].handler({ method: 'GET' }, res)
    assert.equal(sent.body.ok, false)
    assert.equal(sent.body.code, 'invalid_api_key')
  } finally {
    restore()
  }
})

test('Client 半：bundle 格式可解析，含充值常量与 QR 编码器', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8')
  // __ModuleLoader__ 格式声明
  assert.match(source, /window\.__ModuleLoader__\.load/)
  // 充值面板关键常量
  assert.match(source, /platform\.deepseek\.com\/top_up/)
  assert.match(source, /TIERS/)
  assert.match(source, /METHODS/)
  // 内联 QR 编码器存在
  assert.match(source, /qrEncode/)
  // 挂载点
  assert.match(source, /sidebar\.footer\.action/)
  assert.match(source, /shell\.overlay/)
})

test('package.json：版本/入口/补丁声明完整', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'dsh-deepseek-quota')
  assert.equal(pkg.main, 'lib/index.js')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.ok(pkg.dsh.bundle.patch)
  assert.ok(pkg.dsh.client.platform === 'web')
  assert.equal(pkg.license, 'MIT')
})
