// Mock DeepSeek 官方余额接口（模拟 /user/balance 与 /chat/completions）
import http from 'node:http'
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url === '/user/balance') {
    res.end(JSON.stringify({
      is_available: true,
      balance_infos: [{
        currency: 'CNY',
        total_balance: '14.92',
        granted_balance: '0.00',
        topped_up_balance: '14.92'
      }]
    }))
  } else if (req.url === '/chat/completions') {
    res.end(JSON.stringify({ choices: [{ message: { content: 'mock reply' } }] }))
  } else {
    res.statusCode = 404
    res.end(JSON.stringify({ error: { message: 'not found' } }))
  }
})
server.listen(8899, () => console.log('mock upstream on :8899'))
