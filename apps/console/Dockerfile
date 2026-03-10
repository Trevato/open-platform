FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json bun.lock* package-lock.json* ./
RUN if [ -f bun.lock ]; then npm i -g bun && bun install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run build:ws

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install terminal tools (kubectl, k9s, helm via binary download; rest via apk)
RUN apk add --no-cache \
      curl zsh git jq yq ripgrep bat fzf neovim btop tree kustomize \
    && curl -sLo /usr/local/bin/kubectl \
      "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && chmod +x /usr/local/bin/kubectl \
    && K9S_VERSION=$(curl -sL https://api.github.com/repos/derailed/k9s/releases/latest | grep '"tag_name"' | sed 's/.*"v//' | sed 's/".*//' ) \
    && curl -sLo /tmp/k9s.tar.gz \
      "https://github.com/derailed/k9s/releases/download/v${K9S_VERSION}/k9s_Linux_amd64.tar.gz" \
    && tar -xzf /tmp/k9s.tar.gz -C /usr/local/bin k9s \
    && rm /tmp/k9s.tar.gz \
    && HELM_VERSION=$(curl -sL https://api.github.com/repos/helm/helm/releases/latest | grep '"tag_name"' | sed 's/.*"v//' | sed 's/".*//' ) \
    && curl -sLo /tmp/helm.tar.gz \
      "https://get.helm.sh/helm-v${HELM_VERSION}-linux-amd64.tar.gz" \
    && tar -xzf /tmp/helm.tar.gz -C /usr/local/bin --strip-components=1 linux-amd64/helm \
    && rm /tmp/helm.tar.gz \
    && curl -sS https://starship.rs/install.sh | sh -s -- --yes

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/ws-server.js ./ws-server.js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/node-pty ./node_modules/node-pty
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start.sh ./scripts/start.sh
COPY --from=builder --chown=nextjs:nodejs /app/scripts/.zshrc ./scripts/.zshrc
COPY --from=builder --chown=nextjs:nodejs /app/scripts/shell-init.sh ./scripts/shell-init.sh
RUN chmod +x scripts/start.sh
USER nextjs
EXPOSE 3000 3001
ENV PORT=3000
CMD ["sh", "scripts/start.sh"]
