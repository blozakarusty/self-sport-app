FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json .npmrc ./
RUN npx -y npm@11 ci
COPY . .
RUN DATABASE_URL=/tmp/build.db STRAVA_CLIENT_ID= STRAVA_CLIENT_SECRET= npm run build && npx -y npm@11 prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATABASE_URL=/app/data/self-sport.db PORT=3000
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
VOLUME /app/data
EXPOSE 3000
CMD ["node", "build"]
