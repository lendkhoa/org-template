EXPORT_DIR := html
ASSETS_DIR := org-themes
INDEX_SRC  := README.html

ORG_FILES  := $(shell find . -name '*.org' -not -path './$(ASSETS_DIR)/*' -not -path './$(EXPORT_DIR)/*')
HTML_FILES := $(ORG_FILES:.org=.html)

.PHONY: help export clean install-hooks

help:
	@echo "Targets:"
	@echo "  help          Show this help message"
	@echo "  export        Export every .org file to .html, then collect them (with their CSS/JS assets) into $(EXPORT_DIR)/"
	@echo "  clean         Remove the $(EXPORT_DIR)/ directory"
	@echo "  install-hooks Point git at githooks/, so commits auto-run 'make export'"

export: $(HTML_FILES)
	@mkdir -p $(EXPORT_DIR)
	@mv $(HTML_FILES) $(EXPORT_DIR)/
	@rm -rf $(EXPORT_DIR)/$(ASSETS_DIR)
	@cp -R $(ASSETS_DIR) $(EXPORT_DIR)/$(ASSETS_DIR)
	@if [ ! -f $(EXPORT_DIR)/index.html ] && [ -f $(EXPORT_DIR)/$(INDEX_SRC) ]; then cp $(EXPORT_DIR)/$(INDEX_SRC) $(EXPORT_DIR)/index.html; fi
	@echo "Exported $(words $(HTML_FILES)) file(s) to $(EXPORT_DIR)/"

%.html: %.org
	emacs --batch $< -f org-html-export-to-html

clean:
	rm -rf $(EXPORT_DIR)

install-hooks:
	git config core.hooksPath githooks
	@echo "git hooksPath set to githooks/ -- 'make export' now runs before every commit"
