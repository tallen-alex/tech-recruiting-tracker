FROM apify/actor-node-playwright-chrome:24
COPY --chown=myuser:myuser package*.json ./
RUN npm --quiet set progress=false && npm ci --include=dev --no-audit
COPY --chown=myuser:myuser . ./
RUN npm run build && npm prune --omit=dev
CMD ["npm", "start"]
