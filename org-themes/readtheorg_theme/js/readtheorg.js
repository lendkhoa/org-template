function collapse_toc_elements_on_click (nav_li_a){
    /*
      When an `a' element in the TOC is clicked, its parent
      `li' element's active attribute is toggled.  This causes
      the element to toggle between minimized and maximized
      states.  The active attribute is documented in bootstrap.
      https://getbootstrap.com/docs/4.0/components/navbar/#nav
    */
    $(nav_li_el).parent().toggleClass("active");
}

$( document ).ready(function() {
    // When the document is loaded and ready, bind the
    // function `collapse_toc_elements_on_click' to the
    // `a' elements in the table of contents.
    $("#text-table-of-contents a").click(function() {
        collapse_toc_elements_on_click(this);
    });
});

$(function() {
    $('.note').before("<p class='admonition-title note'>Note</p>");
    $('.seealso').before("<p class='admonition-title seealso'>See also</p>");
    $('.warning').before("<p class='admonition-title warning'>Warning</p>");
    $('.caution').before("<p class='admonition-title caution'>Caution</p>");
    $('.attention').before("<p class='admonition-title attention'>Attention</p>");
    $('.tip').before("<p class='admonition-title tip'>Tip</p>");
    $('.important').before("<p class='admonition-title important'>Important</p>");
    $('.hint').before("<p class='admonition-title hint'>Hint</p>");
    $('.error').before("<p class='admonition-title error'>Error</p>");
    $('.danger').before("<p class='admonition-title danger'>Danger</p>");
});

$( document ).ready(function() {

    // Shift nav in mobile when clicking the menu.
    $(document).on('click', "[data-toggle='wy-nav-top']", function() {
      $("[data-toggle='wy-nav-shift']").toggleClass("shift");
      $("[data-toggle='rst-versions']").toggleClass("shift");
    });
    // Close menu when you click a link.
    $(document).on('click', ".wy-menu-vertical .current ul li a", function() {
      $("[data-toggle='wy-nav-shift']").removeClass("shift");
      $("[data-toggle='rst-versions']").toggleClass("shift");
    });
    $(document).on('click', "[data-toggle='rst-current-version']", function() {
      $("[data-toggle='rst-versions']").toggleClass("shift-up");
    });
    // Make tables responsive
    $("table.docutils:not(.field-list)").wrap("<div class='wy-table-responsive'></div>");
});

$( document ).ready(function() {
    $('#text-table-of-contents ul').first().addClass('nav');
                                        // ScrollSpy also requires that we use
                                        // a Bootstrap nav component.
    $('body').scrollspy({target: '#text-table-of-contents'});

    // DON'T add sticky table headers (Fix issue #69?)
    // $('table').stickyTableHeaders();

    // set the height of tableOfContents
    var $postamble = $('#postamble');
    var $tableOfContents = $('#table-of-contents');
    $tableOfContents.css({paddingBottom: $postamble.outerHeight()});

    // add a persistent button that toggles the TOC sidebar open/closed
    var TOC_STORAGE_KEY = 'org-toc-collapsed';
    var $body = $('body');
    var $sidebarToggle = $('<div id="sidebar-toggle" title="Toggle table of contents">&#9776;</div>');
    $body.append($sidebarToggle);

    var storedState = window.localStorage ? localStorage.getItem(TOC_STORAGE_KEY) : null;
    var startCollapsed = storedState === null ? $(window).width() <= 768 : storedState === 'true';
    $body.toggleClass('sidebar-collapsed', startCollapsed);

    $sidebarToggle.on('click', function () {
        var collapsed = $body.toggleClass('sidebar-collapsed').hasClass('sidebar-collapsed');
        if (window.localStorage) {
            localStorage.setItem(TOC_STORAGE_KEY, collapsed);
        }
    });

    // auto-collapse after following a TOC link on narrow screens
    $tableOfContents.on('click', 'a', function () {
        if ($(window).width() <= 768) {
            $body.addClass('sidebar-collapsed');
            if (window.localStorage) {
                localStorage.setItem(TOC_STORAGE_KEY, 'true');
            }
        }
    });
});

$( document ).ready(function() {
    // Org exports `#+begin_src mermaid ... #+end_src` as a plain
    // `<pre class="src src-mermaid">` code block. Lift its raw text into
    // the `<div class="mermaid">` container mermaid.js looks for, then
    // render it.
    var $mermaidBlocks = $('pre.src-mermaid');
    if ($mermaidBlocks.length && typeof mermaid !== 'undefined') {
        $mermaidBlocks.each(function () {
            var $pre = $(this);
            var $diagram = $('<div class="mermaid"></div>').text($pre.text());
            $pre.replaceWith($diagram);
        });
        mermaid.initialize({startOnLoad: false, theme: 'default'});
        mermaid.run({querySelector: '.mermaid'});
    }
});

$( document ).ready(function() {
    // Add a "Copy" button to the top-right of every code block. Runs after
    // the mermaid pass above, so blocks already converted into diagrams
    // are skipped automatically.
    function fallbackCopy(text) {
        var $tmp = $('<textarea readonly></textarea>')
            .val(text)
            .css({position: 'fixed', top: '-1000px', left: '-1000px'});
        $('body').append($tmp);
        $tmp[0].select();
        try { document.execCommand('copy'); } catch (e) {}
        $tmp.remove();
    }

    $('pre.src, .codeblock, #content .literal-block').each(function () {
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
});

window.SphinxRtdTheme = (function (jquery) {
    var stickyNav = (function () {
        var navBar,
            win,
            stickyNavCssClass = 'stickynav',
            applyStickNav = function () {
                if (navBar.height() <= win.height()) {
                    navBar.addClass(stickyNavCssClass);
                } else {
                    navBar.removeClass(stickyNavCssClass);
                }
            },
            enable = function () {
                applyStickNav();
                win.on('resize', applyStickNav);
            },
            init = function () {
                navBar = jquery('nav.wy-nav-side:first');
                win    = jquery(window);
            };
        jquery(init);
        return {
            enable : enable
        };
    }());
    return {
        StickyNav : stickyNav
    };
}($));
