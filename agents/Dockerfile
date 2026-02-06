FROM node:20-alpine

WORKDIR /app

# Copy agent scripts
COPY *.js ./

# Run 5 agents for a lively world
ENV API_URL=https://moltirealm.up.railway.app
CMD ["sh", "-c", "node gatherer.js & node gatherer.js & node warrior.js & node warrior.js & node builder.js & wait"]
