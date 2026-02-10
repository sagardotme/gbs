import { autoinject, bindable, bindingMode } from 'aurelia-framework';

type EmbedPdfModule = any;

@autoinject()
export class PdfViewer {
    @bindable({ defaultBindingMode: bindingMode.oneWay }) src: string;
    @bindable({ defaultBindingMode: bindingMode.oneWay }) page: number;

    container: HTMLElement;

    loading = false;
    error: string = '';
    fullscreen_supported = false;

    private token = 0;
    private viewer_el: any = null;
    private registry: any = null;
    private scroll_api: any = null;
    private scroll_layout_unsub: (() => void) | null = null;
    private pending_page: number | null = null;

    private static_module_key = '__gbs_embedpdf_module__';
    private static_loader_key = '__gbs_embedpdf_loader_promise__';

    attached() {
        this.fullscreen_supported = this.compute_fullscreen_supported();
        this.mount(true);
    }

    detached() {
        this.token++;
        this.unmount();
    }

    srcChanged() {
        this.mount(true);
    }

    pageChanged(newValue: number) {
        const page = this.coerce_page(newValue);
        if (!page) return;
        // Jump immediately when the bound page changes (doc segments, etc).
        this.pending_page = page;
        this.scroll_to_page_when_ready(page, 'instant');
    }

    private get_download_href(): string {
        const src = this.normalize_src(this.src);
        if (!src) return '';
        const idx = src.indexOf('#');
        return idx === -1 ? src : src.slice(0, idx);
    }

    private filename_from_url(url: string): string {
        try {
            const u = new URL(url, window.location.href);
            const parts = (u.pathname || '').split('/').filter(Boolean);
            const last = parts.length ? parts[parts.length - 1] : '';
            const name = last || 'document.pdf';
            // Best-effort decoding for nicer filenames.
            try { return decodeURIComponent(name); } catch (e) { return name; }
        } catch (e) {
            return 'document.pdf';
        }
    }

    private compute_fullscreen_supported(): boolean {
        try {
            const target: any =
                (this.container && (this.container.closest('.doc-frame') as any)) ||
                (this.container && (this.container.closest('.pdf-viewer') as any)) ||
                (this.container as any);
            if (!target) return false;

            const req =
                target.requestFullscreen ||
                target.webkitRequestFullscreen ||
                target.webkitRequestFullScreen ||
                target.msRequestFullscreen;
            return !!req;
        } catch (e) {
            return false;
        }
    }

