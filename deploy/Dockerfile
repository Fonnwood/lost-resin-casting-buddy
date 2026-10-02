# Serve Casting Buddy as static files. Build from the repo root:
#   docker build -f deploy/Dockerfile -t casting-buddy .
#   docker run -p 8080:80 casting-buddy
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html config.js sw.js manifest.webmanifest /usr/share/nginx/html/
COPY js /usr/share/nginx/html/js
COPY css /usr/share/nginx/html/css
COPY icons /usr/share/nginx/html/icons
COPY profiles /usr/share/nginx/html/profiles
EXPOSE 80
