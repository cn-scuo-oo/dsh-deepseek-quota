# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与
[Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-08-15

首个开源发布（v1.0.0 标签）。

### 新增

- **DeepSeek 额度卡片**（侧边栏底部「设置」上方）：
  - 官方 `GET /user/balance` 实时余额（总余额 / 充值构成 / 赠送余额 / 期间已用 / 更新时间）；
  - 每 60 秒自动刷新 + 手动刷新；刷新失败保留旧值（stale-while-error）；
  - 低余额警示（≤0 主数字变红，收起态显示 `!`）；
  - 宽/窄自适应：展开完整卡片、收起 32px 圆形按钮（点击展开侧边栏）。
- **充值面板**（卡片内「充值」入口，`shell.overlay` 居中模态）：
  - 金额档位与支付方式与 DeepSeek 官网一致（¥10/20/50/100/300/500/自定义；
    支付宝/微信/银行卡；美元账户自动切换 $ 档位）；
  - 官方充值入口二维码（`https://platform.deepseek.com/top_up`）供扫码支付；
  - 「在浏览器中打开官方充值页」直达本人账号充值端口。
- **架构与安全**：Host 半经 DSH 凭据服务解析 `DEEPSEEK_API_KEY`（Key 不出 Host 进程），
  同源只读路由 `/dsh-quota/balance` 交付归一化数据；15s 请求超时与统一错误信封
  （MISSING_CREDENTIAL / TIMEOUT / NETWORK / API_ERROR / BAD_RESPONSE）。
- **项目化**：一键安装脚本 `install.sh`（检测 DSH profile 与 Node 版本、幂等改写 profile
  package.json、符号链接、卸载支持）；README / LICENSE (MIT) / CONTRIBUTING / SECURITY /
  CHANGELOG / Issue 模板 / PR 模板 / 冒烟测试 / 功能截图。

### 说明

- 本开源基线对应开发过程中的 1.0（额度显示）与 1.1（充值面板）功能合并；
- 内联二维码编码器改编自 [Project Nayuki 的 QR Code generator library](https://www.nayuki.io/page/qr-code-generator-library)（MIT）。
