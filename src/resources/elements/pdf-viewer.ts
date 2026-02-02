import { autoinject, bindable, bindingMode } from 'aurelia-framework';

type EmbedPdfModule = any;

@autoinject()
export class PdfViewer {
    @bindable({ defaultBindingMode: bindingMode.oneWay }) src: string;
    @bindable({ defaultBindingMode: bindingMode.oneWay }) page: number;

    container: HTMLElement;

    loading = false;
    error: string = '';

    private token = 0;
    private viewer_el: any = null;

    private static_module_key = '__gbs_embedpdf_module__';
    private static_loader_key = '__gbs_embedpdf_loader_promise__';

    attached() {
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
        // Best-effort: if the viewer supports programmatic scrolling, do it after init.
        // Many URLs already contain #page=... from doc_src, so this is usually not needed.
        if (!newValue || newValue < 1) return;
        this.scroll_to_top();
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

        // Replace any existing viewer instance (cleanest lifecycle approach).
        this.unmount();

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

