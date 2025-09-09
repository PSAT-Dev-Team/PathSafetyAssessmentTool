# —— Build stage (Use Node to build static files) ——
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend /app
RUN npm run build

# —— Runtime stage (Nginx serves static site and reverse proxies to backend) ——
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Nginx site configuration (see next file)
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
