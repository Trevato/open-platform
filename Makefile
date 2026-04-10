.PHONY: deploy upgrade template lint status teardown urls help test-smoke test-k8s test-e2e test-e2e-platform test-e2e-auth colima-start colima-stop colima-reset check-infra sync-registry node-join node-remove node-status colima-agent complete-mac-join

deploy: ## Deploy via Helm chart (installs Flux + platform chart)
	@if ! helm status flux2 -n flux-system >/dev/null 2>&1; then \
		echo "Installing Flux controllers..."; \
		helm repo add fluxcd-community https://fluxcd-community.github.io/helm-charts 2>/dev/null || true; \
		helm repo update fluxcd-community; \
		helm install flux2 fluxcd-community/flux2 -n flux-system --create-namespace --wait; \
	fi
	helm upgrade --install open-platform charts/open-platform \
		-f open-platform.yaml \
		-n open-platform --create-namespace --wait --timeout 25m
	@echo ""
	@echo "Platform chart installed. Flux will reconcile all services."
	@echo "Syncing registry credentials to k3s nodes..."
	@./scripts/sync-registry.sh 2>/dev/null || echo "Registry sync skipped (no SSH access to nodes). Run 'make sync-registry' manually."
	@echo "Run 'make status' to check progress."

upgrade: ## Upgrade the platform Helm chart
	helm upgrade open-platform charts/open-platform \
		-f open-platform.yaml \
		-n open-platform --wait --timeout 15m

template: ## Render chart templates to stdout (dry run)
	helm template open-platform charts/open-platform -f open-platform.yaml

lint: ## Lint the Helm chart
	helm lint charts/open-platform -f open-platform.yaml

status: ## Show Flux HelmRelease reconciliation status
	@kubectl get helmreleases -A 2>/dev/null || echo "(no HelmReleases found)"

sync-registry: ## Sync registry CA + credentials to k3s nodes
	./scripts/sync-registry.sh

check-infra: ## Validate external infrastructure components are present
	./scripts/check-infra.sh

teardown: ## Destroy all releases and clean up resources
	@echo "This will destroy ALL Open Platform resources."
	@read -p "Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	./scripts/teardown.sh

urls: ## Print service URLs
	@DOMAIN=$$(grep '^domain:' open-platform.yaml 2>/dev/null | awk '{print $$2}' | tr -d '"'"'" || echo 'example.com'); \
	echo "Platform (*.$$DOMAIN):"; \
	echo "  Forgejo:    https://forgejo.$$DOMAIN"; \
	echo "  Woodpecker: https://ci.$$DOMAIN"; \
	echo "  MinIO:      https://minio.$$DOMAIN"; \
	echo "  Console:    https://console.$$DOMAIN"; \
	echo "  API:        https://api.$$DOMAIN"

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
