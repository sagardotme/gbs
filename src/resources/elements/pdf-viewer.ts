import { autoinject, bindable, bindingMode } from 'aurelia-framework';

declare const require: any;

type PdfJsLib = any;
type PdfDocument = any;
type PdfPage = any;

interface PageState {
    pageNumber: number;
    el: HTMLElement;
    canvas: HTMLCanvasElement;
    renderedAtWidth: number;
    rendering: boolean;
    rendered: boolean;
}

@autoinject()
export class PdfViewer {
    @bindable({ defaultBindingMode: bindingMode.oneWay }) src: string;
    @bindable({ defaultBindingMode: bindingMode.oneWay }) page: number;

    scroll_host: HTMLElement;
    pages_host: HTMLElement;

    loading = false;
    error: string = '';

    private pdfjs: PdfJsLib = null;
    private pdfDoc: PdfDocument = null;
    private token = 0;
    private pageStates: PageState[] = [];
    private io: IntersectionObserver = null;
    private resizeObserver: any = null;
    private renderQueue: number[] = [];
    private renderActive = false;
    private lastWidth = 0;

    attached() {
        this.load(true);
        this.setupObservers();
    }

    detached() {
        this.token++;
        this.cleanup();
    }

    srcChanged() {
        this.load(true);
    }

    pageChanged(newValue: number) {
        if (!newValue || !this.pageStates || this.pageStates.length === 0) return;
        this.scrollToPage(newValue);
    }

    private setupObservers() {
        // ResizeObserver: when width changes, re-render visible pages for correct fit
        const AnyResizeObserver = (window as any).ResizeObserver;
        if (AnyResizeObserver && this.scroll_host) {
            this.resizeObserver = new AnyResizeObserver(() => {
                const w = this.getTargetWidth();
                if (!w) return;
                // Avoid thrashing if width didn't change meaningfully
                if (Math.abs(w - this.lastWidth) < 2) return;
                this.lastWidth = w;
                this.invalidateAllPages();
                this.renderVisiblePages();
            });
            this.resizeObserver.observe(this.scroll_host);
        }
    }

    private cleanup() {
        if (this.io) {
            try { this.io.disconnect(); } catch (e) { }
            this.io = null;
        }
        if (this.resizeObserver) {
            try { this.resizeObserver.disconnect(); } catch (e) { }
            this.resizeObserver = null;
        }
        this.renderQueue = [];
        this.renderActive = false;
        this.pageStates = [];
        if (this.pages_host) {
            this.pages_host.innerHTML = '';
        }
        if (this.pdfDoc) {
            try { this.pdfDoc.destroy(); } catch (e) { }
            this.pdfDoc = null;
        }
    }

