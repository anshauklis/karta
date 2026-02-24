.PHONY: help html clean livehtml

SPHINXBUILD  = sphinx-build
SOURCEDIR    = .
BUILDDIR     = _build

help:
	@echo "  html       Build HTML documentation"
	@echo "  clean      Remove build artifacts"
	@echo "  livehtml   Live-reload server (requires sphinx-autobuild)"

html:
	$(SPHINXBUILD) -b html $(SOURCEDIR) $(BUILDDIR)/html

clean:
	rm -rf $(BUILDDIR)

livehtml:
	sphinx-autobuild $(SOURCEDIR) $(BUILDDIR)/html --port 8100 --open-browser
