#!/usr/bin/env node
/**
 * e2e-install-test.mjs — 端到端验证「别人从零安装插件能否使用」
 *
 * 模拟真实用户场景：
 *   1. 全新 DSH_HOME（干净 profile，无插件）
 *   2. 执行 install.sh（等价于 git clone 后 bash install.sh）
 *   3. 从安装产物加载 Host 半 (lib/index.js)
 *   4. 模拟 DSH 凭据服务返回 API Key
 *   5. 请求插件注册的 /dsh-quota/balance 路由 → 应返回归一化余额
 *   6. 同时验证错误路径（无凭据 / 上游错误 / 超时）
 *
 * 运行：node e2e-install-test.mjs   （依赖本地 mock 上游 :8899）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const MOCK_BASE = 'http://127.0.0.1:8899'

// ---------- 1. 干净环境安装 ----------
function cleanInstall() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e2e-home-'))
  // 构造干净的 profile（模拟新用户首次运行 DSH 后）
  const profileDir = path.join(home, 'profiles', 'web')
  fs.mkdirSync(profileDir, { recursive: true })
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: { 'dsh-find-plugin': '^0.3.6' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-find-plugin'] } },
  }, null, 2) + '\n')

  // 执行 install.sh（模拟用户：git clone → bash install.sh）
  const out = execSync(`DSH_HOME=${home} bash install.sh`, {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, DSH_HOME: home },
  })
  // 断言安装输出关键步骤
  assert.match(out, /插件文件已复制/)
  assert.match(out, /dependencies\.dsh-deepseek-quota/)
  assert.match(out, /bundles 追加 dsh-deepseek-quota/)
  assert.match(out, /符号链接/)

  // 断言安装产物
  const pkg = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'))
  assert.equal(pkg.dependencies['dsh-deepseek-quota'], 'file:./vendor/dsh-deepseek-quota')
  assert.ok(pkg.dsh.profile.bundles.includes('dsh-deepseek-quota'))
  const link = path.join(profileDir, 'node_modules', 'dsh-deepseek-quota')
  assert.ok(fs.lstatSync(link).isSymbolicLink())
  const vendorFiles = fs.readdirSync(path.join(profileDir, 'vendor', 'dsh-deepseek-quota', 'lib'))
  assert.ok(vendorFiles.includes('index.js') && vendorFiles.includes('client.js'))

  return { home, profileDir }
}

// ---------- 2. 从安装产物加载 Host 半并驱动 ----------
function makeHostHarness(credentialsImpl) {
  const routes = []
  const effects = []
  const ctx = {
    webServer: { register(route) { routes.push(route) } },
    get(name) {
      if (name === 'credentials') return credentialsImpl()
      if (name === 'webServer') return this.webServer
      return undefined
    },
    effect(fn) { effects.push(fn) },
  }
  return {
    ctx,
    routes,
    flush() { for (const fn of effects) fn(); effects.length = 0 },
  }
}

function callRoute(handler, method = 'GET') {
  let sent = null
  const res = {
    writeHead(status, headers) { sent = { status, headers } },
    end(body) { sent.body = JSON.parse(body) },
  }
  return handler({ method }, res).then(() => sent)
}

test('E2E-1: 干净环境一键安装成功', () => {
  const { profileDir } = cleanInstall()
  console.log(`  ✓ 安装产物验证通过: ${profileDir}`)
})

test('E2E-2: 安装后的插件 Host 取数 → 归一化余额（指向 mock 上游）', async () => {
  const { profileDir } = cleanInstall()
  const { ctx, routes, flush } = makeHostHarness(() => ({
    async resolve(ref) { return { value: 'sk-e2e-valid-key' } },
  }))
  const mod = await import(path.join(profileDir, 'vendor', 'dsh-deepseek-quota', 'lib/index.js'))
  mod.apply(ctx)
  flush()

  // 让插件指向 mock 上游
  const prev = process.env.DEEPSEEK_BASE_URL
  process.env.DEEPSEEK_BASE_URL = MOCK_BASE
  try {
    const sent = await callRoute(routes[0].handler)
    assert.equal(sent.status, 200)
    assert.equal(sent.body.ok, true)
    assert.equal(sent.body.data.totalBalance, 14.92)
    assert.equal(sent.body.data.currency, 'CNY')
    assert.equal(sent.body.data.toppedUpBalance, 14.92)
    assert.equal(sent.body.data.grantedBalance, 0)
    assert.ok(sent.body.data.updatedAt)
    console.log('  ✓ 余额接口端到端返回正确:', JSON.stringify(sent.body.data))
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_BASE_URL
    else process.env.DEEPSEEK_BASE_URL = prev
  }
})

test('E2E-3: 未配置 Key → MISSING_CREDENTIAL', async () => {
  const { profileDir } = cleanInstall()
  const { ctx, routes, flush } = makeHostHarness(() => ({
    async resolve() { return undefined }, // 无凭据
  }))
  const mod = await import(path.join(profileDir, 'vendor', 'dsh-deepseek-quota', 'lib/index.js'))
  mod.apply(ctx)
  flush()
  const sent = await callRoute(routes[0].handler)
  assert.equal(sent.status, 200)
  assert.equal(sent.body.ok, false)
  assert.equal(sent.body.code, 'MISSING_CREDENTIAL')
  console.log('  ✓ 未配置 Key 正确提示:', sent.body.code)
})

test('E2E-4: 上游密钥无效 → 错误信封透传（真实官方行为）', async () => {
  const { profileDir } = cleanInstall()
  const { ctx, routes, flush } = makeHostHarness(() => ({
    async resolve() { return { value: 'sk-invalid-xxxxxxxx' } },
  }))
  const mod = await import(path.join(profileDir, 'vendor', 'dsh-deepseek-quota', 'lib/index.js'))
  mod.apply(ctx)
  flush()

  const prev = process.env.DEEPSEEK_BASE_URL
  process.env.DEEPSEEK_BASE_URL = MOCK_BASE
  // 改 mock：返回官方同款错误信封（与真实接口一致）
  const originalListener = null
  try {
    // 直接构造 401 场景：临时把 mock 换成返回错误——这里改用直连一个不存在的 key 对 mock 无效，
    // 因此手工注入 fetch mock 验证错误透传逻辑
    const realFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: false, status: 401,
      text: async () => JSON.stringify({
        error: { message: 'Authentication Fails, Your api key: ****58f7 is invalid', type: 'authentication_error', code: 'invalid_request_error' },
      }),
    })
    try {
      const sent = await callRoute(routes[0].handler)
      assert.equal(sent.body.ok, false)
      assert.equal(sent.body.code, 'invalid_request_error')
      assert.match(sent.body.message, /invalid/)
      console.log('  ✓ 无效密钥错误信封透传:', sent.body.code, '-', sent.body.message.slice(0, 40) + '…')
    } finally {
      globalThis.fetch = realFetch
    }
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_BASE_URL
    else process.env.DEEPSEEK_BASE_URL = prev
  }
})

test('E2E-5: 上游超时 → TIMEOUT 错误信封', async () => {
  const { profileDir } = cleanInstall()
  const { ctx, routes, flush } = makeHostHarness(() => ({
    async resolve() { return { value: 'sk-e2e-key' } },
  }))
  const mod = await import(path.join(profileDir, 'vendor', 'dsh-deepseek-quota', 'lib/index.js'))
  mod.apply(ctx)
  flush()

  const realFetch = globalThis.fetch
  globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const err = new Error('The operation was aborted.')
      err.name = 'AbortError'
      reject(err)
    })
  })
  try {
    const sent = await callRoute(routes[0].handler)
    assert.equal(sent.body.ok, false)
    assert.equal(sent.body.code, 'TIMEOUT')
    console.log('  ✓ 上游超时正确降级:', sent.body.code)
  } finally {
    globalThis.fetch = realFetch
  }
})
