FROM node:20-alpine AS build_prod
WORKDIR /app
COPY prod/package.json prod/package-lock.json ./
RUN npm ci
COPY prod .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build_prod /app/dist /usr/share/nginx/html
COPY deploy-client/web/default.conf.template /etc/nginx/templates/default.conf.template