    private async ensurePdfjs(): Promise<PdfJsLib> {
        if (this.pdfjs) return this.pdfjs;
        return new Promise((resolve, reject) => {
            require(
                ['pdfjs-dist/build/pdf'],
                (lib: any) => {
                    const pdfjsLib = lib && lib.default ? lib.default : lib;
                    // Worker file is copied into `scripts/` by aurelia_project/aurelia.json build.copyFiles.
                    // IMPORTANT: In this app, RequireJS baseUrl is usually `src/`, while the worker is served from `scripts/`.
                    // So we must set an absolute URL (relative to document.baseURI), not require.toUrl() relative to module id.
                    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
                        let workerUrl = '';
                        try {
                            workerUrl = new URL('scripts/pdf.worker.min.js', document.baseURI).toString();
                        } catch (e) {
                            workerUrl = 'scripts/pdf.worker.min.js';
                        }
                        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                    }
                    this.pdfjs = pdfjsLib;
                    resolve(pdfjsLib);
                },
                (err: any) => reject(err)
            );
        });
    }

    private getTargetWidth(): number {
        if (!this.scroll_host) return 0;
        const w = this.scroll_host.clientWidth || 0;
        // Leave a small margin so the page shadow doesn't clip
        return Math.max(0, w - 16);
    }

    private buildPagePlaceholders(numPages: number) {
        this.pageStates = [];
        if (!this.pages_host) return;
        this.pages_host.innerHTML = '';

        for (let i = 1; i <= numPages; i++) {
            const pageEl = document.createElement('div');
            pageEl.className = 'pdf-page';
            pageEl.setAttribute('data-page', String(i));

            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-canvas';
            pageEl.appendChild(canvas);

            this.pages_host.appendChild(pageEl);
            this.pageStates.push({
                pageNumber: i,
                el: pageEl,
                canvas,
                renderedAtWidth: 0,
                rendering: false,
                rendered: false
            });
        }
    }

    private setupIntersectionObserver() {
        if (!this.scroll_host || !(window as any).IntersectionObserver) {
            // Fallback: just render first page
            this.requestRender(1);
            return;
        }
        if (this.io) {
            try { this.io.disconnect(); } catch (e) { }
        }
        this.io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const target = entry.target as HTMLElement;
                    const pageStr = target.getAttribute('data-page') || '';
                    const pageNum = parseInt(pageStr, 10);
                    if (pageNum) this.requestRender(pageNum);
                }
            },
            {
                root: this.scroll_host,
                rootMargin: '600px 0px',
                threshold: 0.01
            }
        );
        for (const st of this.pageStates) {
            this.io.observe(st.el);
        }
    }

    private invalidateAllPages() {
        for (const st of this.pageStates) {
            st.rendered = false;
            st.renderedAtWidth = 0;
            st.rendering = false;
        }
    }

    private renderVisiblePages() {
        if (!this.scroll_host) return;
        // Trigger a render request for pages currently in view (+ a little buffer)
        const top = this.scroll_host.scrollTop;
        const bottom = top + this.scroll_host.clientHeight;
        for (const st of this.pageStates) {
            const y = st.el.offsetTop;
            const h = st.el.offsetHeight || 0;
            if (y + h >= top - 600 && y <= bottom + 600) {
                this.requestRender(st.pageNumber);
            }
        }
    }

    private requestRender(pageNumber: number) {
        const st = this.pageStates[pageNumber - 1];
        if (!st) return;
        const targetWidth = this.getTargetWidth();
        if (!targetWidth) return;
        if (st.rendered && Math.abs(st.renderedAtWidth - targetWidth) < 2) return;
        if (st.rendering) return;
        if (this.renderQueue.indexOf(pageNumber) >= 0) return;

        this.renderQueue.push(pageNumber);
        this.drainRenderQueue();
    }

    private async drainRenderQueue() {
        if (this.renderActive) return;
        this.renderActive = true;
        const token = this.token;
        try {
            while (this.renderQueue.length > 0) {
                if (token !== this.token) return;
                const pageNum = this.renderQueue.shift();
                if (!pageNum) continue;
                await this.renderPage(pageNum, token);
            }
        } finally {
            this.renderActive = false;
        }
    }

    private async renderPage(pageNumber: number, token: number) {
        if (!this.pdfDoc) return;
        const st = this.pageStates[pageNumber - 1];
        if (!st) return;
        const targetWidth = this.getTargetWidth();
        if (!targetWidth) return;

        st.rendering = true;
        try {
            const page: PdfPage = await this.pdfDoc.getPage(pageNumber);
            if (token !== this.token) return;

            const viewport1 = page.getViewport({ scale: 1 });
            const scale = viewport1.width ? (targetWidth / viewport1.width) : 1;
            const viewport = page.getViewport({ scale });

            const dpr = window.devicePixelRatio || 1;
            const canvas = st.canvas;
            const ctx = canvas.getContext('2d', { alpha: false }) as any;
            if (!ctx) return;

            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;

            // Render at device pixel ratio for crisp text on mobile
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const renderTask = page.render({ canvasContext: ctx, viewport });
            await renderTask.promise;

            st.rendered = true;
            st.renderedAtWidth = targetWidth;
        } catch (e: any) {
            // Keep going; a single page render failure shouldn't break the viewer
            console.warn('PDF render page failed', { pageNumber, e });
        } finally {
            st.rendering = false;
        }
    }

    private scrollToPage(pageNumber: number) {
        const st = this.pageStates[pageNumber - 1];
        if (!st || !this.scroll_host) return;
        const top = Math.max(0, st.el.offsetTop - 8);
        try {
            this.scroll_host.scrollTo({ top, behavior: 'auto' as ScrollBehavior });
        } catch (e) {
            this.scroll_host.scrollTop = top;
        }
        // Make sure it gets rendered promptly
        this.requestRender(pageNumber);
    }

    private parsePageFromSrc(src: string): number {
        if (!src) return 0;
        const m = src.match(/[#&]page=(\d+)/);
        if (!m) return 0;
        const n = parseInt(m[1], 10);
        return isNaN(n) ? 0 : n;
    }

    private normalizeUrlForFetch(src: string): string {
        if (!src) return '';
        // Strip fragment; it is client-side only and can confuse some loaders.
        const hashIdx = src.indexOf('#');
        return hashIdx >= 0 ? src.slice(0, hashIdx) : src;
    }

    private isSameOrigin(url: string): boolean {
        try {
            const u = new URL(url, window.location.href);
            return u.origin === window.location.origin;
        } catch (e) {
            // Relative URLs
            return true;
        }
    }

    private async load(reset: boolean) {
        const token = ++this.token;
        this.loading = true;
        this.error = '';

        if (reset) {
            this.cleanup();
        }

        if (!this.src) {
            this.loading = false;
            return;
        }

        try {
            const pdfjs = await this.ensurePdfjs();
            if (token !== this.token) return;

            const fullSrc = this.src;
            const url = this.normalizeUrlForFetch(fullSrc);
            const sameOrigin = this.isSameOrigin(url);

            // Try a few options for maximum compatibility across servers (range requests, auth, worker availability).
            const tryGetDoc = async (opts: any) => {
                const task = pdfjs.getDocument(opts);
                return await task.promise;
            };

            let pdf: any = null;
            try {
                pdf = await tryGetDoc({ url, withCredentials: sameOrigin });
            } catch (e1: any) {
                // Some servers choke on range/stream requests → retry with those disabled
                try {
                    pdf = await tryGetDoc({
                        url,
                        withCredentials: sameOrigin,
                        disableRange: true,
                        disableStream: true,
                        disableAutoFetch: true
                    });
                } catch (e2: any) {
                    // Worker might be missing/blocked (CSP). Retry without worker.
                    try {
                        pdf = await tryGetDoc({
                            url,
                            withCredentials: sameOrigin,
                            disableWorker: true,
                            disableRange: true,
                            disableStream: true,
                            disableAutoFetch: true
                        });
                    } catch (e3: any) {
                        throw e3 || e2 || e1;
                    }
                }
            }
            if (token !== this.token) {
                try { pdf.destroy(); } catch (e) { }
                return;
            }
            this.pdfDoc = pdf;
            this.buildPagePlaceholders(pdf.numPages || 1);
            this.setupIntersectionObserver();

            // Render first visible pages quickly
            this.lastWidth = this.getTargetWidth();
            this.renderVisiblePages();

            const targetPage = this.page || this.parsePageFromSrc(fullSrc) || 1;
            if (targetPage > 1) {
                // Wait one frame so layout has offsets
                requestAnimationFrame(() => this.scrollToPage(targetPage));
            }
        } catch (e: any) {
            console.error('PDF load failed', e);
            // Show a helpful message; still keep it short for UI.
            if (e && e.requireModules) {
                this.error = 'PDF viewer not installed. Run: yarn install';
            } else if (e && e.message) {
                this.error = e.message;
            } else {
                this.error = 'Failed to load PDF';
            }
        } finally {
            if (token === this.token) {
                this.loading = false;
            }
        }
    }
}