    download_pdf(event?: Event) {
        try {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
        } catch (e) { }

        const href = this.get_download_href();
        if (!href) return;

        // Prefer opening in a new tab (never navigate away from the app). If same-origin,
        // the `download` attribute may trigger a direct download.
        try {
            const a = document.createElement('a');
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.download = this.filename_from_url(href);
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {
            try { window.open(href, '_blank', 'noopener'); } catch (e2) { }
        }
    }

    toggle_fullscreen(event?: Event) {
        try {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
        } catch (e) { }

        // Let parent (doc-detail) handle fullscreen toggle (supports pseudo-fullscreen fallback).
        try {
            if (this.container) {
                const ev = new CustomEvent('pdf-fullscreen', { bubbles: true, cancelable: true });
                const notCanceled = this.container.dispatchEvent(ev);
                if (!notCanceled) {
                    return;
                }
            }
        } catch (e) { }

        // Fallback: try native fullscreen on the closest doc-frame (or on the viewer itself).
        const target: any =
            (this.container && (this.container.closest('.doc-frame') as any)) ||
            (this.container && (this.container.closest('.pdf-viewer') as any)) ||
            (this.container as any);
        if (!target) return;

        const doc: any = document as any;
        const currentFsEl = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;

        // Toggle off if any native fullscreen is active.
        if (currentFsEl) {
            try {
                if (doc.exitFullscreen) {
                    doc.exitFullscreen();
                } else if (doc.webkitExitFullscreen) {
                    doc.webkitExitFullscreen();
                } else if (doc.msExitFullscreen) {
                    doc.msExitFullscreen();
                }
            } catch (e) { }
            try { window.dispatchEvent(new Event('resize')); } catch (e) { }
            return;
        }

        const req =
            target.requestFullscreen ||
            target.webkitRequestFullscreen ||
            target.webkitRequestFullScreen ||
            target.msRequestFullscreen;

        if (req) {
            try {
                const ret = req.call(target);
                if (ret && typeof ret.then === 'function') {
                    ret.then(() => {
                        try { window.dispatchEvent(new Event('resize')); } catch (e) { }
                    }).catch(() => { });
                } else {
                    try { window.dispatchEvent(new Event('resize')); } catch (e) { }
                }
            } catch (e) { }
        }
    }

    private scroll_to_top() {
        try {
            if (this.container) {
                const host = this.container.closest('.doc-frame') as HTMLElement;
                if (host) host.scrollTop = 0;
            }
        } catch (e) { }
    }

    private unmount() {
        try {
            if (this.container) {
                this.container.innerHTML = '';
            }
        } catch (e) { }
        this.viewer_el = null;
        this.registry = null;
        this.scroll_api = null;
        if (this.scroll_layout_unsub) {
            try { this.scroll_layout_unsub(); } catch (e) { }
        }
        this.scroll_layout_unsub = null;
        this.pending_page = null;
    }

    private get_embedpdf_module_urls(): string[] {
        // EmbedPDF Snippet (ESM) — CDN first for best cross-device behavior.
        // (We keep two URLs: pinned and major-tag, to improve resilience.)
        return [
            'https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2.3.0/dist/embedpdf.js',
            'https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2/dist/embedpdf.js'
        ];
    }

    private import_embedpdf_module(module_url: string): Promise<EmbedPdfModule> {
        // Load an ESM module in an AMD/RequireJS app by injecting a module script that
        // imports the module and resolves via a global callback.
        const w: any = window as any;
        return new Promise((resolve, reject) => {
            const cb = '__gbs_embedpdf_cb_' + Math.random().toString(16).slice(2);
            const errCb = cb + '_err';
            const cleanup = () => {
                try { delete w[cb]; } catch (e) { }
                try { delete w[errCb]; } catch (e) { }
            };

            w[cb] = (mod: any) => {
                cleanup();
                resolve(mod);
            };
            w[errCb] = (msg: any) => {
                cleanup();
                reject(msg);
            };

            // Import the whole module so we can access named exports like ZoomMode.
            const code =
                `import * as mod from ${JSON.stringify(module_url)};\n` +
                `window[${JSON.stringify(cb)}](mod);\n`;

            try {
                const blob = new Blob([code], { type: 'text/javascript' });
                const blobUrl = URL.createObjectURL(blob);
                const script = document.createElement('script');
                script.type = 'module';
                script.src = blobUrl;
                script.onload = () => {
                    try { URL.revokeObjectURL(blobUrl); } catch (e) { }
                };
                script.onerror = () => {
                    try { URL.revokeObjectURL(blobUrl); } catch (e) { }
                    try { w[errCb]('embedpdf-module-load-failed'); } catch (e) { }
                };
                document.head.appendChild(script);
            } catch (e) {
                cleanup();
                reject(e);
            }
        });
    }

    private ensure_embedpdf(): Promise<any> {
        const w: any = window as any;
        if (w[this.static_module_key]) return Promise.resolve(w[this.static_module_key]);
        if (w[this.static_loader_key]) return w[this.static_loader_key];

        w[this.static_loader_key] = (async () => {
            const urls = this.get_embedpdf_module_urls();
            let lastErr: any = null;
            for (let i = 0; i < urls.length; i++) {
                const u = urls[i];
                try {
                    const mod = await this.import_embedpdf_module(u);
                    const EmbedPDF = mod && mod.default ? mod.default : null;
                    if (EmbedPDF && EmbedPDF.init) {
                        // Store the entire module so we can access named exports (ZoomMode, SpreadMode, etc.)
                        w[this.static_module_key] = mod;
                        return mod;
                    }
                } catch (e) {
                    lastErr = e;
                }
            }
            throw lastErr || new Error('embedpdf-load-failed');
        })();

        return w[this.static_loader_key];
    }

    private normalize_src(src: string): string {
        // Keep src as-is; EmbedPDF can load URLs and we also rely on existing #page fragments.
        return src || '';
    }

    private coerce_page(value: any): number | null {
        const n = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
        if (!isFinite(n) || n < 1) return null;
        return Math.floor(n);
    }

    private page_from_src_hash(src: string): number | null {
        if (!src) return null;
        const idx = src.indexOf('#');
        if (idx === -1) return null;
        const hash = src.slice(idx + 1);
        if (!hash) return null;
        try {
            // Treat the hash as a query string (e.g. "#page=7" or "#view=FitH&page=7").
            const params = new URLSearchParams(hash.startsWith('?') ? hash.slice(1) : hash);
            return this.coerce_page(params.get('page'));
        } catch (e) {
            return null;
        }
    }

    private get_requested_page(): number | null {
        // Prefer #page=N in the URL (covers deep links), otherwise fall back to binding.
        // This also avoids transient mismatches when `src` and `page` update out of order.
        return this.page_from_src_hash(this.src) || this.coerce_page(this.page);
    }

    private async ensure_scroll_api(token: number): Promise<any | null> {
        if (token !== this.token) return null;
        if (this.scroll_api) return this.scroll_api;
        if (!this.viewer_el || !this.viewer_el.registry) return null;
        try {
            const registry = await this.viewer_el.registry;
            if (token !== this.token) return null;
            this.registry = registry;
            const scroll = registry && registry.getPlugin ? registry.getPlugin('scroll')?.provides?.() : null;
            if (scroll) {
                this.scroll_api = scroll;
                return scroll;
            }
        } catch (e) { }
        return null;
    }

    private async scroll_to_page_when_ready(
        pageNumber: number,
        behavior: 'instant' | 'smooth' = 'instant',
        waitForLayout: boolean = false
    ) {
        const token = this.token;
        const page = this.coerce_page(pageNumber);
        if (!page) return;

        const scroll = await this.ensure_scroll_api(token);
        if (!scroll || token !== this.token) return;

        const doScroll = (documentId?: string) => {
            try {
                if (documentId && typeof scroll.forDocument === 'function') {
                    const docScroll = scroll.forDocument(documentId);
                    if (docScroll && typeof docScroll.scrollToPage === 'function') {
                        docScroll.scrollToPage({ pageNumber: page, behavior });
                        return;
                    }
                }
                if (typeof scroll.scrollToPage === 'function') {
                    scroll.scrollToPage({ pageNumber: page, behavior });
                }
            } catch (e) { }
        };

        // For page 1, we don't need to do anything special.
        if (page === 1) return;

        // IMPORTANT: On initial load, scrollToPage can silently do nothing until layout is ready.
        // So we always wait for onLayoutReady when requested.
        if (waitForLayout && typeof scroll.onLayoutReady === 'function') {
            // Replace any previous layout listener for this viewer instance.
            if (this.scroll_layout_unsub) {
                try { this.scroll_layout_unsub(); } catch (e) { }
                this.scroll_layout_unsub = null;
            }

            const unsub = scroll.onLayoutReady((event: any) => {
                if (token !== this.token) {
                    try { unsub(); } catch (e) { }
                    return;
                }
                doScroll(event && event.documentId ? event.documentId : undefined);
                try { unsub(); } catch (e) { }
            });
            this.scroll_layout_unsub = () => {
                try { unsub && unsub(); } catch (e) { }
            };
        }

        // Best-effort immediate scroll (helps if layout is already ready).
        doScroll();
    }

    private async mount(resetScroll: boolean) {
        const token = ++this.token;
        this.loading = true;
        this.error = '';

        if (resetScroll) {
            this.scroll_to_top();
        }

        if (!this.container || !this.src) {
            this.loading = false;
            return;
        }

        // Capture the initial requested page (from binding or from #page=... hash).
        const initial_page = this.get_requested_page();
        // Debug (disabled): show which page we intend to open.
        // if (initial_page && initial_page > 1) {
        //     try {
        //         alert(`PDF: trying to open page ${initial_page}`);
        //     } catch (e) { }
        // }

        // Replace any existing viewer instance (cleanest lifecycle approach).
        this.unmount();
        this.pending_page = initial_page;

        try {
            const mod = await this.ensure_embedpdf();
            if (token !== this.token) return;

            const EmbedPDF = mod && mod.default ? mod.default : mod;
            const ZoomMode = mod && (mod as any).ZoomMode ? (mod as any).ZoomMode : null;
            const SpreadMode = mod && (mod as any).SpreadMode ? (mod as any).SpreadMode : null;

            const cfg: any = {
                type: 'container',
                target: this.container,
                src: this.normalize_src(this.src),
                worker: true,
                // Ensure the document fills the viewer width (fixes the "50% width" look).
                zoom: {
                    defaultZoomLevel: ZoomMode ? ZoomMode.FitWidth : 'fit-width'
                },
                // Explicitly ensure we don't start in a two-page spread.
                spread: {
                    defaultSpreadMode: SpreadMode ? SpreadMode.None : 'none'
                },
                theme: { preference: 'system' }
            };

            // EmbedPDF.init returns an EmbedPdfContainer (web component). Removing it from DOM cleans up.
            this.viewer_el = EmbedPDF.init(cfg);

            // Honor "#page=N" (or bound `page`) by scrolling once the layout is ready.
            if (this.pending_page && this.pending_page > 1) {
                // Wait for layout-ready; calling scrollToPage too early can be ignored.
                this.scroll_to_page_when_ready(this.pending_page, 'instant', true);
            }
        } catch (e) {
            // Keep the message short and actionable.
            this.error = 'Cannot load PDF viewer. Check network/CSP for cdn.jsdelivr.net.';
            // eslint-disable-next-line no-console
            console.error('EmbedPDF init failed', e);
        } finally {
            if (token === this.token) {
                this.loading = false;
            }
        }
    }
}

