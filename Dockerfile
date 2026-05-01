FROM node:18-slim

# Install Chromium and OS-level dependencies
# This is crucial for puppeteer & whatsapp-web.js to work in containerized environments like Render
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer environment variables to use the system Chrome we just installed
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

# Copy package descriptors and install all dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm install

# Copy the rest of the app source code
COPY . .

# Build the React frontend and Node backend
RUN npm run build

# Expose port and assign standard env vars
EXPOSE 3000
ENV PORT=3000

# Start the full-stack server
CMD ["npm", "start"]
