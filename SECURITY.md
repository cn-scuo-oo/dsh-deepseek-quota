# 安全政策

## 支持的版本

| 版本 | 受支持 |
|---|---|
| 1.x | ✅ 持续维护 |

## 报告漏洞

请**不要**在公开 Issue 中提交安全漏洞。请发送邮件或创建 Private vulnerability report：

- GitHub：仓库页 → **Security → Report a vulnerability**（推荐，GitHub 原生 Private 通道）；
- 邮件：cn-scuo-oo@users.noreply.github.com（如用邮件，请在标题注明 `[SECURITY]`）。

我们会在收到后尽快回复并协调修复。

## 安全设计说明

- **API Key 不出 Host**：插件经 DSH 凭据服务（`~/.dsh/.credentials.yaml`）读取
  `DEEPSEEK_API_KEY`，只在 Host 进程内使用；浏览器侧经同源路由取归一化数据，
  Key 不进入前端代码、命令字符串或任何日志；
- **只读接口**：`GET /dsh-quota/balance` 为只读路由，仅返回余额数据；
- **官方数据源**：仅对接 DeepSeek 官方 `GET /user/balance` 与官方充值页，
  无爬虫、无绕过官方计费逻辑；
- **超时与错误隔离**：请求带 15s 超时与统一错误信封，异常不外泄内部细节。

## 报告时应包含

- 影响版本、运行环境（OS / Node / DSH 版本）；
- 复现步骤与最小示例；
- 影响评估（是否涉及密钥泄露等）。
