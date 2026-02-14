FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --only=production
RUN cd frontend && npm ci

# Copy source
COPY . .

# Build React app
RUN cd frontend && npm run build

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "server.js"]
