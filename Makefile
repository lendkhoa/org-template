EXPORT_DIR := html
ASSETS_DIR := org-themes

ORG_FILES  := $(shell find . -name '*.org' -not -path './$(ASSETS_DIR)/*' -not -path './$(EXPORT_DIR)/*')
HTML_FILES := $(ORG_FILES:.org=.html)

.PHONY: help export clean

help:
	@echo "Targets:"
	@echo "  help    Show this help message"
	@echo "  export  Export every .org file to .html, then collect them (with their CSS/JS assets) into $(EXPORT_DIR)/"
	@echo "  clean   Remove the $(EXPORT_DIR)/ directory"

export: $(HTML_FILES)
	@mkdir -p $(EXPORT_DIR)
	@mv $(HTML_FILES) $(EXPORT_DIR)/
	@cp -R $(ASSETS_DIR) $(EXPORT_DIR)/$(ASSETS_DIR)
	@echo "Exported $(words $(HTML_FILES)) file(s) to $(EXPORT_DIR)/"

%.html: %.org
	emacs --batch $< -f org-html-export-to-html

clean:
	rm -rf $(EXPORT_DIR)
