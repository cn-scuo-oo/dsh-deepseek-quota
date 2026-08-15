#!/usr/bin/env node
/**
 * patch-profile.mjs — 把 dsh-deepseek-quota 接入 DeepSeek Harness web profile。
 *
 * 等价于手工步骤（见 README「手动安装」）：
 *   1. dependencies 加  "dsh-deepseek-quota": "file:./vendor/dsh-deepseek-quota"
 *   2. dsh.profile.bundles 追加 "dsh-deepseek-quota"
 *   3. node_modules/dsh-deepseek-quota → vendor/dsh-deepseek-quota 符号链接
 *
 * 用 Node 而非 sed 改写 JSON，保证格式安全（保留缩进与键序）。
 * 幂等：重复执行不会产生重复条目。
 *
 * 用法:
 *   patch-profile.mjs --profile <path> --add <name> --vendor-dir <abs>
 *   patch-profile.mjs --profile <path> --remove <name>
 */
import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const out = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--profile') out.profile = argv[++i]
    else if (a === '--add') out.add = argv[++i]
    else if (a === '--remove') out.remove = argv[++i]
    else if (a === '--vendor-dir') out.vendorDir = argv[++i]
    else { console.error(`未知参数: ${a}`); process.exit(2) }
  }
  if (!out.profile) { console.error('缺少 --profile'); process.exit(2) }
  return out
}

const args = parseArgs(process.argv)
const profilePath = args.profile
if (!fs.existsSync(profilePath)) {
  console.error(`profile package.json 不存在: ${profilePath}`)
  process.exit(1)
}

const raw = fs.readFileSync(profilePath, 'utf8')
const pkg = JSON.parse(raw)
const name = args.add || args.remove
if (!name) { console.error('需要 --add 或 --remove'); process.exit(2) }

if (args.remove) {
  // 移除 dependencies 条目
  if (pkg.dependencies && pkg.dependencies[name] !== undefined) {
    delete pkg.dependencies[name]
    console.log(`- 已移除 dependencies.${name}`)
  }
  // 移除 bundles 条目
  const bundles = pkg.dsh?.profile?.bundles
  if (Array.isArray(bundles)) {
    const i = bundles.indexOf(name)
    if (i >= 0) { bundles.splice(i, 1); console.log(`- 已移除 bundles 中的 ${name}`) }
  }
  // 移除符号链接
  const nodeModulesDir = path.join(path.dirname(profilePath), 'node_modules')
  const link = path.join(nodeModulesDir, name)
  try { fs.unlinkSync(link); console.log(`- 已删除符号链接 ${link}`) } catch {}
} else if (args.add) {
  pkg.dependencies = pkg.dependencies || {}
  if (pkg.dependencies[name] === undefined) {
    pkg.dependencies[name] = `file:./vendor/${name}`
    console.log(`+ dependencies.${name} = file:./vendor/${name}`)
  }
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || []
  if (!pkg.dsh.profile.bundles.includes(name)) {
    pkg.dsh.profile.bundles.push(name)
    console.log(`+ bundles 追加 ${name}`)
  }
  // 符号链接：node_modules/dsh-deepseek-quota → vendor/dsh-deepseek-quota
  const nodeModulesDir = path.join(path.dirname(profilePath), 'node_modules')
  fs.mkdirSync(nodeModulesDir, { recursive: true })
  const link = path.join(nodeModulesDir, name)
  const vendorDir = args.vendorDir || path.join(path.dirname(profilePath), 'vendor', name)
  try {
    const existing = fs.lstatSync(link)
    if (existing.isSymbolicLink()) fs.unlinkSync(link)
    else if (existing.isDirectory()) fs.rmSync(link, { recursive: true, force: true })
  } catch {}
  fs.symlinkSync(vendorDir, link, 'dir')
  console.log(`+ 符号链接 ${link} → ${vendorDir}`)
}

// 保留原有缩进风格（检测 2 空格还是 4 空格）
const indent = /^ {4}/m.test(raw) ? 4 : 2
fs.writeFileSync(profilePath, JSON.stringify(pkg, null, indent) + '\n')
console.log(`✓ 已写回 ${profilePath}`)
