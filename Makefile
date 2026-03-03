.PHONY: deploy deploy-infra diff status lint teardown urls help

deploy: ## Deploy everything (secrets, releases, OAuth2 — all automated)
	./scripts/deploy.sh

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
	@echo "Forgejo:    https://forgejo.dev.test"
	@echo "Woodpecker: https://ci.dev.test"
	@echo "Headlamp:   https://headlamp.dev.test"
	@echo "MinIO:      https://minio.dev.test"
	@echo "MinIO S3:   https://s3.dev.test"
	@echo "Social:     https://social.dev.test"
	@echo "Minecraft:  https://minecraft.dev.test"

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
