FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json ./
ENV PORT=2567
USER node
EXPOSE 2567
CMD ["npx", "tsx", "src/index.ts"]
