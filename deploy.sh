#!/usr/bin/env bash
# deploy.sh — AirPubre ビルド＆ローカルデプロイ
#
# 使い方:
#   ./deploy.sh              # ビルド＆デプロイ（デフォルト: ../shunature-one/admin/）
#   ./deploy.sh --skip-build # ビルド済みの dist をそのままデプロイ
#   DEPLOY_TARGET=~/www/admin/ ./deploy.sh  # デプロイ先を変更
#
set -euo pipefail

DEPLOY_TARGET="${DEPLOY_TARGET:-../shunature-one/admin/}"
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build]"
      echo "  DEPLOY_TARGET=path ./deploy.sh  to override destination"
      exit 0 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ビルド
if [ "$SKIP_BUILD" = false ]; then
  echo "==> Building..."
  npm run build
fi

# dist/admin が存在するか確認
if [ ! -d "dist/admin" ]; then
  echo "Error: dist/admin not found. Run build first." >&2
  exit 1
fi

# デプロイ先の親ディレクトリ確認
PARENT_DIR="$(dirname "${DEPLOY_TARGET%/}")"
if [ ! -d "$PARENT_DIR" ]; then
  echo "Error: Parent directory $PARENT_DIR does not exist." >&2
  exit 1
fi

# rsync で差分デプロイ
echo "==> Deploying to ${DEPLOY_TARGET}"
rsync -av --delete --checksum dist/admin/ "$DEPLOY_TARGET"

echo "==> Done!"
