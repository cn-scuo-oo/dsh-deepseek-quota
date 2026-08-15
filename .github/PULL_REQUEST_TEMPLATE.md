## 变更描述

<!-- 简述本次改动解决了什么问题、改了什么 -->

- [ ] 我的改动是必要且自包含的

## 关联 Issue

<!-- 如有，填写关联的 issue 编号，如 #12 -->

Closes #

## 改动范围

<!-- 勾选实际改动的模块 -->

- [ ] lib/index.js（Host 半：余额接口 / 凭据 / 路由）
- [ ] lib/client.js（Client 半：卡片 / 充值面板 / 二维码）
- [ ] package.json / cordis.patch.yml（插件元数据与补丁）
- [ ] install.sh / scripts/（安装脚本）
- [ ] docs / README / 模板

## 测试

- [ ] `node --check` 语法检查通过（lib/index.js、lib/client.js）
- [ ] `node --test tests/smoke.test.mjs` 冒烟测试通过
- [ ] 已手工验证关键路径（余额展示 / 充值面板 / 刷新）

## 安全检查

- [ ] 未在代码 / 文档 / 提交中引入任何明文 API Key 或密码
- [ ] 未引入绕过 DeepSeek 官方计费或爬取官方数据的逻辑
- [ ] 未引入新的运行时依赖（如确需，已在 package.json 声明）

## 备注

<!-- 其它需要 reviewers 关注的点 -->
