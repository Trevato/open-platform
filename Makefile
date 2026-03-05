.PHONY: deploy generate deploy-infra diff status lint teardown urls help

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

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
