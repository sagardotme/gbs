import { autoinject, computedFrom } from 'aurelia-framework';
import { DialogController } from 'aurelia-dialog';
import { MemberGateway } from '../services/gateway';
import { I18N } from 'aurelia-i18n';
import { Theme } from '../services/theme';
import * as download from 'downloadjs';

@autoinject
export class QrPhoto {
    api;
    theme: Theme;
    i18n: I18N;
    controller: DialogController;
    data = {
        width: null,
        height: null,
        position: 'se',
        photo_id: null,
        shortcut: null
    }
    message = '';
    message_type = '';
    done = false;
    qpositions = ["ne", "se", "sw", "nw"]

    constructor(api: MemberGateway, theme: Theme, controller: DialogController, i18n: I18N) {
        this.api = api;
        this.controller = controller;
        this.i18n = i18n;
        this.theme = theme;
    }

    activate(params) {
        this.data.photo_id = params.photo_id;
        this.data.shortcut = this.with_protocol(params.shortcut);
    }

    set_qposition(qp) {
        this.data.position = qp;
    }

    save() {
        if (this.disabled_if) return;
        this.data.shortcut = this.with_protocol(this.data.shortcut);
        this.api.call_server_post('photos/create_qr_photo', {data: this.data})
        .then(response => {
            let download_url = response.download_url;
            console.log('download url: ', download_url);
            if (download_url)
                download(download_url);
            this.controller.ok();
        });
    }

    with_protocol(url) {
        if (!url || /^https?:\/\//i.test(url)) return url;
        if (url[0] == '/') return location.origin + url;
        return 'https://' + url;
    }

    cancel() {
        this.controller.cancel();
    }

    @computedFrom('data.width', 'data.height')
    get disabled_if() {
        let ready = this.data.width || this.data.height;
        return ready ? '' : 'disabled';
    }

    changed(what) {
        if (what == 'width') {
            this.data.height = null
        } else {
            this.data.width = null
        }
    }


}
