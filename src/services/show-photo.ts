import { Router } from 'aurelia-router';
import { DialogService } from 'aurelia-dialog';
import { FullSizePhoto } from '../photos/full-size-photo';
import { User } from '../services/user';
import { Misc } from '../services/misc';
import { autoinject, computedFrom } from 'aurelia-framework';

@autoinject
export class ShowPhoto {
    dialog: DialogService;
    user: User;
    misc: Misc;
    router: Router;

    constructor(router: Router, user: User, misc: Misc, dialog: DialogService) {
        this.user = user;
        this.misc = misc;
        this.dialog = dialog;
        this.router = router;
    }

    private normalize_photo_ids(photo_ids, current_photo_id) {
        let seen = new Set();
        let normalized = (photo_ids || [])
            .map(item => item && typeof item === 'object' ? item.photo_id : item)
            .filter(pid => {
                if (pid === null || pid === undefined || pid === '') return false;
                if (seen.has(pid)) return false;
                seen.add(pid);
                return true;
            });
        if (current_photo_id && normalized.findIndex(pid => pid == current_photo_id) < 0) {
            normalized.unshift(current_photo_id);
        }
        return normalized;
    }

    public show(photo, event, photo_ids) {
        if (!photo || !photo.photo_id) {
            if (event) event.stopPropagation();
            return;
        }
        photo_ids = this.normalize_photo_ids(photo_ids, photo.photo_id);
        const photo_url = this.router.generate('photo-detail', {
            id: photo.photo_id, keywords: "", photo_ids: photo_ids,
            pop_full_photo: true, has_story_text: photo.has_story_text
        });
        this.openDialog(photo, event, photo_ids, photo_url);
    }

    private async openDialog(slide, event, photo_ids, photo_url) {
        if (event)
            event.stopPropagation();
        let width = 60;  // section width
        let idx = photo_ids.findIndex(pid => slide.photo_id==pid);
        if (idx < 0) {
            photo_ids.unshift(slide.photo_id);
            idx = 0;
        }
        let start = 0;
        let len = photo_ids.length;
        if (len > width) {
            const half_width = Math.floor(width / 2);
            if (idx <= half_width) {
                start = 0
            } else if (idx >= len - half_width) {
                start = Math.max(0, len - width)
            } else {
                start = Math.max(0, idx - half_width);
            }
        }

        photo_ids = photo_ids.slice(start, start + width)
        let addr = window.location.origin + window.location.pathname;
        addr += `#/photos/${slide.photo_id}/*?`
        let pids = photo_ids.map(pid => `photo_ids%5B%5D=${pid}`);
        let s = pids.join('&') + '&pop_full_photo=true'
        addr += s
        //let shortcut = null;
        this.misc.url_shortcut = addr;
        document.body.classList.add('black-overlay');
        this.dialog.open({
            viewModel: FullSizePhoto,
            model: {
                slide: slide, slide_list: photo_ids,
                hide_details_icon: !(this.user.editing || slide.has_story_text),
                opened_from_detail_page: false,
                list_of_ids: true,
                photo_url: photo_url,
                topic_names: slide.keywords
            }, lock: false
        }).whenClosed(response => {
            document.body.classList.remove('black-overlay');
            this.misc.url_shortcut = null;  //delete it
        });
    }


}
