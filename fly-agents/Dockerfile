FROM node:20-alpine

WORKDIR /app

# Copy agent files
COPY agents/ ./agents/
COPY package*.json ./

# Install only production deps
RUN npm install --omit=dev

# Run all agents
CMD ["sh", "-c", "node agents/gatherer.js & node agents/warrior.js & node agents/builder.js & wait"]
