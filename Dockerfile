# AirPubre - Development & Preview
FROM node:20-alpine

WORKDIR /app

# 依存関係インストール
COPY package.json ./
RUN npm install

# ソースコードをコピー
COPY . .

# 開発サーバーポート
EXPOSE 5173

# デフォルトは開発モード（ローカルプレビュー用）
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
