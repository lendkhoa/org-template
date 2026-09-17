/*
  Roam-style stacked navigation.

  Instead of replacing the page, following an internal link mounts the target
  page as a new column to the right of the one it was clicked in. At most
  MAX_PANES columns are open at once; opening one more drops the leftmost.

      [ sidebar ][ pane 0 ][ pane 1 ][ pane 2 ]
        TOC of the focused pane      ^ newest

  The panes live inside `#content` because readtheorg.css scopes most of its
  content styling to `#content <descendant>`; keeping the stack there means
  every mounted page inherits that styling for free.

  The open stack is mirrored into the URL as `?stack=a.html,b.html`, so a
  reload or a shared link restores the same columns and Back pops one off.

  Requires readtheorg.js (window.OrgTheme) for the per-pane content passes.
*/

window.OrgStack = (function ($) {
    'use strict';

    var MAX_PANES = 3;
    var STACK_PARAM = 'stack';
    var SPY_OFFSET = 90;          // px below a pane's top edge that counts as "here"

    var cache = {};               // page key -> {title, contentHtml, tocHtml}
    var panes = [];               // [{key, title, tocHtml, $pane, $body, enhanced}]
    var focused = 0;

    var $stack, $toc, $tocHeading, $tocMount;

    // Directory the current document lives in; `?stack=` entries are stored
    // relative to it so the parameter stays short and portable.
    var BASE_DIR = location.pathname.replace(/[^/]*$/, '');

    // ---------------------------------------------------------------- utils

    // A page's identity: its same-origin pathname. Returns null for anything
    // that isn't a same-origin page we could mount.
    function pageKey(href, base) {
        var url;
        try {
            url = new URL(href, base || location.href);
        } catch (e) {
            return null;
        }
        if (url.origin !== location.origin) return null;
        // "/" and "/index.html" are the same page as far as the stack is
        // concerned; without this a link to index.html would open a second
        // column showing the page already on screen.
        return url.pathname.charAt(url.pathname.length - 1) === '/'
            ? url.pathname + 'index.html'
            : url.pathname;
    }

    function toParam(key) {
        return key.indexOf(BASE_DIR) === 0 ? key.slice(BASE_DIR.length) : key;
    }

    function basename(key) {
        return decodeURIComponent(key.replace(/^.*\//, '')) || key;
    }

    function indexOfKey(key) {
        for (var i = 0; i < panes.length; i++) {
            if (panes[i].key === key) return i;
        }
        return -1;
    }

    function indexOfPane(el) {
        for (var i = 0; i < panes.length; i++) {
            if (panes[i].$pane[0] === el) return i;
        }
        return -1;
    }

    // ------------------------------------------------------------- fetching

    function extractPage(doc, key) {
        var content = doc.getElementById('content');
        if (!content) throw new Error('no #content in ' + key);

        // Each exported page carries its own TOC inside #content; lift it out
        // so it can be shown in the sidebar when this pane has focus.
        var tocHtml = '';
        var toc = content.querySelector('#table-of-contents');
        if (toc) {
            var inner = toc.querySelector('#text-table-of-contents');
            tocHtml = inner ? inner.innerHTML : '';
            toc.parentNode.removeChild(toc);
        }

        return {
            title: (doc.title || '').trim() || basename(key),
            contentHtml: content.innerHTML,
            tocHtml: tocHtml
        };
    }

    function fetchPage(key) {
        if (cache[key]) return Promise.resolve(cache[key]);
        return fetch(key, {credentials: 'same-origin'}).then(function (res) {
            if (!res.ok) throw new Error(res.status + ' for ' + key);
            return res.text();
        }).then(function (html) {
            cache[key] = extractPage(new DOMParser().parseFromString(html, 'text/html'), key);
            return cache[key];
        });
    }

    // --------------------------------------------------------------- panes

    function buildPane(key, data) {
        var $pane = $('<article class="stack-pane"></article>').attr('data-page', key);
        var $bar = $('<div class="stack-pane-bar"></div>')
            .append($('<span class="stack-pane-title"></span>').text(data.title))
            .append($('<button type="button" class="stack-pane-close" ' +
                      'title="Close this page" aria-label="Close this page">&#215;</button>'));
        var $body = $('<div class="stack-pane-body"></div>').html(data.contentHtml);

        // Bound directly rather than delegated on the stack: `scroll` doesn't
        // bubble, so jQuery delegation would never fire for it.
        $pane.on('scroll', updateSpy);

        return {
            key: key,
            title: data.title,
            tocHtml: data.tocHtml,
            $pane: $pane.append($bar, $body),
            $body: $body,
            enhanced: false
        };
    }

    // Reconcile the DOM with `keys`, reusing panes that are already mounted so
    // their scroll position and rendered diagrams survive.
    function renderStack(keys, focusIdx) {
        var mounted = {};
        panes.forEach(function (p) { mounted[p.key] = p; });

        return Promise.all(keys.map(function (key) {
            if (mounted[key]) return mounted[key];
            return fetchPage(key).then(function (data) {
                return buildPane(key, data);
            }, function (err) {
                if (window.console) console.warn('stacked-nav:', err);
                return null;
            });
        })).then(function (resolved) {
            var next = resolved.filter(Boolean);
            // Every page failed to load -- leave the current stack alone
            // rather than blanking the screen.
            if (!next.length) return false;

            panes.forEach(function (p) {
                if (next.indexOf(p) === -1) p.$pane.detach();
            });

            // Only re-append panes that actually moved; re-appending resets a
            // pane's scroll position.
            var children = $stack.children().toArray();
            next.forEach(function (p, i) {
                if (children[i] !== p.$pane[0]) $stack.append(p.$pane);
            });

            panes = next;

            panes.forEach(function (p) {
                if (p.enhanced) return;
                p.enhanced = true;
                window.OrgTheme.enhancePane(p.$body);
            });

            setFocus(Math.min(Math.max(focusIdx, 0), panes.length - 1), true);
            return true;
        });
    }

    // ------------------------------------------------------------- sidebar

    function renderToc(pane) {
        $tocHeading.text(pane ? pane.title : '');
        $tocMount.html(pane ? pane.tocHtml : '');
        // `ul.nav > li ul` is what collapses sub-entries until their parent is
        // active, so the top-level list has to carry the class.
        $tocMount.children('ul').first().addClass('nav');
        $toc.toggleClass('toc-empty', !$tocMount.children().length);
        updateSpy();
    }

    function setFocus(i, reveal) {
        if (i < 0 || i >= panes.length) return;
        focused = i;
        panes.forEach(function (p, idx) {
            p.$pane.toggleClass('stack-pane-focused', idx === i);
        });
        renderToc(panes[i]);
        if (reveal) revealPane(panes[i]);
    }

    // Highlight the TOC entry for the heading currently at the top of the
    // focused pane. Replaces Bootstrap's scrollspy, which can only watch one
    // scroll container and assumed that container was the window.
    var spyQueued = false;
    function updateSpy() {
        if (spyQueued) return;
        spyQueued = true;
        window.requestAnimationFrame(function () {
            spyQueued = false;
            var pane = panes[focused];
            var $links = $tocMount.find('a[href^="#"]');
            if (!pane || !$links.length) return;

            var limit = pane.$pane[0].getBoundingClientRect().top + SPY_OFFSET;
            var current = null;
            $links.each(function () {
                var target = headingFor(pane, this.getAttribute('href').slice(1));
                if (target && target.getBoundingClientRect().top <= limit) current = this;
            });

            $links.parent().removeClass('active');
            if (current) $(current).parent().addClass('active');
        });
    }

    function headingFor(pane, id) {
        if (!id) return null;
        // Attribute selector rather than `#id`: org's generated ids are safe,
        // but ids carried over from hand-written `#+NAME:` blocks need not be.
        try {
            return pane.$body[0].querySelector('[id="' + id.replace(/["\\]/g, '\\$&') + '"]');
        } catch (e) {
            return null;
        }
    }

    /*
      Both helpers below jump by assigning scrollTop/scrollLeft, the way a
      native `#anchor` jump behaves. Deliberately not scrollIntoView():

        - it can't account for the sticky pane bar, so it parks the target
          heading underneath it;
        - `behavior: 'smooth'` is a silent no-op -- the scroll never happens
          at all -- both for readers who have smooth scrolling switched off
          and, in Chrome, for a pane nested inside the horizontally scrolling
          stack. For the same reason neither container may be given
          `scroll-behavior: smooth` in CSS: that would swallow these
          assignments in exactly those browsers.
    */

    function scrollToAnchor(pane, id) {
        var target = headingFor(pane, id);
        if (!target) return;
        // Expand any collapsed section the target sits inside, otherwise we'd
        // scroll to a `display:none` element.
        $(target).parents('[id^="outline-container-"]').removeClass('section-collapsed');

        var paneEl = pane.$pane[0];
        var bar = pane.$pane.children('.stack-pane-bar')[0];
        var top = paneEl.scrollTop +
            target.getBoundingClientRect().top -
            paneEl.getBoundingClientRect().top -
            (bar ? bar.offsetHeight : 0);

        paneEl.scrollTop = Math.max(top, 0);
    }

    // Bring a pane into view horizontally -- needed once the stack overflows
    // (narrow windows) and on mobile, where panes are a full screen wide.
    function revealPane(pane) {
        var stack = $stack[0];
        var left = stack.scrollLeft +
            pane.$pane[0].getBoundingClientRect().left -
            stack.getBoundingClientRect().left;
        stack.scrollLeft = Math.max(left, 0);
    }

    // ------------------------------------------------------------- history

    function stackFromUrl() {
        var raw = new URLSearchParams(location.search).get(STACK_PARAM);
        if (!raw) return [pageKey(location.pathname)];
        var keys = raw.split(',').map(function (part) {
            return pageKey(part.trim());
        }).filter(Boolean);
        return keys.length ? keys.slice(-MAX_PANES) : [pageKey(location.pathname)];
    }

    function syncUrl(replace) {
        var keys = panes.map(function (p) { return p.key; });
        var params = new URLSearchParams(location.search);

        if (keys.length === 1 && keys[0] === pageKey(location.pathname)) {
            params.delete(STACK_PARAM);
        } else {
            params.set(STACK_PARAM, keys.map(toParam).join(','));
        }

        var query = params.toString();
        var url = location.pathname + (query ? '?' + query : '');
        history[replace ? 'replaceState' : 'pushState']({stack: keys}, '', url);
    }

    // ---------------------------------------------------------------- open

    function openPage(key, hash) {
        var already = indexOfKey(key);
        if (already !== -1) {
            setFocus(already, true);
            if (hash) scrollToAnchor(panes[already], hash);
            return;
        }

        var keys = panes.map(function (p) { return p.key; });
        keys.push(key);
        // Past the limit the oldest column drops off the left.
        while (keys.length > MAX_PANES) keys.shift();

        renderStack(keys, keys.length - 1).then(function () {
            // The page didn't load -- it's missing, or the network/scheme
            // refused the request. The click was already preventDefault()ed,
            // so without this the link would appear to do nothing at all.
            if (indexOfKey(key) === -1) {
                window.location.href = key + (hash ? '#' + hash : '');
                return;
            }
            syncUrl(false);
            if (hash) scrollToAnchor(panes[focused], hash);
        });
    }

    function closePane(i) {
        // The stack always keeps at least one page on screen.
        if (panes.length <= 1 || i < 0 || i >= panes.length) return;

        var keys = panes.map(function (p) { return p.key; });
        keys.splice(i, 1);
        var nextFocus = focused > i ? focused - 1 : Math.min(focused, keys.length - 1);

        renderStack(keys, nextFocus).then(function (ok) {
            if (ok) syncUrl(false);
        });
    }

    // ---------------------------------------------------------------- init

    function shouldIntercept(event, $a) {
        // Let the browser handle new-tab/new-window gestures and explicit
        // targets exactly as it would on any other site.
        return (event.which === undefined || event.which <= 1) &&
            !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
            !$a.attr('target') && !$a.attr('download') &&
            typeof $a.attr('href') === 'string';
    }

    function bindStackEvents() {
        $stack.on('mousedown focusin', '.stack-pane', function () {
            var i = indexOfPane(this);
            if (i !== -1 && i !== focused) setFocus(i, false);
        });

        $stack.on('click', '.stack-pane-close', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closePane(indexOfPane($(this).closest('.stack-pane')[0]));
        });

        $stack.on('click', 'a[href]', function (event) {
            var $a = $(this);
            if (!shouldIntercept(event, $a)) return;

            var from = indexOfPane($a.closest('.stack-pane')[0]);
            if (from === -1) return;

            var base = new URL(panes[from].key, location.href).href;
            var url;
            try {
                url = new URL($a.attr('href'), base);
            } catch (e) {
                return;
            }
            if (url.origin !== location.origin) return;

            // A link into the page it was clicked from scrolls that pane
            // rather than opening a duplicate column.
            if (url.pathname === panes[from].key) {
                if (!url.hash) return;
                event.preventDefault();
                setFocus(from, false);
                scrollToAnchor(panes[from], url.hash.slice(1));
                return;
            }

            // Anything that isn't an exported page (images, downloads, the
            // pagefind assets) keeps its normal behavior.
            if (!/\.html?$/i.test(url.pathname)) return;

            event.preventDefault();
            openPage(url.pathname, url.hash.slice(1));
        });

        // Sidebar TOC entries scroll inside the focused pane; the document
        // itself doesn't scroll any more, so a native hash jump would do
        // nothing.
        $toc.on('click', '#text-table-of-contents a[href^="#"]', function (event) {
            var pane = panes[focused];
            if (!pane) return;
            event.preventDefault();
            scrollToAnchor(pane, this.getAttribute('href').slice(1));
        });

        window.addEventListener('popstate', function () {
            var keys = stackFromUrl();
            renderStack(keys, keys.length - 1);
        });

        $(window).on('resize', updateSpy);
    }

    function init() {
        var $content = $('#content');
        if (!$content.length || !window.OrgTheme) return;

        // Opened straight off disk: fetch() rejects file:// URLs as a
        // cross-origin request, so no page could ever be mounted. Leave the
        // document exactly as org exported it -- one page, its TOC docked in
        // the sidebar, links navigating normally -- and just run the content
        // passes the stack would otherwise have run.
        if (location.protocol === 'file:') {
            window.OrgTheme.enhancePane($content);
            if (window.console) {
                console.info('stacked-nav: stacked columns need the site to be ' +
                             'served over http(s); opened from file://, so links ' +
                             'navigate normally.');
            }
            return;
        }

        // Seed the cache with the page we were served, so it goes through the
        // same code path as every fetched page. This also lifts the served
        // page's TOC out of #content, which is why the sidebar is only
        // rewired afterwards.
        var docKey = pageKey(location.pathname);
        var servedToc = $('#table-of-contents').detach();
        var served = extractPage(document, docKey);
        served.tocHtml = servedToc.find('#text-table-of-contents').html() || '';
        cache[docKey] = served;

        // Reuse the served page's sidebar element rather than building a new
        // one: readtheorg.js has already bound its delegated TOC handlers to
        // it. It is `position:fixed` but ships inside #content, so moving it
        // to <body> keeps it out of the stack's flex flow.
        $toc = servedToc.length ? servedToc : $('<div id="table-of-contents" role="doc-toc"></div>');
        $('body').prepend($toc);
        if (!$toc.children('h2').length) $toc.prepend('<h2></h2>');
        if (!$toc.find('#text-table-of-contents').length) {
            $toc.append('<div id="text-table-of-contents" role="doc-toc"></div>');
        }
        $tocHeading = $toc.children('h2').first();
        $tocMount = $toc.find('#text-table-of-contents').first();

        $stack = $content.empty().addClass('stack');
        bindStackEvents();

        var keys = stackFromUrl();
        renderStack(keys, keys.length - 1).then(function (ok) {
            if (!ok) return;
            syncUrl(true);
            if (location.hash.length > 1) {
                scrollToAnchor(panes[focused], location.hash.slice(1));
            }
        });
    }

    $(document).ready(init);

    return {
        open: function (href) {
            var key = pageKey(href);
            if (key) openPage(key, '');
        },
        focusedPane: function () {
            return panes[focused] ? panes[focused].$body[0] : document;
        }
    };
}(jQuery));
