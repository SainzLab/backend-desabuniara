# Ganti ke Node.js versi 20
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
