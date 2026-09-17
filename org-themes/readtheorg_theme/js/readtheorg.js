/*
  Page-content enhancements (admonitions, collapsible sections, mermaid
  diagrams, copy buttons, responsive tables) plus the TOC sidebar toggle.

  Every content pass here is written against an arbitrary root element and
  exported as `window.OrgTheme.enhancePane($root)`, because stacked-nav.js
  mounts additional pages into the DOM after load and has to run the same
  passes over them. Nothing in this file may assume there is exactly one
  page on screen, or that `#content` is that page.
*/

window.OrgTheme = (function ($) {
    'use strict';

    var ADMONITIONS = {
        note: 'Note',
        seealso: 'See also',
        warning: 'Warning',
        caution: 'Caution',
        attention: 'Attention',
        tip: 'Tip',
        important: 'Important',
        hint: 'Hint',
        error: 'Error',
        danger: 'Danger'
    };

    function enhanceAdmonitions($root) {
        $.each(ADMONITIONS, function (cls, label) {
            $root.find('.' + cls).before(
                $('<p class="admonition-title"></p>').addClass(cls).text(label)
            );
        });
    }

    function enhanceTables($root) {
        $root.find('table.docutils:not(.field-list)').wrap("<div class='wy-table-responsive'></div>");
    }

    function enhanceCollapsibleSections($root) {
        // Make each headline section collapsible: clicking a heading toggles
        // everything under its outline container (the prose + any nested
        // sub-sections), which org-html-export emits as later siblings of the
        // heading inside the same `outline-N' div.
        $root.find('[id^="outline-container-"]').each(function () {
            var $section = $(this);
            var $heading = $section.children('h1, h2, h3, h4, h5, h6').first();
            if (!$heading.length) return;

            $heading.addClass('section-toggle-heading').prepend('<span class="section-toggle">&#9662;</span>');
            $heading.on('click', function () {
                $section.toggleClass('section-collapsed');
            });
        });
    }

    function enhanceMermaid($root) {
        // Org exports `#+begin_src mermaid ... #+end_src` as a plain
        // `<pre class="src src-mermaid">` code block. Lift its raw text into
        // the `<div class="mermaid">` container mermaid.js looks for, then
        // render it.
        var $blocks = $root.find('pre.src-mermaid');
        if (!$blocks.length || typeof mermaid === 'undefined') return;

        var nodes = [];
        $blocks.each(function () {
            var $pre = $(this);
            var $diagram = $('<div class="mermaid"></div>').text($pre.text());
            $pre.replaceWith($diagram);
            nodes.push($diagram[0]);
        });

        mermaid.initialize({startOnLoad: false, theme: 'default'});
        // `nodes' rather than a querySelector, so re-running for a freshly
        // mounted pane doesn't re-render (and crash on) diagrams that other
        // panes already drew.
        mermaid.run({nodes: nodes}).then(function () {
            // mermaid.js only draws a static SVG; svg-pan-zoom adds the
            // scroll-to-zoom / drag-to-pan interaction and the on-diagram
            // zoom controls.
            if (typeof svgPanZoom === 'undefined') return;
            $(nodes).find('svg').each(function () {
                svgPanZoom(this, {
                    zoomEnabled: true,
                    controlIconsEnabled: true,
                    fit: true,
                    center: true,
                    minZoom: 0.2,
                    maxZoom: 15
                });
            });
        });
    }

    function fallbackCopy(text) {
        var $tmp = $('<textarea readonly></textarea>')
            .val(text)
            .css({position: 'fixed', top: '-1000px', left: '-1000px'});
        $('body').append($tmp);
        $tmp[0].select();
        try { document.execCommand('copy'); } catch (e) {}
        $tmp.remove();
    }

    function enhanceCopyButtons($root) {
        // Runs after the mermaid pass above, so blocks already converted into
        // diagrams are skipped automatically.
        $root.find('pre.src, .codeblock, .literal-block').each(function () {
            var $block = $(this);
            var $btn = $('<button type="button" class="copy-code-btn">Copy</button>');
            $block.prepend($btn);

            $btn.on('click', function () {
                var code = $block.clone().find('.copy-code-btn').remove().end().text();
                var onDone = function () {
                    $btn.text('Copied!');
                    setTimeout(function () { $btn.text('Copy'); }, 1500);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(code).then(onDone, function () {
                        fallbackCopy(code);
                        onDone();
                    });
                } else {
                    fallbackCopy(code);
                    onDone();
                }
            });
        });
    }

    // Run every content pass over one page's markup. Safe to call repeatedly
    // for different roots; never call it twice for the same root.
    function enhancePane($root) {
        enhanceAdmonitions($root);
        enhanceTables($root);
        enhanceCollapsibleSections($root);
        enhanceMermaid($root);
        enhanceCopyButtons($root);
    }

    return {enhancePane: enhancePane};
}(jQuery));

$(document).ready(function () {
    'use strict';

    // add a persistent button that toggles the TOC sidebar open/closed
    var TOC_STORAGE_KEY = 'org-toc-collapsed';
    var $body = $('body');
    var $sidebarToggle = $('<div id="sidebar-toggle" title="Toggle table of contents">&#9776;</div>');
    var $sidebarBackdrop = $('<div id="sidebar-backdrop"></div>');
    $body.append($sidebarBackdrop, $sidebarToggle);

    function closeSidebar() {
        $body.addClass('sidebar-collapsed');
        if (window.localStorage) {
            localStorage.setItem(TOC_STORAGE_KEY, 'true');
        }
    }

    var storedState = window.localStorage ? localStorage.getItem(TOC_STORAGE_KEY) : null;
    var startCollapsed = storedState === null ? $(window).width() <= 768 : storedState === 'true';
    $body.toggleClass('sidebar-collapsed', startCollapsed);

    $sidebarToggle.on('click', function () {
        var collapsed = $body.toggleClass('sidebar-collapsed').hasClass('sidebar-collapsed');
        if (window.localStorage) {
            localStorage.setItem(TOC_STORAGE_KEY, collapsed);
        }
    });

    // Click the dimmed empty screen behind the open sidebar to close it.
    // Only visible/clickable on narrow screens (see #sidebar-backdrop in
    // readtheorg.css) -- on desktop the sidebar docks and the pane stack
    // shifts for it, so there's no overlay to dismiss.
    $sidebarBackdrop.on('click', closeSidebar);

    // TOC entries are delegated, because stacked-nav.js swaps the sidebar's
    // contents whenever the focused pane changes.
    var $tableOfContents = $('#table-of-contents');

    // Keep the bottom of the TOC clear of the fixed postamble footer.
    $tableOfContents.css({paddingBottom: $('#postamble').outerHeight()});

    $tableOfContents.on('click', '#text-table-of-contents a', function () {
        /*
          Toggle the `li' parent's active attribute, so the entry switches
          between minimized and maximized. The active attribute is documented
          in bootstrap: https://getbootstrap.com/docs/4.0/components/navbar/#nav
        */
        $(this).parent().toggleClass('active');
    });

    $tableOfContents.on('click', 'a', function () {
        // expand any collapsed section(s) the target heading lives in,
        // otherwise the browser would jump to a `display:none' element
        var hash = this.getAttribute('href');
        if (hash && hash.charAt(0) === '#' && hash.length > 1) {
            $(window.OrgStack ? window.OrgStack.focusedPane() : document)
                .find('[id="' + hash.slice(1) + '"]')
                .parents('[id^="outline-container-"]')
                .removeClass('section-collapsed');
        }

        if ($(window).width() <= 768) {
            closeSidebar();
        }
    });
});
