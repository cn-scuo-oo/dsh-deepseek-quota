/**
 * dsh-deepseek-quota — Host half.
 *
 * 以标准 Host 插件形态提供余额数据：
 *  1. 经 `ctx.credentials` 解析 `DEEPSEEK_API_KEY`（设置→模型 写入的同一凭据）；
 *  2. 用 Node 原生 `fetch` 请求 DeepSeek 官方余额接口（`${DEEPSEEK_BASE_URL:-https://api.deepseek.com}/user/balance`）；
 *  3. 把 snake_case 字符串金额归一化为数字，并附加取数时刻 `updatedAt`；
 *  4. 通过 `ctx.webServer` 注册同源只读路由 `GET /dsh-quota/balance`，供浏览器客户端（无 CORS、Key 不落浏览器）取数。
 *
 * 返回结构（纯 JSON）：
 *  成功: { ok: true,  data: { isAvailable, currency, totalBalance, grantedBalance, toppedUpBalance, updatedAt } }
 *  失败: { ok: false, code, message }
 */
const PUBLIC_BASE_URL = 'https://api.deepseek.com'
const BASE_URL_ENV = 'DEEPSEEK_BASE_URL'
const CREDENTIAL_REF = 'DEEPSEEK_API_KEY'
const ROUTE_PATH = '/dsh-quota/balance'
const FETCH_TIMEOUT_MS = 15000

export const name = 'dsh-deepseek-quota'
export const inject = ['webServer']

function toNum(v) {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function json(res, payload, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end('method not allowed')
        return
      }

      // 1. 解析 API Key（可选服务，按每次操作解析）
      const credentials = ctx.get('credentials')
      let key
      if (credentials !== undefined) {
        try {
          const hit = await credentials.resolve(CREDENTIAL_REF)
          key = hit ? hit.value : undefined
        } catch (err) {
          return json(res, { ok: false, code: 'CREDENTIAL_ERROR', message: '读取 DEEPSEEK_API_KEY 失败: ' + String((err && err.message) || err) })
        }
      }
      if (!key) {
        return json(res, { ok: false, code: 'MISSING_CREDENTIAL', message: '未配置 DEEPSEEK_API_KEY，请在 设置 → 模型 中填写' })
      }

      // 2. 调用官方余额接口（超时 15s）
      const baseURL = process.env[BASE_URL_ENV] || PUBLIC_BASE_URL
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const resp = await fetch(`${baseURL}/user/balance`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        })
        clearTimeout(timer)
        const text = await resp.text()
        let parsed = null
        try { parsed = JSON.parse(text) } catch (err) { parsed = null }

        // DeepSeek 错误信封: { error: { message, type, code } }
        if (parsed && parsed.error && parsed.error.message) {
          return json(res, {
            ok: false,
            code: String(parsed.error.code || parsed.error.type || 'API_ERROR'),
            message: String(parsed.error.message),
          })
        }
        if (!resp.ok || parsed === null || !Array.isArray(parsed.balance_infos)) {
          return json(res, { ok: false, code: 'BAD_RESPONSE', message: `余额接口返回非 JSON (HTTP ${resp.status}): ${String(text).slice(0, 160)}` })
        }
        const info = parsed.balance_infos[0]
        if (!info || typeof info.total_balance !== 'string') {
          return json(res, { ok: false, code: 'BAD_RESPONSE', message: '余额响应缺少 balance_infos 字段' })
        }

        // 3. 归一化返回
        return json(res, {
          ok: true,
          data: {
            isAvailable: parsed.is_available !== false,
            currency: info.currency || 'CNY',
            totalBalance: toNum(info.total_balance),
            grantedBalance: toNum(info.granted_balance),
            toppedUpBalance: toNum(info.topped_up_balance),
            updatedAt: new Date().toISOString(),
          },
        })
      } catch (err) {
        clearTimeout(timer)
        const aborted = err && err.name === 'AbortError'
        return json(res, {
          ok: false,
          code: aborted ? 'TIMEOUT' : 'NETWORK',
          message: aborted ? '余额接口请求超时（15 秒无响应）' : String((err && err.message) || err),
        })
      }
    },
  }), 'dsh-quota: balance route')
}
