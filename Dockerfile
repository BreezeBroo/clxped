FROM node:22-alpine

WORKDIR /app
COPY server.js index.html app.js styles.css favicon.svg ./

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
