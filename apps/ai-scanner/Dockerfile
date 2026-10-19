# Simple Dockerfile for the ai-scanner worker

FROM node:20-alpine
WORKDIR /app

# Install deps
COPY apps/ai-scanner/package.json ./
RUN npm install --production

# Copy built dist (assumes repo build step produces dist for the worker)
# You can adjust this to run tsc inside the container if preferred
COPY dist/libs/storage/scanner ./dist/scanner

ENV NODE_ENV=production

CMD ["node", "dist/scanner/worker.js"]
