#!/usr/bin/env bash
# 装/更新「发布工作台」捆绑包(bundle)到 Forsion 家目录。
#   用法:sh install.sh [dev|prod]     缺省 dev(~/.forsion-dev);prod=~/.forsion
# 本仓即 bundle 本体:整目录拷到 <home>/plugins/wechat-publisher/ 一处即完成——
#   桌面识别 manifest.json(UI 插件)+ spaces/(内嵌 Space「发布台」);
#   skills/(wechat-publish)由引擎播种,右侧 chat 里的 Tangu 就懂台账格式与公众号约束。
set -euo pipefail
MODE="${1:-dev}"
case "$MODE" in
  dev)  HOME_DIR="$HOME/.forsion-dev" ;;
  prod) HOME_DIR="$HOME/.forsion" ;;
  *) echo "用法:sh install.sh [dev|prod]" >&2; exit 2 ;;
esac
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME_DIR/plugins/wechat-publisher"

# 不许从已安装目录内自更新:下面的 rm -rf 会先删掉复制源(自己),把插件卸成空壳
if [ "$HERE" = "$(cd "$DEST" 2>/dev/null && pwd || true)" ]; then
  echo "❌ 正在从已安装目录运行,请从源码仓的 forsion-plugin-publisher/ 目录执行 install.sh" >&2
  exit 2
fi

mkdir -p "$HOME_DIR/plugins"
rm -rf "$DEST"
cp -R "$HERE" "$DEST"

echo "✅ 已安装 bundle → $DEST"
echo "重开 Forsion(dev:重启 desktop)后:命令面板「发布工作台:打开」,或工作台切到「发布台」Space。"
