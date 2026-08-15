#!/usr/bin/env bash
# ============================================================
#  dsh-deepseek-quota — 一键安装脚本
#  适用平台：Windows（Git Bash / WSL）/ macOS / Linux
#  目标：把 DeepSeek 额度卡片 + 充值面板接入 DeepSeek Harness
#        Web profile（与手动放入 vendor/ 完全等价，自动完成：
#        复制文件 → 更新 profile package.json → 建立符号链接）
#  用法：
#     bash install.sh                  # 安装到默认 profile
#     bash install.sh --profile web    # 指定 profile 名
#     bash install.sh --uninstall      # 卸载
#     bash install.sh --help           # 查看全部参数
# ============================================================
set -euo pipefail

C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_CYN=$'\033[36m'; C_END=$'\033[0m'
info() { printf '%s[INFO]%s %s\n'  "$C_CYN" "$C_END" "$*"; }
ok()   { printf '%s[ OK ]%s %s\n'  "$C_GRN" "$C_END" "$*"; }
warn() { printf '%s[WARN]%s %s\n'  "$C_YEL" "$C_END" "$*"; }
die()  { printf '%s[ERROR]%s %s\n' "$C_RED" "$C_END" "$*" >&2; exit 1; }

# ---------- 参数 ----------
PROFILE="web"
UNINSTALL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:?--profile 需要 profile 名}"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    --help|-h) sed -n '1,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="dsh-deepseek-quota"
DSH_PROFILES_DIR="${DSH_HOME:-$HOME/.dsh}/profiles"
PROFILE_DIR="$DSH_PROFILES_DIR/$PROFILE"
VENDOR_DIR="$PROFILE_DIR/vendor/$PLUGIN_NAME"

echo
info "dsh-deepseek-quota 安装脚本 (profile=$PROFILE)"

# ---------- 1. 环境检测 ----------
if [[ ! -d "$DSH_PROFILES_DIR" ]]; then
  cat >&2 <<EOF
[ERROR] 未检测到 DeepSeek Harness profile 目录: $DSH_PROFILES_DIR
修复指引：
  - 请确认本机已安装并运行过 DeepSeek Harness（首次运行会生成 $DSH_HOME/.dsh 目录）
  - 若自定义了数据目录，请先设置环境变量后重试:
      DSH_HOME=/你的/数据目录 bash install.sh
EOF
  exit 1
fi
if [[ ! -f "$PROFILE_DIR/package.json" ]]; then
  cat >&2 <<EOF
[ERROR] 未找到 profile 的 package.json: $PROFILE_DIR/package.json
修复指引：
  - 当前 profile 名为 "$PROFILE"，可用以下命令查看已有哪些 profile:
      ls "$DSH_PROFILES_DIR"
  - 若名称不同，请用 --profile 指定，例如: bash install.sh --profile myprofile
EOF
  exit 1
fi

# Node 检测（用于安全地改写 profile package.json，避免 sed 破坏 JSON）
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  # 回退：DSH 应用内嵌 Node（Electron）与工作区 .tools
  for cand in \
    "/Applications/DeepSeek Harness.app/Contents/Resources/host/bin/node" \
    "$SCRIPT_DIR/../.tools/"*/bin/node \
    "$SCRIPT_DIR/.tools/"*/bin/node; do
    for f in $cand; do
      [[ -x "$f" ]] && NODE_BIN="$f" && break
    done
    [[ -n "$NODE_BIN" ]] && break
  done
fi
if [[ -z "$NODE_BIN" ]]; then
  cat >&2 <<EOF
[ERROR] 未检测到 Node.js。修复指引：
  - macOS:   brew install node
  - Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
  - Windows: 从 https://nodejs.org/ 下载 LTS（>= 18）安装
  安装完成后重新执行: bash install.sh
EOF
  exit 1
fi
NODE_VER="$("$NODE_BIN" --version 2>/dev/null | sed 's/^v//' || echo "?")"
if "$NODE_BIN" -e 'process.exit(process.versions.node.split(".")[0] >= 18 ? 0 : 1)'; then
  ok "Node $NODE_VER 满足要求（>= 18）"
else
  cat >&2 <<EOF
[ERROR] 当前 Node 版本 $NODE_VER 过旧，要求 Node >= 18。
修复指引：升级 Node（推荐 nvm: https://github.com/nvm-sh/nvm）
  nvm install 22 && nvm use 22
  安装完成后重新执行: bash install.sh
EOF
  exit 1
fi

# ---------- 2. 卸载 ----------
if [[ "$UNINSTALL" == "1" ]]; then
  if [[ -d "$VENDOR_DIR" ]]; then
    rm -rf "$VENDOR_DIR"
    ok "已删除插件目录 $VENDOR_DIR"
  else
    warn "插件目录不存在（可能已卸载）：$VENDOR_DIR"
  fi
  "$NODE_BIN" "$SCRIPT_DIR/scripts/patch-profile.mjs" --profile "$PROFILE_DIR/package.json" --remove "$PLUGIN_NAME"
  ok "已从 profile package.json 移除 bundles/dependencies 声明"
  echo "  提示: 请重启 DeepSeek Harness 使卸载生效。"
  exit 0
fi

# ---------- 3. 复制插件文件 ----------
mkdir -p "$VENDOR_DIR"
cp -R "$SCRIPT_DIR/lib" "$VENDOR_DIR/"
cp "$SCRIPT_DIR/package.json" "$VENDOR_DIR/"
cp "$SCRIPT_DIR/cordis.patch.yml" "$VENDOR_DIR/"
ok "插件文件已复制到 $VENDOR_DIR"

# ---------- 4. 更新 profile package.json（bundles + dependencies + 符号链接） ----------
"$NODE_BIN" "$SCRIPT_DIR/scripts/patch-profile.mjs" --profile "$PROFILE_DIR/package.json" --add "$PLUGIN_NAME" --vendor-dir "$VENDOR_DIR" || die "更新 profile package.json 失败"

ok "安装完成！请重启 DeepSeek Harness（或按 Cmd+R 刷新页面）后，在侧边栏底部「设置」上方即可看到 DeepSeek 额度卡片。"
echo
echo "  配置 API Key：应用内 设置 → 模型 → 填入 DEEPSEEK_API_KEY（与调用模型的 Key 同一把）"
echo "  卸载：        bash install.sh --uninstall"
echo "------------------------------------------------------------"
