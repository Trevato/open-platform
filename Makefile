.PHONY: deploy deploy-infra diff status lint teardown urls help

deploy: ## Deploy everything (secrets, releases, OAuth2 — all automated)
	helmfile sync
	./scripts/setup-oidc.sh

deploy-infra: ## Deploy infrastructure only (traefik, cnpg, minio, forgejo)
	helmfile sync -l tier=infra

diff: ## Preview changes without applying
	helmfile diff

status: ## Show release status
	helmfile status

lint: ## Validate all releases
	helmfile lint

teardown: ## Destroy all releases (requires confirmation)
	@echo "This will destroy all Open Platform releases. Press Ctrl+C to abort."
	@read -p "Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	helmfile destroy

urls: ## Print service URLs
	@echo "Forgejo:    https://forgejo.dev.test"
	@echo "Woodpecker: https://ci.dev.test"
	@echo "Headlamp:   https://headlamp.dev.test"
	@echo "MinIO:      https://minio.dev.test"
	@echo "MinIO S3:   https://s3.dev.test"
	@echo "Social:     https://social.dev.test"
	@echo "Demo App:   https://demo-app.dev.test"

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
