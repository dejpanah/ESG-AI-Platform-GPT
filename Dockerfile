# Multi-stage: build static SPA, serve with nginx
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
# package-lock may be absent; npm install still works
RUN npm install
COPY . .
# Build-time API URL (baked into the bundle). Override at build:
#   docker build --build-arg VITE_KNOWLEDGEOS_API_URL=http://localhost:8000 ...
ARG VITE_KNOWLEDGEOS_API_URL=
ENV VITE_KNOWLEDGEOS_API_URL=$VITE_KNOWLEDGEOS_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
