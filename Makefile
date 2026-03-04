.PHONY: deploy deploy-infra diff status lint teardown urls mac-start mac-stop help

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

mac-start: ## Join Mac as k3s agent (starts Colima + k3s agent)
	./scripts/colima-start.sh

mac-stop: ## Drain Mac and stop Colima (workloads move to VxRail)
	./scripts/colima-stop.sh

urls: ## Print service URLs
	@echo "Platform (*.product-garden.com):"
	@echo "  Forgejo:    https://forgejo.product-garden.com"
	@echo "  Woodpecker: https://ci.product-garden.com"
	@echo "  Headlamp:   https://headlamp.product-garden.com"
	@echo "  MinIO:      https://minio.product-garden.com"
	@echo "  MinIO S3:   https://s3.product-garden.com"
	@echo ""
	@echo "Apps:"
	@echo "  Hub:        https://hub.product-garden.com"
	@echo "  Social:     https://social.product-garden.com"
	@echo "  Arcade:     https://arcade.product-garden.com"
	@echo "  Events:     https://events.product-garden.com"
	@echo "  Minecraft:  https://minecraft.product-garden.com"

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
