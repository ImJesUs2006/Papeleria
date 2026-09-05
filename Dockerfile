FROM node:20-alpine

WORKDIR /app

# Install dependencies for xlsx (canvas) build
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/

RUN npm install

COPY . .

EXPOSE 3000 5432

CMD ["npm", "run", "dev"]
