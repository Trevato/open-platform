.PHONY: deploy generate deploy-infra diff status lint teardown urls help test-smoke test-k8s test-e2e test-e2e-platform test-e2e-auth colima-start colima-stop colima-reset

deploy: ## Deploy everything (secrets, releases, OAuth2 — all automated)
	./scripts/deploy.sh

generate: ## Generate config from open-platform.yaml (run before deploy if config changed)
	./scripts/generate-config.sh

deploy-infra: ## Deploy infrastructure only (traefik, cnpg, minio, forgejo)
	helmfile sync -l tier=infra

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

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
