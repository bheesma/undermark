.PHONY: help install build typecheck test test-vscode page run package install-ext clean

VSIX = undermark-0.0.1.vsix

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "%-14s %s\n", $$1, $$2}'

install: ## Install npm dependencies
	npm install

build: ## Bundle extension, webview and test page into dist/
	npm run build

typecheck: ## Type-check with tsc
	npm run typecheck

test: ## Run unit tests
	npm test

test-vscode: ## Run tests inside a real VS Code
	npm run test:vscode

page: ## Build and open the plain-browser test page
	npm run page

run: build ## Launch VS Code with the extension loaded on sample/
	code --extensionDevelopmentPath="$(CURDIR)" "$(CURDIR)/sample"

package: build ## Package the extension into a .vsix
	npx --yes @vscode/vsce package --no-dependencies --out $(VSIX)

install-ext: package ## Install the packaged .vsix into VS Code
	code --install-extension $(VSIX) --force

clean: ## Remove build output and the .vsix
	rm -rf dist $(VSIX)
