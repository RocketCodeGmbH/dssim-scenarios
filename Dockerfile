# Build stage
FROM node:18-slim AS builder
WORKDIR /app/dssim-scenarios
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm install

EXPOSE 9090
ENTRYPOINT ["sh"]

