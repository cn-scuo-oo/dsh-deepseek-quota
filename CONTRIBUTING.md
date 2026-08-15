# 贡献指南

感谢你愿意为 **dsh-deepseek-quota** 贡献！无论是修 Bug、加功能、补文档还是报 Issue，都欢迎。

## 行为准则

- 尊重他人，建设性沟通；
- 不引入明文密钥、不提交 `.env` 等敏感文件；
- 不引入任何绕过 DeepSeek 官方计费或爬取官方数据的逻辑。

## 开发流程

```bash
git clone https://github.com/cn-scuo-oo/dsh-deepseek-quota.git
cd dsh-deepseek-quota

# 语法检查 + 冒烟测试
node --check lib/index.js
node --check lib/client.js
node --test tests/smoke.test.mjs
```

## 提交规范

- 提交信息使用 Conventional Commits 风格：

  ```
  feat: 新增 …
  fix: 修复 …
  docs: 更新文档 …
  refactor: 重构 …
  test: 补充测试 …
  ```

- 一次提交只做一件事，保持可读；
- 不要在一次提交里混入无关改动。

## 提 PR 前检查

- [ ] 代码通过 `node --check` 与冒烟测试；
- [ ] 未引入明文 API Key / 密码；
- [ ] 未引入绕过官方计费逻辑；
- [ ] 新功能 / 行为变化已更新 README 或 CHANGELOG；
- [ ] 使用 PR 模板（`.github/PULL_REQUEST_TEMPLATE.md`）描述改动。

## 如何报告 Bug

使用 [Bug 反馈模板](.github/ISSUE_TEMPLATE/bug_report.yml)，提供：版本、运行环境、
复现步骤、预期/实际行为、日志（隐去密钥）。
