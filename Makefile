.PHONY: deploy generate deploy-infra deploy-apps diff status lint teardown urls help test-smoke test-k8s test-e2e test-e2e-platform test-e2e-auth colima-start colima-stop colima-reset check-infra node-join node-remove node-status colima-agent complete-mac-join chart-deploy chart-upgrade chart-template chart-lint

deploy: ## Deploy everything via helmfile (legacy — see chart-deploy for Helm chart)
	./scripts/deploy.sh

generate: ## Generate config from open-platform.yaml (run before deploy if config changed)
	./scripts/generate-config.sh

chart-deploy: ## Deploy via Helm chart (installs Flux + platform chart)
	@if ! helm status flux2 -n flux-system >/dev/null 2>&1; then \
		echo "Installing Flux controllers..."; \
		helm repo add fluxcd-community https://fluxcd-community.github.io/helm-charts 2>/dev/null || true; \
		helm repo update fluxcd-community; \
		helm install flux2 fluxcd-community/flux2 -n flux-system --create-namespace --wait; \
	fi
	helm upgrade --install open-platform charts/open-platform \
		-f open-platform.yaml \
		-n open-platform --create-namespace --wait --timeout 15m
	@echo ""
	@echo "Platform chart installed. Flux will reconcile all services."
	@echo "Run 'make chart-status' to check progress."

chart-upgrade: ## Upgrade the platform Helm chart
	helm upgrade open-platform charts/open-platform \
		-f open-platform.yaml \
		-n open-platform --wait --timeout 15m

chart-template: ## Render chart templates to stdout (dry run)
	helm template open-platform charts/open-platform -f open-platform.yaml

chart-lint: ## Lint the Helm chart
	helm lint charts/open-platform -f open-platform.yaml

chart-status: ## Show Flux HelmRelease reconciliation status
	@kubectl get helmreleases -A 2>/dev/null || echo "(no HelmReleases found)"

deploy-infra: ## Deploy infrastructure only (traefik, cnpg, minio, forgejo)
	helmfile sync -l tier=infra

deploy-apps: ## Deploy apps only (headlamp, woodpecker, oauth2-proxy — skips infrastructure)
	helmfile sync -l tier=apps

check-infra: ## Validate external infrastructure components are present
	./scripts/check-infra.sh

diff: ## Preview changes without applying
	helmfile diff

status: ## Show release status
	helmfile status

lint: ## Validate all releases
	helmfile lint

teardown: ## Destroy all releases and clean up resources
	@echo "This will destroy ALL Open Platform resources."
	@read -p "Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	./scripts/teardown.sh

urls: ## Print service URLs
	$(eval DOMAIN := $(shell grep '^PLATFORM_DOMAIN=' .env 2>/dev/null | cut -d= -f2 || echo 'example.com'))
	@echo "Platform (*.$(DOMAIN)):"
	@echo "  Forgejo:    https://forgejo.$(DOMAIN)"
	@echo "  Woodpecker: https://ci.$(DOMAIN)"
	@echo "  Headlamp:   https://headlamp.$(DOMAIN)"
	@echo "  MinIO:      https://minio.$(DOMAIN)"
	@echo "  MinIO S3:   https://s3.$(DOMAIN)"
	@echo ""
	@echo "Apps:"
	@kubectl get ns -l open-platform.sh/tier=workload -o jsonpath='{range .items[*]}{.metadata.labels.open-platform\.sh/repo}{"\n"}{end}' 2>/dev/null | sort | while read -r app; do \
		[ -n "$$app" ] && echo "  $${app}: https://$${app}.$(DOMAIN)"; \
	done || echo "  (no apps deployed yet)"

test-smoke: ## Run smoke tests (curl-based, fast)
	./tests/smoke.sh

test-k8s: ## Run k8s health checks (kubectl-based)
	./tests/k8s-health.sh

test-e2e: ## Run all Playwright E2E tests
	cd tests/e2e && bun x playwright test

test-e2e-platform: ## Run platform E2E tests only
	cd tests/e2e && bun x playwright test platform/

test-e2e-auth: ## Run auth flow E2E tests only
	cd tests/e2e && bun x playwright test platform/*-auth*

colima-start: ## Start Colima k3s for local development
	./nix/scripts/colima-start.sh

colima-stop: ## Stop Colima
	colima stop op

colima-reset: ## Delete and recreate Colima (clean state)
	./nix/scripts/colima-start.sh --delete-first

node-join: ## Join agent node(s) to the cluster
	./scripts/node-join.sh $(NODE)

node-remove: ## Remove an agent node from the cluster
	./scripts/node-remove.sh $(NODE)

node-status: ## Show node status and workload distribution
	./scripts/node-status.sh

colima-agent: ## Start Colima as k3s agent (Mac test node)
	./nix/scripts/colima-agent.sh --ssh-host vxrail

complete-mac-join: ## Complete Mac agent join after Tailscale auth
	./scripts/complete-mac-join.sh

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
