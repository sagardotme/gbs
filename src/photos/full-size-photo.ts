import { MemberGateway } from '../services/gateway';
import { Router } from 'aurelia-router';
import { DialogController, DialogService } from 'aurelia-dialog';
import { autoinject, computedFrom } from 'aurelia-framework';
import { User } from "../services/user";
import { Misc } from '../services/misc';
import { Theme } from "../services/theme";
import { MemberPicker } from "../members/member-picker";
import { ArticlePicker } from "../articles/article-picker";
import environment from "../environment";
import { EventAggregator } from 'aurelia-event-aggregator';
import { copy_to_clipboard } from "../services/dom_utils";
import { I18N } from 'aurelia-i18n';
import { FaceInfo } from './face-info';
import { QrPhoto } from './qr-photo';
import * as toastr from 'toastr';
import { Popup } from '../services/popups';

let THIS;

@autoinject()
export class FullSizePhoto {
    dialogController;
    dialogService;
    baseURL;
    faces = [];
    articles = [];
    current_face;
    candidates = [];
    faces_already_identified = new Set();
    articles_already_identified = new Set();
    api;
    user;
    theme;
    misc: Misc;
    model;
    slide;
    curr_photo_id;
    slide_list = [];
    slide_index = 0;
    photo_info = { name: "", photo_date_str: "", photo_date_datespan: 0, photographer: "", photographer_known: true };
    router;
    highlighting = false;
    eventAggregator;
    marking_face_active = false;
    i18n;
    highlight_all;
    fullscreen;
    jump_to_story_page;
    copy_photo_url_text;
    flip_text;
    navEvent;
    cropping = false;
    crop_height;
    crop_width;
    crop_top;
    crop_left;
    crop;
    save_crop;
    cancel_crop;
    mark_articles_text;
    mark_people_text;
    nobody_there;
    crop_sides;
    rotate;
    photo_detail;
    create_qr_photo_txt;
    share_on_facebook_txt;
    next_slide_txt;
    prev_slide_txt;
    no_new_faces = false;
    settings = {};
    fullscreen_mode = false;
    fullscreen_height = 0;
    fullscreen_width = 0;
    fullscreen_margin = 0;
    fullscreen_top_margin = 0;
    can_go_forward = false;
    can_go_backward = false;
    list_of_ids = false;
    marking_articles = false;
    hint_position = 'right';
    photo_date_valid = "";
    image_height = 0;
    image_width = 0;
    keypress_handler;
    popup: Popup;
    topic_names;
    photo_url;
    resize_handler;
    show_circles_timeout;
    zoom_level = 1;
    zoom_min = 0.3; // Allow zooming out below container size
    zoom_max = 5;
    zoom_step = 0.1;
    zoom_step_touch = 0.3; // Larger step for touch/button interactions
    zoom_center_x = 0;
    zoom_center_y = 0;
    is_zooming = false;
    last_touch_distance = 0;
    is_panning = false;
    pan_start_x = 0;
    pan_start_y = 0;
    pan_current_x = 0;
    pan_current_y = 0;
    wheel_handler;
    touch_start_handler;
    touch_move_handler;
    touch_end_handler;
    pan_start_handler;
    pan_move_handler;
    pan_end_handler;
    container_translate_x = 0;
    container_translate_y = 0;

    constructor(dialogController: DialogController,
        dialogService: DialogService,
        api: MemberGateway,
        user: User,
        theme: Theme,
        misc: Misc,
        router: Router,
        eventAggregator: EventAggregator,
        i18n: I18N,
        popup: Popup) {
        this.dialogController = dialogController;
        this.dialogService = dialogService;
        this.api = api;
        this.user = user;
        this.theme = theme;
        this.misc = misc;
        this.router = router;
        this.eventAggregator = eventAggregator;
        this.i18n = i18n;
        this.popup = popup;
        this.highlight_all = this.i18n.tr('photos.highlight-all');
        this.crop = this.i18n.tr('photos.crop');
        this.rotate = this.i18n.tr('photos.rotate-photo');
        this.photo_detail = this.i18n.tr('photos.photo-detail');
        this.create_qr_photo_txt = this.i18n.tr('photos.create-qr-photo')
        this.save_crop = this.i18n.tr('photos.save-crop');
        this.cancel_crop = this.i18n.tr('photos.cancel-crop');
        this.share_on_facebook_txt = this.i18n.tr('user.sharing.share-on-facebook');
        this.nobody_there = this.i18n.tr('photos.nobody-there');
        this.next_slide_txt = this.i18n.tr('photos.next-slide')
        this.prev_slide_txt = this.i18n.tr('photos.prev-slide')
        this.jump_to_story_page = this.i18n.tr('photos.jump-to-story-page');
        this.fullscreen = this.i18n.tr('photos.fullscreen');
        this.copy_photo_url_text = this.i18n.tr('photos.copy-photo-url');
        this.flip_text = this.i18n.tr('photos.flip');
        this.mark_people_text = this.i18n.tr('photos.mark-people');
        this.mark_articles_text = this.i18n.tr('photos.mark-articles');
        THIS = this;
        this.keypress_handler = function (event) {
            THIS.navigate(event);
        };
    }

    activate(model) {
        this.model = model;
        model.final_rotation = 0;
        this.slide = model.slide;
        this.slide_list = model.slide_list || [];
        this.settings = model.settings || {};
        this.list_of_ids = model.list_of_ids;
        this.topic_names = model.topic_names;
        this.baseURL = environment.baseURL;
        this.photo_url = model.photo_url;
        document.addEventListener('keyup', this.keypress_handler);
    }

    deactivate() {
        this.theme.hide_title = false;
        document.removeEventListener('keyup', this.keypress_handler);
        if (this.resize_handler) {
            window.removeEventListener('resize', this.resize_handler);
        }
        // Clear any pending timeout for showing circles
        if (this.show_circles_timeout) {
            clearTimeout(this.show_circles_timeout);
            this.show_circles_timeout = null;
        }
        // Remove zoom event handlers
        this.remove_zoom_handlers();
        // Reset zoom on deactivate
        this.reset_zoom();
    }

    navigate(event) {
        let el = document.getElementById('photo-image');
        if (el)
            el.style.transform = null;
        event.stopPropagation();
        let key = event.key;
        
        // Move photo-faces-container with arrow keys
        const moveStep = 20; // pixels to move per keypress
        let container = document.querySelector('.photo-faces-container') as HTMLElement;
        
        if (key == 'ArrowRight') {
            if (event.shiftKey || event.ctrlKey || event.metaKey) {
                // With modifier key, navigate to next slide
                this.next_slide(event);
            } else {
                // Without modifier, move container right
                if (container) {
                    this.container_translate_x += moveStep;
                    this.apply_container_transform(container);
                }
            }
        } else if (key == 'ArrowLeft') {
            if (event.shiftKey || event.ctrlKey || event.metaKey) {
                // With modifier key, navigate to prev slide
                this.prev_slide(event);
            } else {
                // Without modifier, move container left
                if (container) {
                    this.container_translate_x -= moveStep;
                    this.apply_container_transform(container);
                }
            }
        } else if (key == 'ArrowDown') {
            if (container) {
                this.container_translate_y += moveStep;
                this.apply_container_transform(container);
            }
        } else if (key == 'ArrowUp') {
            if (container) {
                this.container_translate_y -= moveStep;
                this.apply_container_transform(container);
            }
        }
    }
    
    apply_container_transform(container: HTMLElement) {
        if (container) {
            // Combine container translation with zoom pan and scale if zoomed
            const totalX = this.container_translate_x + (this.zoom_level > 1 ? this.pan_current_x : 0);
            const totalY = this.container_translate_y + (this.zoom_level > 1 ? this.pan_current_y : 0);
            
            if (this.zoom_level > 1) {
                container.style.transform = `translate(${totalX}px, ${totalY}px) scale(${this.zoom_level})`;
            } else {
                container.style.transform = `translate(${this.container_translate_x}px, ${this.container_translate_y}px)`;
            }
        }
    }

    attached() {
        let idx = this.slide_idx();
        this.can_go_forward = idx + 1 < this.slide_list.length;
        this.can_go_backward = idx > 0;
        let pid = this.slide[this.slide.side].photo_id;
        if (!pid) {
            pid = this.slide.photo_id;
            console.log("no photo id in ", this.slide.side, " photo id: ", pid);
        }
        this.get_faces(pid);
        this.get_articles(pid);
        this.get_photo_info(pid);
        this.api.hit('PHOTO', pid);
        if (this.user.editing && !this.highlighting)
            this.toggle_highlighting(null);
        
        // Set up resize observer for label overlap detection
        this.setup_label_overlap_detection();
        // Set up zoom handlers
        this.setup_zoom_handlers();
        // Position zoom controls relative to photo
        this.position_zoom_controls();
    }

    detached() {

    }

    get_faces(photo_id) {
        this.faces = [];
        this.faces_already_identified = new Set();
        this.api.call_server('photos/get_faces', { photo_id: photo_id })
            .then((data) => {
                this.faces = data.faces;
                for (let face of this.faces) {
                    if (this.current_face)
                        if (face.member_id==this.current_face.member_id)
                            continue;
                    face.name = '<span dir="rtl">' + face.name + '</span>';
                    this.faces_already_identified.add(face.member_id);
                }
                this.candidates = data.candidates;
                // Labels will be adjusted when circles are shown (with delay)
            });
    }

    get_articles(photo_id) {
        this.articles = [];
        this.articles_already_identified = new Set();
        this.api.call_server('photos/get_articles', { photo_id: photo_id })
            .then((data) => {
                this.articles = data.articles;
                for (let article of this.articles) {
                    article.name = '<span dir="rtl">' + article.name + '</span>';
                    this.articles_already_identified.add(article.article_id);
                }
                // Labels will be adjusted when circles are shown (with delay)
            });
    }

    get_photo_info(photo_id) {
        this.api.call_server('photos/get_photo_info', { photo_id: photo_id })
            .then((data) => {
                this.photo_info.name = data.name;
                this.photo_info.photographer = data.photographer;
                this.photo_info.photographer_known = Boolean(this.photo_info.photographer);
                if (!this.photo_info.photographer_known) {
                    this.photo_info.photographer = this.i18n.tr('photos.unknown-photographer');
                }
                this.photo_info.photo_date_datespan = data.photo_date_datespan;
                this.photo_info.photo_date_str = data.photo_date_str;
                this.misc.keep_photo_id(this.slide.photo_id);
            });

    }

    save_photo_info(event) {
        event.stopPropagation();
        if (this.photo_date_valid != 'valid') return;
        let pi = event.detail;
        this.photo_info.photo_date_str = pi.date_str;
        this.photo_info.photo_date_datespan = pi.date_span;
        this.api.call_server_post('photos/save_photo_info', {
            user_id: this.user.id,
            photo_id: this.slide.photo_id,
            photo_info: this.photo_info
        });
        return false;
    }

    save_photo_caption(event) {
        this.api.call_server_post('photos/save_photo_info', {
            user_id: this.user.id,
            photo_id: this.slide.photo_id,
            photo_info: this.photo_info
        });
    }

    // Helper function to get the actual displayed image dimensions
    // This is critical - we must use the image element's dimensions, not the container's,
    // because the container can expand when there are many shapes with labels
    private getImageDisplayDimensions(): { width: number, height: number } | null {
        const img = document.querySelector('.photo-faces-container img') as HTMLImageElement;
        if (!img) return null;
        
        // Use naturalWidth/naturalHeight for original dimensions
        // Use offsetWidth/offsetHeight for displayed dimensions
        const displayedWidth = img.offsetWidth || img.clientWidth;
        const displayedHeight = img.offsetHeight || img.clientHeight;
        
        if (displayedWidth > 0 && displayedHeight > 0) {
            return { width: displayedWidth, height: displayedHeight };
        }
        return null;
    }

    // Helper function to calculate scale factor from displayed image to original image
    private getScaleFactor(): number {
        const originalWidth = this.slide[this.slide.side].width;
        if (!originalWidth || originalWidth <= 0) return 1;
        
        const imgDims = this.getImageDisplayDimensions();
        if (!imgDims) return 1;
        
        // Use actual image display width, not container width
        return imgDims.width / originalWidth;
    }

    face_location(face) {
        let d = face.r * 2;
        let pw = this.slide[this.slide.side].width;
        let ph = this.slide[this.slide.side].height;
        
        // Validate dimensions to prevent division by zero or invalid calculations
        if (!pw || !ph || pw <= 0 || ph <= 0) {
            console.warn('Invalid image dimensions for face positioning', { pw, ph, face });
            // Return safe default values
            return {
                left: '0%',
                top: '0%',
                width: '0%',
                height: '0%',
                'background-color': face.action ? "rgba(100, 100,0, 0.2)" : "rgba(0, 0, 0, 0)",
                cursor: face.moving ? "move" : "hand",
                position: 'absolute'
            };
        }
        
        // Use percentage-based positioning for responsive scaling
        // Face coordinates (x, y, r) are in original image pixel coordinates (like .bak)
        // Convert to percentages so shapes scale with responsive images
        return {
            left: ((face.x - face.r) / pw * 100) + '%',
            top: ((face.y - face.r) / ph * 100) + '%',
            width: (d / pw * 100) + '%',
            height: (d / ph * 100) + '%',
            'background-color': face.action ? "rgba(100, 100,0, 0.2)" : "rgba(0, 0, 0, 0)",
            cursor: face.moving ? "move" : "hand",
            position: 'absolute'
        };
    }

    copy_photo_url(event) {
        event.stopPropagation();
        let src = this.slide[this.slide.side].src;
        let photo_id = this.slide[this.slide.side].photo_id;
        copy_to_clipboard(src);
        this.user.set_photo_link(src, photo_id);
        let msg = this.i18n.tr('user.sharing.photo-link-copied');
        toastr.success(msg)
        return false;
    }

    flip_photo(event) {
        event.stopPropagation();
        // Hide circles immediately when flipping
        if (this.highlighting) {
            let el = document.getElementById("full-size-photo");
            if (el) {
                el.classList.remove("highlight-faces");
            }
        }
        
        // Clear any pending timeout
        if (this.show_circles_timeout) {
            clearTimeout(this.show_circles_timeout);
            this.show_circles_timeout = null;
        }
        
        // Reset zoom when flipping
        this.reset_zoom();
        
        this.slide.side = (this.slide.side == 'front') ? 'back' : 'front';
        // Show circles after 1 second (will be triggered by image_loaded, but ensure it happens)
        // image_loaded will handle the delay and wait for image to render
        return false;
    }

    handle_article(article, event, index) {
        event.stopPropagation();
        if (!this.user.editing) {
            this.jump_to_article(article.article_id);
            return;
        }
        if (event.altKey && event.shiftKey) {
            this.remove_article(article);
            return;
        }
        this.assign_article(article);
    }

    handle_face(face, event, index) {
        event.stopPropagation();
        if (!this.user.editing) {
            this.jump_to_member(face.member_id);
            return;
        }
        if (event.altKey && event.shiftKey) {
            this.remove_face(face);
            return;
        }
        this.assign_member(face);
    }

    assign_face_or_member(face) {
        if (face.article_id)
            this.assign_article(face)
        else
            this.assign_member(face)
    }

    assign_article(article) {
        this.dialogService.open({
            viewModel: ArticlePicker,
            model: {
                face_identifier: true,
                article_id: article.article_id,
                excluded: this.articles_already_identified,
                slide: this.slide,
                current_face: this.current_face
            }, lock: false
        })
            .whenClosed(response => {
                this.marking_face_active = false;
                if (response.wasCancelled) {
                    if (!article.article_id) {
                        this.hide_face(article);
                    }
                    //this.remove_face(article); !!! no!
                    return;
                }
                let old_article_id = article.article_id;
                let mi = (response.output && response.output.new_article) ? response.output.new_article.article_info : null;
                if (mi) {
                    article.name = article.article_id ? mi.name : mi.first_name + ' ' + mi.last_name;
                    article.article_id = response.output.new_article.article_info.id;
                    return;
                }
                article.article_id = response.output.article_id;
                let make_profile_photo = response.output.make_profile_photo;
                this.api.call_server_post('photos/save_article', {
                    face: article,
                    make_profile_photo: make_profile_photo,
                    old_article_id: old_article_id
                })
                    .then(response => {
                        article.name = response.article_name;
                        this.eventAggregator.publish('ArticleGotProfilePhoto', {
                            article_id: article.article_id,
                            face_photo_url: response.face_photo_url
                        });
                    });
            });

    }

    assign_member(face) {
        let excluded = this.faces_already_identified;
        if (excluded) excluded.delete(face.member_id);
        this.dialogService.open({
            viewModel: MemberPicker,
            model: {
                what: 'face',
                face_identifier: true,
                member_id: face.member_id,
                candidates: this.candidates,
                excluded: excluded,
                current_face: this.current_face,
                help_topic: "pick-member"
            }, lock: false
        })
            .whenClosed(response => {
                this.marking_face_active = false;
                if (response.wasCancelled) {
                    if (!face.member_id) {
                        this.hide_face(face);
                    }
                    //this.remove_face(face); !!! no!
                    return;
                }
                let old_member_id = face.member_id;
                let mi = (response.output && response.output.new_member) ? response.output.new_member.member_info : null;
                if (mi) {
                    face.name = mi.first_name + ' ' + mi.last_name;
                    face.member_id = response.output.new_member.member_info.id;
                    return;
                }
                face.member_id = response.output.member_id;
                let make_profile_photo = response.output.make_profile_photo;
                this.api.call_server_post('photos/save_face', {
                    face: face,
                    make_profile_photo: make_profile_photo,
                    old_member_id: old_member_id
                })
                    .then(response => {
                        let idx = this.candidates.findIndex(m => m.member_id == face.member_id);
                        this.candidates.splice(idx, 1);
                        this.faces_already_identified.add(face.member_id)
                        face.name = response.member_name;
                        this.eventAggregator.publish('MemberGotProfilePhoto', {
                            member_id: face.member_id,
                            face_photo_url: response.face_photo_url
                        });
                    });
            });

    }

    @computedFrom('marking_face_active', 'marking_articles')
    get instruction() {
        if (this.marking_face_active) {
            return this.i18n.tr('photos.edit-face-location')
        } else {
            let s = 'photos.click-to-identify';
            if (this.marking_articles)
                s += '-article';
            return this.i18n.tr(s)
        }
    }

    hide_face(face) {
        let i = this.faces.indexOf(face);
        this.faces.splice(i, 1);
    }

    hide_article(article) {
        let i = this.articles.indexOf(article);
        this.articles.splice(i, 1);
    }

    remove_face(face) {
        if (face.article_id) {
            return this.remove_article(face)
        }
        this.api.call_server_post('photos/detach_photo_from_member', {
            member_id: face.member_id,
            photo_id: this.slide.photo_id
        })
            .then(() => {
                this.hide_face(face);
            });
    }

    remove_article(article) {
        this.api.call_server_post('photos/detach_photo_from_article', {
            article_id: article.article_id,
            photo_id: this.slide.photo_id
        })
            .then(() => {
                this.hide_article(article);
            });
    }

    private jump_to_member(member_id) {
        this.dialogController.ok();
        this.router.navigateToRoute('member-details', { id: member_id, keywords: "" });
    }

    private jump_to_article(article_id) {
        this.dialogController.ok();
        this.router.navigateToRoute('article-details', { id: article_id, keywords: "" });
    }

    mark_face(event) {
        if (this.fullscreen_mode) {
            let width = this.theme.width;
            if (event.offsetX < width / 4) {
                this.prev_slide(event)
            } else if (event.offsetX > width * 3 / 4) {
                this.next_slide(event)
            }
            return;
        }
        if (this.no_new_faces) return;
        if (this.cropping) return;
        event.stopPropagation();
        if (!this.user.editing) {
            return;
        }
        if (this.marking_face_active) {
            return;
        }
        // Get the container and calculate click position relative to it
        let container = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!container) return;
        let containerRect = container.getBoundingClientRect();
        let clickX = event.clientX - containerRect.left;
        let clickY = event.clientY - containerRect.top;
        if (clickX < 15) {
            return;
        }
        let photo_id = this.slide[this.slide.side].photo_id;
        if (!photo_id) {
            photo_id = this.slide.photo_id; //todo: ugly
        }
        // Calculate scale factor using actual image dimensions (not container)
        let scale = this.getScaleFactor();
        // Convert click position to original image coordinates (like .bak stores them)
        let originalX = clickX / scale;
        let originalY = clickY / scale;
        let originalR = 30 / scale; // Default radius in original image coordinates
        let face = {
            photo_id: photo_id,
            x: originalX, y: originalY, r: originalR,
            name: this.i18n.tr("photos.unknown"),
            member_id: this.marking_articles ? 0 : -1,
            article_id: this.marking_articles ? -1 : 0,
            action: null
        };
        this.current_face = face;
        if (this.marking_articles)
            this.articles.push(face)
        else
            this.faces.push(face);
        this.marking_face_active = true;
        return false;
    }

    public dragstart(face, customEvent: CustomEvent, what) {
        if (!this.user.editing) {
            return true;
        }
        customEvent.stopPropagation();
        let face_id = (what == 'face-') ? what + face.member_id : what + face.article_id
        let el = document.getElementById(face_id);
        let rect = el.getBoundingClientRect();
        let face_center = { x: rect.left + rect.width / 2, y: rect.top + rect.width / 2 };
        let event = customEvent.detail;
        let x = event.pageX - face_center.x;
        let y = event.pageY - face_center.y;
        let r = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2))
        r = this.distance(event, face_id)
        // Convert face.r from original image coordinates to displayed coordinates for comparison
        // Use actual image dimensions, not container (container can expand with many shapes)
        let scale = this.getScaleFactor();
        let displayed_r = face.r * scale;
        face.action = (r < displayed_r - 10) ? "moving" : "resizing";
        face.dist = r;
        this.current_face = { x: face.x, y: face.y, r: face.r, dist: face.dist, photo_id: face.photo_id };
    }

    distance(event, face_id) {
        let el = document.getElementById(face_id);
        let rect = el.getBoundingClientRect();
        let face_center = { x: rect.left + rect.width / 2, y: rect.top + rect.width / 2 };
        let x = event.pageX - face_center.x;
        let y = event.pageY - face_center.y;
        return Math.round(Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)))
    }

    public dragmove(face, customEvent: CustomEvent) {
        if (!this.user.editing) {
            return;
        }
        customEvent.stopPropagation();
        let event = customEvent.detail;
        let id = face.article_id ? 'article-' + face.article_id : 'face-' + face.member_id;
        let el = document.getElementById(id);
        let current_face = this.current_face;
        // Calculate scale factor using actual image dimensions (not container)
        let scale = this.getScaleFactor();
        if (face.action === "moving") {
            // Convert drag deltas from displayed coordinates to original image coordinates
            current_face.x += event.dx / scale;
            current_face.y += event.dy / scale;
        } else {
            let dist = this.distance(event, id);
            // Convert distance change from displayed coordinates to original image coordinates
            current_face.r += (dist - current_face.dist) / scale;
            current_face.dist = dist;
        }
        let face_location = this.face_location(current_face);
        el.style.left = face_location.left;
        el.style.top = face_location.top;
        el.style.width = face_location.width;
        el.style.height = face_location.height;
        el.style.backgroundColor = 'lightblue';
        el.style.opacity = "0.6";
        if (face.action == 'moving') {
            el.style.cursor = 'all-scroll';
        } else {
            el.style.cursor = 'se-resize';
        }
    }

    public dragend(face, customEvent: CustomEvent) {
        if (!this.user.editing) {
            return;
        }
        customEvent.stopPropagation();
        let event = customEvent.detail;
        // Calculate scale factor using actual image dimensions (not container)
        let scale = this.getScaleFactor();
        
        if (face.action === "moving") {
            // current_face was already updated in dragmove with converted coordinates
            // Just copy the final position
            face.x = this.current_face.x;
            face.y = this.current_face.y;
        } else {
            // Get the face element ID for distance calculation
            let id = face.article_id ? 'article-' + face.article_id : 'face-' + face.member_id;
            let dist = this.distance(event, id);
            // Convert distance change from displayed coordinates to original image coordinates
            face.r += (dist - face.dist) / scale;
            if (face.r < 18) {
                this.remove_face(face);
            }
        }
        if (face.article_id) {
            this.articles = this.articles.splice(0);
        } else {
            this.faces = this.faces.splice(0);
        }
        this.save_face_location(face);
        face.action = null;
    }

    public drag_move_photo(customEvent: CustomEvent) {
        if (!this.theme.is_desktop) {
            let event = customEvent.detail;
            // Move only photo-faces-container, not the entire full-size-photo
            let container = document.querySelector('.photo-faces-container') as HTMLElement;
            if (container) {
                this.container_translate_x += event.dx;
                this.container_translate_y += event.dy;
                this.apply_container_transform(container);
            }
        }
    }

    public toggle_highlighting(event) {
        this.highlighting = !this.highlighting;
        if (event)
            event.stopPropagation();
        let el = document.getElementById("side-tool highlighter");
        el.blur();
        
        if (this.highlighting) {
            // Show circles with 1 second delay
            this.show_circles_with_delay();
        } else {
            // Hide circles immediately when turning off
            let fullSizePhotoEl = document.getElementById("full-size-photo");
            if (fullSizePhotoEl) {
                fullSizePhotoEl.classList.remove("highlight-faces");
            }
            // Clear any pending timeout
            if (this.show_circles_timeout) {
                clearTimeout(this.show_circles_timeout);
                this.show_circles_timeout = null;
            }
        }
    }

    public crop_photo(event) {
        event.stopPropagation();
        this.crop_height = this.slide[this.slide.side].height;
        this.crop_width = this.slide[this.slide.side].width;
        this.crop_top = 0;
        this.crop_left = 0;
        this.cropping = true;
        return false;
    }

    public save_photo_crop(event) {
        //call server to crop and refresh
        event.stopPropagation();
        let photo_data = this.slide[this.slide.side];
        let photo_id = this.slide[this.slide.side].photo_id || this.slide.photo_id; //temporary bug hider
        this.api.call_server_post('photos/crop_photo', {
            photo_id: photo_id,
            crop_left: this.crop_left,
            crop_top: this.crop_top,
            crop_width: this.crop_width,
            crop_height: this.crop_height
        })
            .then((data) => {
                photo_data.src = data.photo_src;   //to ensure refresh
                photo_data.width = this.crop_width;
                photo_data.height = this.crop_height;
                for (let face of this.faces) {
                    if (!face.x) continue;
                    face.x -= this.crop_left;
                    face.y -= this.crop_top;
                }
                this.faces = this.faces.splice(0);
            });
        this.cropping = false;
    }

    public cancel_photo_crop() {
        //restore crop-width etc. to their initial values
        this.cropping = false;
    }

    public do_crop(customEvent: CustomEvent) {
        let event = customEvent.detail;
        let height = this.slide[this.slide.side].height;
        let width = this.slide[this.slide.side].width;
        if (this.crop_sides == 'nw' || this.crop_sides == 'sw') {
            let crop_left = Math.max(this.crop_left + event.dx, 0)
            let dx = crop_left - this.crop_left;
            this.crop_width -= dx;
            this.crop_left = crop_left;
        }
        if (this.crop_sides == 'nw' || this.crop_sides == 'ne') {
            let crop_top = Math.max(this.crop_top + event.dy, 0)
            let dy = crop_top - this.crop_top;
            this.crop_height -= dy;
            this.crop_top = crop_top;
        }
        if (this.crop_sides == 'ne' || this.crop_sides == 'se') {
            this.crop_width += event.dx;
            this.crop_width = Math.min(this.crop_width, width - this.crop_left);
        }
        if (this.crop_sides == 'sw' || this.crop_sides == 'se') {
            this.crop_height += event.dy;
            this.crop_height = Math.min(this.crop_height, height - this.crop_top);
        }
    }

    public start_crop(customEvent: CustomEvent) {
        customEvent.stopPropagation();
        let event = customEvent.detail;
        let el: HTMLElement = document.getElementById('cropper');
        let rect = el.getBoundingClientRect();
        let we = event.pageX - rect.left < rect.width / 2 ? 'w' : 'e';
        let ns = event.pageY - rect.top < rect.height / 2 ? 'n' : 's';
        this.crop_sides = ns + we;
    }

    rotate_photo(event) {
        event.stopPropagation();
        let rotate_clockwise: boolean = event.ctrlKey;
        let photo_id = this.slide[this.slide.side].photo_id || this.slide.photo_id; //temporary bug hider
        this.api.call_server('photos/rotate_selected_photos', { selected_photo_list: [photo_id], rotate_clockwise: rotate_clockwise })
            .then(result => {
                let angle = rotate_clockwise ? 270 : 90;
                this.model.final_rotation += angle;
                let el = document.getElementById('photo-image');
                el.style.transform = `rotate(-${this.model.final_rotation}deg)`;
            })
        return false;
    }

    async share_on_facebook(event) {
        event.stopPropagation();
        let card_url;
        let img_src = this.slide[this.slide.side].src;
        let photo_id = this.slide[this.slide.side].photo_id;
        await this.api.call_server_post('photos/get_padded_photo_url', { photo_url: img_src, photo_id: photo_id }) //photo_url is deprecated
            .then(response => img_src = response.padded_photo_url);
        let title = this.i18n.tr('app-title');
        let description = this.photo_info.name;
        let hash = (this.photo_url) ? this.photo_url : location.hash;
        let url = `${location.pathname}${hash}`;
        let current_url;
        await this.api.call_server_post('default/get_shortcut', { url: url })
            .then(response => {
                let base_url = `${location.host}`;
                if (base_url == "localhost:9000") {
                    base_url = environment.baseURL;  //for the development system
                }
                current_url = base_url + response.shortcut;
            });
        await this.api.call_server_post('default/make_fb_card',
            { img_src: img_src, url: current_url, title: title, description: description })
            .then(response => {
                card_url = response.card_url;
                // copy_to_clipboard(card_url);
            });
        let href = `https://facebook.com/sharer/sharer.php?u=${card_url}&t=${title}`;
        let width = this.theme.width;
        let left = width - 526 - 200;
        this.popup.popup('SHARER', href, `height=600,width=526,left=${left},top=100`);
    }


    toggle_people_articles(event) {
        event.stopPropagation();
        this.marking_articles = !this.marking_articles;
    }

    nobody(event) {
        event.stopPropagation();
        let unrecognize = event.ctrlKey;
        this.api.call_server('photos/mark_as_recogized', { photo_id: this.slide[this.slide.side].photo_id, unrecognize: unrecognize });
    }

    async create_qr_photo(event) {
        let photo_id = this.slide[this.slide.side].photo_id;
        let url = `${location.pathname}${location.hash}`;
        let current_url;
        await this.api.call_server_post('default/get_shortcut', { url: url })
            .then(response => {
                let base_url = `${location.host}`;
                if (base_url == "localhost:9000") {
                    base_url = environment.baseURL;  //for the development system
                }
                current_url = base_url + response.shortcut;
            });
        this.dialogService.open({
            viewModel: QrPhoto,
            model: {
                photo_id: photo_id,
                shortcut: current_url
            }, lock: false
        })   

    }

    slide_idx() {
        if (this.list_of_ids) {
            let photo_id = this.slide[this.slide.side].photo_id;
            return this.slide_list.findIndex(pid => pid == photo_id);
        }
        return this.slide_list.findIndex(slide => slide.photo_id == this.slide.photo_id);
    }

    public has_next(step) {
        let idx = this.slide_idx();
        return 0 <= (idx + step) && (idx + step) < this.slide_list.length;
    }

    get_slide_by_idx(idx) {
        if (this.list_of_ids) {
            return this.get_slide_by_idx_list_ids(idx);
        }
        this.slide = this.slide_list[idx];
        let pid = this.slide.photo_id;
        this.get_faces(pid);
        this.get_articles(pid);
        this.get_photo_info(pid);
    }

    get_slide_by_idx_list_ids(idx) {
        let pid = this.slide_list[idx];
        this.curr_photo_id = pid;
        this.api.call_server('photos/get_photo_detail', { photo_id: pid })
            .then(response => {
                let p = this.slide[this.slide.side];
                p.src = response.photo_src;
                p.photo_id = pid;
                p.width = response.width;
                p.height = response.height;
                this.calc_percents();
            })
    }

    public next_slide(event) {
        event.stopPropagation();
        // Hide circles immediately when navigating
        if (this.highlighting) {
            let el = document.getElementById("full-size-photo");
            if (el) {
                el.classList.remove("highlight-faces");
            }
        }
        
        // Clear any pending timeout
        if (this.show_circles_timeout) {
            clearTimeout(this.show_circles_timeout);
            this.show_circles_timeout = null;
        }
        
        // Reset container position when navigating
        this.container_translate_x = 0;
        this.container_translate_y = 0;
        let container = document.querySelector('.photo-faces-container') as HTMLElement;
        if (container) {
            container.style.transform = '';
        }
        
        // Reset zoom when navigating
        this.reset_zoom();
        
        let idx = this.slide_idx();
        if (idx + 1 < this.slide_list.length) {
            this.get_slide_by_idx(idx + 1);
            this.can_go_forward = idx + 2 < this.slide_list.length;
            this.can_go_backward = true;
            if (this.list_of_ids) {
                this.get_faces(this.curr_photo_id);
                this.get_articles(this.curr_photo_id)
                this.get_photo_info(this.curr_photo_id);
            }
            
            // Show circles after 1 second (will be triggered by image_loaded, but ensure it happens)
            // image_loaded will handle the delay and wait for image to render
        }
    }

    public prev_slide(event) {
        event.stopPropagation();
        // Hide circles immediately when navigating
        if (this.highlighting) {
            let el = document.getElementById("full-size-photo");
            if (el) {
                el.classList.remove("highlight-faces");
            }
        }
        
        // Clear any pending timeout
        if (this.show_circles_timeout) {
            clearTimeout(this.show_circles_timeout);
            this.show_circles_timeout = null;
        }
        
        // Reset container position when navigating
        this.container_translate_x = 0;
        this.container_translate_y = 0;
        let container = document.querySelector('.photo-faces-container') as HTMLElement;
        if (container) {
            container.style.transform = '';
        }
        
        // Reset zoom when navigating
        this.reset_zoom();
        
        let idx = this.slide_idx();
        if (idx > 0) {
            this.get_slide_by_idx(idx - 1)
            this.can_go_forward = true;
            this.can_go_backward = idx > 1;
            if (this.list_of_ids) {
                this.get_faces(this.curr_photo_id);
                this.get_articles(this.curr_photo_id);
                this.get_photo_info(this.curr_photo_id);
            }
            
            // Show circles after 1 second (will be triggered by image_loaded, but ensure it happens)
            // image_loaded will handle the delay and wait for image to render
        }
    }

    handle_context_menu(face, event) {
        event.stopPropagation();
        if (!this.user.editing) {
            return;
        }
        if (!this.highlighting) {
            this.toggle_highlighting(event);
        }
        let el = document.getElementById('full-size-photo');
        let rect = el.getBoundingClientRect(); // as DOMRect;
        this.no_new_faces = true;
        this.current_face = face;
        document.body.classList.add('semi-black-overlay');
        this.dialogService.open({
            viewModel: FaceInfo,
            host: el,
            model: {
                face: face,
                photo_x: rect.left,
                photo_width: rect.width,
                face_x: event.clientX
            }, lock: false
        }).whenClosed(response => {
            document.body.classList.remove('semi-black-overlay');
            this.no_new_faces = false;
            if (!response.wasCancelled) {
                let command = response.output.command;
                if (command == 'cancel-identification') {
                    this.marking_face_active = false;
                    this.remove_face(face)
                } else if (command == 'save-face-location') {
                    this.marking_face_active = false;
                    if (face.article_id) {
                        if (face.article_id > 0)
                            this.api.call_server_post('photos/save_article', { face: face });
                        else
                            this.assign_article(face);
                    } else {
                        if (face.member_id > 0)
                            this.api.call_server_post('photos/save_face', { face: face });
                        else
                            this.assign_member(face);
                    }
                }
            }
        })

    }

    save_face_location(face) {
        if (face.article_id > 0)
            this.api.call_server_post('photos/save_article', { face: face });
        else if (face.member_id > 0)
            this.api.call_server_post('photos/save_face', { face: face });
        }

    @computedFrom("current_face.x", "current_face.y", "current_face.r")
    get face_moved() {
        if (!this.user.editing) return;
        let current_face = this.current_face;
        if (!current_face) return;
        let id = current_face.article_id ? 'article-' + current_face.article_id : 'face-' + current_face.member_id;
        let el = document.getElementById(id);
        if (!el) return;
        let face_location = this.face_location(current_face);
        el.style.left = face_location.left;
        el.style.top = face_location.top;
        el.style.width = face_location.width;
        el.style.height = face_location.height;
        return 'bla';
    }

    async makeFullScreen() {
        this.curr_photo_id = this.slide.photo_id;
        this.fullscreen_mode = false;
        let el = document.getElementById("photo-image");
        if (el.requestFullscreen) {
            el.requestFullscreen();
        } else {
            console.log("Fullscreen API is not supported");
        }
        await sleep(100);
        this.calc_percents();
    }

    fullscreen_change(event) {
        this.fullscreen_mode = !this.fullscreen_mode;
        if (!this.fullscreen_mode) {
            this.get_faces(this.curr_photo_id);
            this.get_articles(this.curr_photo_id);
            this.get_photo_info(this.curr_photo_id);
        }
    }

    close(event) {
        this.dialogController.ok();
    }

    @computedFrom('theme.width')
    get force_calc_percents() {
        this.calc_percents();
        return "";
    }

    calc_percents() {
        let ph = this.slide[this.slide.side].height;
        let pw = this.slide[this.slide.side].width;
        let sh = this.theme.height;
        let sw = this.theme.width;
        let w;
        let h;
        if (ph * sw > pw * sh) {
            this.fullscreen_height = 100;
            w = Math.round(pw * sh / ph);
            h = sh;
            this.fullscreen_width = Math.round(100 * pw * sh / ph / sw);
        } else {
            w = sw;
            h = Math.round(ph * sw / pw);
            this.fullscreen_width = 100;
            this.fullscreen_height = Math.round(100 * ph * sw / pw / sh);
        }
        this.fullscreen_margin = Math.round((sw - w) / 2);
        this.fullscreen_top_margin = Math.round((sh - h) / 2);
    }

    @computedFrom('photo_date_valid')
    get incomplete() {
        if (this.photo_date_valid != 'valid')
            return "disabled"
        return ''
    }

    @computedFrom('user.editing')
    get hide_details_icon() {
        return this.theme.is_desktop && ! this.slide.has_story_text && ! this.model.has_map && ! this.user.editing;
    }

    image_loaded() {
        this.image_height = this.slide[this.slide.side].height;
        this.image_width = this.slide[this.slide.side].width;
        this.calc_percents();
        // Wait for image to be fully rendered, especially important on mobile
        this.wait_for_image_rendered().then(() => {
            // Reposition zoom controls after image loads
            this.position_zoom_controls();
            // Show circles 1 second after image is fully rendered (if highlighting is enabled)
            if (this.highlighting) {
                this.show_circles_with_delay();
            }
        });
    }

    async wait_for_image_rendered() {
        // Wait for the image to be fully rendered with correct dimensions
        // This is especially important on mobile where images scale responsively
        return new Promise<void>((resolve) => {
            let attempts = 0;
            const maxAttempts = 50; // 1 second max wait (50 * 20ms)
            
            const checkImage = () => {
                attempts++;
                const img = document.querySelector('.photo-faces-container img') as HTMLImageElement;
                const container = document.querySelector('.photo-faces-container') as HTMLElement;
                
                if (img && container) {
                    // Check if image has natural dimensions (fully loaded)
                    const hasNaturalSize = img.naturalWidth > 0 && img.naturalHeight > 0;
                    // Check if image is actually rendered (has display dimensions)
                    const hasDisplaySize = img.offsetWidth > 0 && img.offsetHeight > 0;
                    // Check if container has size
                    const containerHasSize = container.offsetWidth > 0 && container.offsetHeight > 0;
                    
                    // Ensure container width matches image width exactly (important for responsive images)
                    // This prevents container from expanding when there are many shapes with labels
                    if (!this.fullscreen_mode && hasDisplaySize) {
                        // Force container to match image width exactly
                        const imgWidth = img.offsetWidth || img.clientWidth;
                        if (imgWidth > 0 && Math.abs(container.offsetWidth - imgWidth) > 1) {
                            container.style.width = imgWidth + 'px';
                            container.style.maxWidth = imgWidth + 'px';
                        }
                    }
                    
                    // On mobile, also verify the container matches the image size
                    // (for responsive images, container should match image display size)
                    const imgWidth = img.offsetWidth || img.clientWidth;
                    const sizesMatch = this.fullscreen_mode || (imgWidth > 0 && Math.abs(container.offsetWidth - imgWidth) < 5);
                    
                    if (hasNaturalSize && hasDisplaySize && containerHasSize && sizesMatch) {
                        // Force a layout recalculation
                        void container.offsetHeight;
                        void img.offsetHeight;
                        // Small delay to ensure browser has finished layout
                        setTimeout(() => resolve(), 50);
                        return;
                    }
                }
                
                if (attempts < maxAttempts) {
                    setTimeout(checkImage, 20);
                } else {
                    // Timeout - proceed anyway, but try to fix container size
                    if (img && container && !this.fullscreen_mode) {
                        const imgWidth = img.offsetWidth || img.clientWidth;
                        if (imgWidth > 0) {
                            container.style.width = imgWidth + 'px';
                            container.style.maxWidth = imgWidth + 'px';
                        }
                    }
                    resolve();
                }
            };
            
            // Start checking after a small delay to let the browser process the load event
            setTimeout(checkImage, 10);
        });
    }

    show_circles_with_delay() {
        // Clear any existing timeout
        if (this.show_circles_timeout) {
            clearTimeout(this.show_circles_timeout);
        }
        
        // Hide circles first (remove highlight-faces class)
        let el = document.getElementById("full-size-photo");
        if (el) {
            el.classList.remove("highlight-faces");
        }
        
        // Show circles after 1 second delay
        this.show_circles_timeout = setTimeout(() => {
            if (el && this.highlighting) {
                // Ensure image is fully rendered before showing circles
                this.wait_for_image_rendered().then(() => {
                    // Force recalculation of all face positions
                    this.force_recalculate_face_positions();
                    
                    el.classList.add("highlight-faces");
                    // Recalculate positions like it's the first time
                    requestAnimationFrame(() => {
                        // Reset all label positions first
                        this.reset_label_positions();
                        // Then adjust overlaps
                        this.adjust_label_overlaps();
                    });
                });
            }
        }, 1000);
    }

    force_recalculate_face_positions() {
        // Ensure container size matches image size (critical for mobile)
        // This prevents container from expanding when there are many shapes with labels
        const img = document.querySelector('.photo-faces-container img') as HTMLImageElement;
        const container = document.querySelector('.photo-faces-container') as HTMLElement;
        
        if (img && container && !this.fullscreen_mode) {
            // Ensure container width matches image display width exactly
            // This is critical - if container expands, scale calculations will be wrong
            const imgWidth = img.offsetWidth || img.clientWidth;
            const containerWidth = container.offsetWidth;
            if (imgWidth > 0 && Math.abs(imgWidth - containerWidth) > 1) {
                container.style.width = imgWidth + 'px';
                container.style.maxWidth = imgWidth + 'px';
            }
        }
        
        // Force recalculation of all face positions by re-applying styles
        // This ensures positions are correct based on current image size
        this.faces.forEach(face => {
            let faceEl = document.getElementById('face-' + face.member_id);
            if (faceEl) {
                let location = this.face_location(face);
                faceEl.style.left = location.left;
                faceEl.style.top = location.top;
                faceEl.style.width = location.width;
                faceEl.style.height = location.height;
            }
        });
        
        this.articles.forEach(article => {
            let articleEl = document.getElementById('article-' + article.article_id);
            if (articleEl) {
                let location = this.face_location(article);
                articleEl.style.left = location.left;
                articleEl.style.top = location.top;
                articleEl.style.width = location.width;
                articleEl.style.height = location.height;
            }
        });
    }

    reset_label_positions() {
        // Reset all label positions to default (like first time)
        // But preserve the counter-scale transform for zoom
        this.faces.forEach(face => {
            let el = document.getElementById('face-' + face.member_id);
            if (el) {
                let label = el.querySelector('.highlighted-face') as HTMLElement;
                if (label) {
                    label.style.top = '100%'; // Reset to default
                    label.style.fontSize = ''; // Reset font size
                    // Preserve counter-scale if zoomed
                    if (this.zoom_level !== 1) {
                        const counterScale = 1 / this.zoom_level;
                        label.style.transform = `translateX(-50%) scale(${counterScale})`;
                        label.style.transformOrigin = 'center center';
                    } else {
                        label.style.transform = 'translateX(-50%)';
                        label.style.transformOrigin = '';
                    }
                }
            }
        });
        this.articles.forEach(article => {
            let el = document.getElementById('article-' + article.article_id);
            if (el) {
                let label = el.querySelector('.highlighted-face') as HTMLElement;
                if (label) {
                    label.style.top = '100%'; // Reset to default
                    label.style.fontSize = ''; // Reset font size
                    // Preserve counter-scale if zoomed
                    if (this.zoom_level !== 1) {
                        const counterScale = 1 / this.zoom_level;
                        label.style.transform = `translateX(-50%) scale(${counterScale})`;
                        label.style.transformOrigin = 'center center';
                    } else {
                        label.style.transform = 'translateX(-50%)';
                        label.style.transformOrigin = '';
                    }
                }
            }
        });
    }

    setup_label_overlap_detection() {
        // Adjust labels on window resize
        this.resize_handler = () => {
            // Reposition zoom controls on resize
            this.position_zoom_controls();
            if (this.highlighting) {
                // Wait for image to be re-rendered after resize, then recalculate
                this.wait_for_image_rendered().then(() => {
                    // Force recalculation of face positions after resize
                    this.force_recalculate_face_positions();
                    requestAnimationFrame(() => {
                        this.reset_label_positions();
                        this.adjust_label_overlaps();
                    });
                });
            }
        };
        window.addEventListener('resize', this.resize_handler);
    }

    // Helper function to check if two rectangles overlap
    private rectanglesOverlap(rect1: DOMRect, rect2: DOMRect, padding: number = 1): boolean {
        // Reduced padding to allow labels to be closer together
        return !(rect1.right + padding < rect2.left - padding || 
                 rect1.left - padding > rect2.right + padding ||
                 rect1.bottom + padding < rect2.top - padding || 
                 rect1.top - padding > rect2.bottom + padding);
    }

    // Helper function to check if a point is inside a circle/ellipse
    private pointInShape(px: number, py: number, shapeRect: DOMRect, isSquare: boolean): boolean {
        const centerX = shapeRect.left + shapeRect.width / 2;
        const centerY = shapeRect.top + shapeRect.height / 2;
        const radiusX = shapeRect.width / 2;
        const radiusY = shapeRect.height / 2;
        
        if (isSquare) {
            // For squares, check if point is inside the square
            return px >= shapeRect.left && px <= shapeRect.right &&
                   py >= shapeRect.top && py <= shapeRect.bottom;
        } else {
            // For circles, check if point is inside the ellipse
            const dx = (px - centerX) / radiusX;
            const dy = (py - centerY) / radiusY;
            return (dx * dx + dy * dy) <= 1;
        }
    }

    // Helper function to check if a rectangle intersects with or is inside a shape
    private rectangleIntersectsShape(rect: DOMRect, shapeRect: DOMRect, isSquare: boolean, padding: number = 1): boolean {
        // Expand shape rect by padding
        const expandedShape = new DOMRect(
            shapeRect.left - padding,
            shapeRect.top - padding,
            shapeRect.width + 2 * padding,
            shapeRect.height + 2 * padding
        );
        
        // First check if rectangles overlap (quick check)
        if (!this.rectanglesOverlap(rect, expandedShape, 0)) {
            return false;
        }
        
        // Check if any corner of the label is inside the shape
        const corners = [
            { x: rect.left, y: rect.top },
            { x: rect.right, y: rect.top },
            { x: rect.left, y: rect.bottom },
            { x: rect.right, y: rect.bottom }
        ];
        
        for (const corner of corners) {
            if (this.pointInShape(corner.x, corner.y, expandedShape, isSquare)) {
                return true;
            }
        }
        
        // Also check if shape center is inside label (for small shapes)
        const shapeCenterX = expandedShape.left + expandedShape.width / 2;
        const shapeCenterY = expandedShape.top + expandedShape.height / 2;
        if (shapeCenterX >= rect.left && shapeCenterX <= rect.right &&
            shapeCenterY >= rect.top && shapeCenterY <= rect.bottom) {
            return true;
        }
        
        return false;
    }

    // Helper function to get label bounding box in container coordinates
    private getLabelBoundingBox(label: HTMLElement, container: HTMLElement): DOMRect {
        const labelRect = label.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return new DOMRect(
            labelRect.left - containerRect.left,
            labelRect.top - containerRect.top,
            labelRect.width,
            labelRect.height
        );
    }

    // Helper function to check if label overlaps with any circle or shape
    private labelOverlapsWithShapes(labelRect: DOMRect, allShapes: Array<{parent: HTMLElement, isArticle: boolean}>, container: HTMLElement, excludeIndex: number): boolean {
        const containerRect = container.getBoundingClientRect();
        for (let i = 0; i < allShapes.length; i++) {
            if (i === excludeIndex) continue;
            const shapeRect = allShapes[i].parent.getBoundingClientRect();
            const shapeRectInContainer = new DOMRect(
                shapeRect.left - containerRect.left,
                shapeRect.top - containerRect.top,
                shapeRect.width,
                shapeRect.height
            );
            // Check if label intersects with or enters the shape interior
            // Reduced padding to allow labels closer to shapes
            if (this.rectangleIntersectsShape(labelRect, shapeRectInContainer, allShapes[i].isArticle, 1)) {
                return true;
            }
        }
        return false;
    }

    // Helper function to check if label overlaps with other labels
    private labelOverlapsWithLabels(labelRect: DOMRect, allLabels: Array<{label: HTMLElement}>, container: HTMLElement, excludeIndex: number): boolean {
        const containerRect = container.getBoundingClientRect();
        for (let i = 0; i < allLabels.length; i++) {
            if (i === excludeIndex) continue;
            const otherLabelRect = allLabels[i].label.getBoundingClientRect();
            const otherLabelRectInContainer = new DOMRect(
                otherLabelRect.left - containerRect.left,
                otherLabelRect.top - containerRect.top,
                otherLabelRect.width,
                otherLabelRect.height
            );
            // Reduced padding to allow labels closer together
            if (this.rectanglesOverlap(labelRect, otherLabelRectInContainer, 1)) {
                return true;
            }
        }
        return false;
    }

    // Helper function to check if a position is valid (no overlaps)
    private isPositionValid(labelRect: DOMRect, allShapes: Array<{parent: HTMLElement, isArticle: boolean}>, allLabels: Array<{label: HTMLElement}>, container: HTMLElement, excludeShapeIndex: number, excludeLabelIndex: number): boolean {
        // Check bounds - label must be within container
        const containerRect = container.getBoundingClientRect();
        if (labelRect.left < 0 || labelRect.top < 0 || 
            labelRect.right > containerRect.width || labelRect.bottom > containerRect.height) {
            return false;
        }
        
        // Check overlap with other shapes
        if (this.labelOverlapsWithShapes(labelRect, allShapes, container, excludeShapeIndex)) {
            return false;
        }
        
        // Check overlap with other labels
        if (this.labelOverlapsWithLabels(labelRect, allLabels, container, excludeLabelIndex)) {
            return false;
        }
        
        return true;
    }

    // Helper function to clear all connecting lines
    private clearConnectingLines() {
        const svg = document.querySelector('.photo-faces-container .label-connectors') as SVGElement;
        if (svg) {
            // Remove all lines but keep defs
            const lines = svg.querySelectorAll('line');
            lines.forEach(line => line.remove());
        }
    }

    // Helper function to draw a connecting line from circle/shape edge to label
    private drawConnectingLine(shape: HTMLElement, label: HTMLElement, container: HTMLElement) {
        const svg = document.querySelector('.photo-faces-container .label-connectors') as SVGElement;
        if (!svg) return;

        const containerRect = container.getBoundingClientRect();
        const shapeRect = shape.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();

        // Check if shape is a square (article) or circle (face)
        const isSquare = shape.classList.contains('is-article');

        // Calculate positions relative to container
        const shapeLeft = shapeRect.left - containerRect.left;
        const shapeTop = shapeRect.top - containerRect.top;
        const shapeRight = shapeLeft + shapeRect.width;
        const shapeBottom = shapeTop + shapeRect.height;
        const shapeCenterX = shapeLeft + shapeRect.width / 2;
        const shapeCenterY = shapeTop + shapeRect.height / 2;
        
        // Label center
        const labelLeft = labelRect.left - containerRect.left;
        const labelTop = labelRect.top - containerRect.top;
        const labelRight = labelLeft + labelRect.width;
        const labelBottom = labelTop + labelRect.height;
        const labelCenterX = labelLeft + labelRect.width / 2;
        const labelCenterY = labelTop + labelRect.height / 2;
        
        // Calculate direction from shape center to label center
        const dx = labelCenterX - shapeCenterX;
        const dy = labelCenterY - shapeCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Handle edge case where label is at shape center
        if (distance < 0.1) {
            // If label is at center, draw line from bottom edge
            const edgeX = shapeCenterX;
            const edgeY = shapeBottom;
            const labelClosestX = labelCenterX;
            const labelClosestY = labelBottom;
            
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(edgeX));
            line.setAttribute('y1', String(edgeY));
            line.setAttribute('x2', String(labelClosestX));
            line.setAttribute('y2', String(labelClosestY));
            line.setAttribute('stroke', 'yellow');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-opacity', '0.6');
            svg.appendChild(line);
            return;
        }
        
        // Find intersection point on shape edge
        let edgeX: number, edgeY: number;
        
        if (isSquare) {
            // For squares, find intersection with square edge
            const radiusX = shapeRect.width / 2;
            const radiusY = shapeRect.height / 2;
            
            // Normalize direction
            const normX = dx / distance;
            const normY = dy / distance;
            
            // Find intersection with square boundary
            // Calculate which edge the line intersects
            const tX = normX !== 0 ? (normX > 0 ? (shapeRight - shapeCenterX) / normX : (shapeLeft - shapeCenterX) / normX) : Infinity;
            const tY = normY !== 0 ? (normY > 0 ? (shapeBottom - shapeCenterY) / normY : (shapeTop - shapeCenterY) / normY) : Infinity;
            
            // Use the smaller t (closer intersection)
            const t = Math.min(tX, tY);
            edgeX = shapeCenterX + normX * t;
            edgeY = shapeCenterY + normY * t;
        } else {
            // For circles, find intersection with circle edge
            const radiusX = shapeRect.width / 2;
            const radiusY = shapeRect.height / 2;
            
            // Normalize direction vector
            const normX = dx / distance;
            const normY = dy / distance;
            
            // Calculate edge point (point on ellipse edge in direction of label)
            // For ellipses, we need to find the intersection with the ellipse
            // Using parametric form: x = centerX + a*cos(t), y = centerY + b*sin(t)
            // where a = radiusX, b = radiusY
            // We want the point in direction (normX, normY)
            const angle = Math.atan2(normY * radiusY, normX * radiusX);
            edgeX = shapeCenterX + radiusX * Math.cos(angle);
            edgeY = shapeCenterY + radiusY * Math.sin(angle);
        }
        
        // Find closest point on label to the edge point
        const labelClosestX = Math.max(labelLeft, Math.min(edgeX, labelRight));
        const labelClosestY = Math.max(labelTop, Math.min(edgeY, labelBottom));

        // Create line element - SVG coordinates match container coordinates
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(edgeX));
        line.setAttribute('y1', String(edgeY));
        line.setAttribute('x2', String(labelClosestX));
        line.setAttribute('y2', String(labelClosestY));
        line.setAttribute('stroke', 'yellow');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-opacity', '0.6');
        svg.appendChild(line);
    }

    adjust_label_overlaps() {
        if (!this.highlighting) {
            this.clearConnectingLines();
            return;
        }

        // Add positioning class to hide labels during calculation
        let slideEl = document.getElementById("full-size-photo");
        if (slideEl) {
            slideEl.classList.add("positioning-labels");
        }

        // Get container for coordinate calculations
        const container = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!container) {
            if (slideEl) {
                slideEl.classList.remove("positioning-labels");
            }
            return;
        }

        // Initialize SVG for connecting lines
        const svg = document.querySelector('.photo-faces-container .label-connectors') as SVGElement;
        if (svg) {
            const containerRect = container.getBoundingClientRect();
            svg.setAttribute('width', String(containerRect.width));
            svg.setAttribute('height', String(containerRect.height));
            svg.innerHTML = '<defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="yellow" opacity="0.6" /></marker></defs>';
        }

        // Collect all labels with their parent shapes
        interface LabelInfo {
            label: HTMLElement;
            parent: HTMLElement;
            face: any;
            isArticle: boolean;
        }

        let allLabels: LabelInfo[] = [];
        this.faces.forEach(face => {
            let el = document.getElementById('face-' + face.member_id);
            if (el) {
                let label = el.querySelector('.highlighted-face') as HTMLElement;
                if (label) {
                    // Reset to default position
                    label.style.top = '100%';
                    label.style.left = '50%';
                    // Apply counter-scale to keep label at fixed visual size
                    // This ensures text stays the same size regardless of zoom
                    if (this.zoom_level !== 1) {
                        const counterScale = 1 / this.zoom_level;
                        label.style.transform = `translateX(-50%) scale(${counterScale})`;
                        label.style.transformOrigin = 'center center';
                    } else {
                        label.style.transform = 'translateX(-50%)';
                        label.style.transformOrigin = '';
                    }
                    allLabels.push({label: label, parent: el, face: face, isArticle: false});
                }
            }
        });
        this.articles.forEach(article => {
            let el = document.getElementById('article-' + article.article_id);
            if (el) {
                let label = el.querySelector('.highlighted-face') as HTMLElement;
                if (label) {
                    // Reset to default position
                    label.style.top = '100%';
                    label.style.left = '50%';
                    // Apply counter-scale to keep label at fixed visual size
                    // This ensures text stays the same size regardless of zoom
                    if (this.zoom_level !== 1) {
                        const counterScale = 1 / this.zoom_level;
                        label.style.transform = `translateX(-50%) scale(${counterScale})`;
                        label.style.transformOrigin = 'center center';
                    } else {
                        label.style.transform = 'translateX(-50%)';
                        label.style.transformOrigin = '';
                    }
                    allLabels.push({label: label, parent: el, face: article, isArticle: true});
                }
            }
        });

        if (allLabels.length === 0) {
            if (slideEl) {
                slideEl.classList.remove("positioning-labels");
            }
            return;
        }

        // Force a layout recalculation to get accurate dimensions
        void container.offsetHeight;
        allLabels.forEach(item => void item.label.offsetHeight);

        // Wait for layout to settle, then position labels
        setTimeout(() => {
            const containerRect = container.getBoundingClientRect();

            // Position each label optimally
            for (let i = 0; i < allLabels.length; i++) {
                const item = allLabels[i];
                const label = item.label;
                const parent = item.parent;
                const isArticle = item.isArticle;

                // Get parent shape position
                const parentRect = parent.getBoundingClientRect();
                const parentRectInContainer = new DOMRect(
                    parentRect.left - containerRect.left,
                    parentRect.top - containerRect.top,
                    parentRect.width,
                    parentRect.height
                );

                const shapeCenterX = parentRectInContainer.left + parentRectInContainer.width / 2;
                const shapeCenterY = parentRectInContainer.top + parentRectInContainer.height / 2;
                const shapeRadiusX = parentRectInContainer.width / 2;
                const shapeRadiusY = parentRectInContainer.height / 2;
                const maxRadius = Math.max(shapeRadiusX, shapeRadiusY);
                
                // Adjust spacing based on zoom - when zoomed in, labels should be very close
                // When zoomed out, they can be slightly further but still close
                const spacingMultiplier = Math.min(1, 1 / this.zoom_level); // Closer when zoomed in
                const baseSpacing = 2; // Minimal spacing to keep labels very close to shapes
                const adjustedSpacing = baseSpacing * spacingMultiplier;

                // Get label dimensions
                // Labels have counter-scale applied, so getBoundingClientRect gives us the visual (scaled) size
                // For calculations, we need the actual unscaled size that the label would occupy
                const defaultLabelRect = label.getBoundingClientRect();
                // Since label has scale(1/zoom_level), the actual size is visual_size * zoom_level
                // But we want to use the visual size for positioning calculations so labels stay close
                const labelWidth = defaultLabelRect.width;
                const labelHeight = defaultLabelRect.height;

                // Calculate positions in container coordinates, then convert to relative positioning
                // Labels are positioned relative to their parent button, so we need to convert
                const parentWidth = parentRectInContainer.width;
                const parentHeight = parentRectInContainer.height;
                const parentLeft = parentRectInContainer.left;
                const parentTop = parentRectInContainer.top;
                const parentCenterX = parentLeft + parentWidth / 2;
                const parentCenterY = parentTop + parentHeight / 2;

                // Define preferred positions in container coordinates
                interface Position {
                    name: string;
                    containerX: number;
                    containerY: number;
                }

                const preferredPositions: Position[] = [
                    // Below (preferred) - position very close below the shape
                    {
                        name: 'below',
                        containerX: parentCenterX,
                        containerY: parentTop + parentHeight + labelHeight / 2 + adjustedSpacing
                    },
                    // Above - position very close above the shape
                    {
                        name: 'above',
                        containerX: parentCenterX,
                        containerY: parentTop - labelHeight / 2 - adjustedSpacing
                    },
                    // Right - position very close to the right of the shape
                    {
                        name: 'right',
                        containerX: parentLeft + parentWidth + labelWidth / 2 + adjustedSpacing,
                        containerY: parentCenterY
                    },
                    // Left - position very close to the left of the shape
                    {
                        name: 'left',
                        containerX: parentLeft - labelWidth / 2 - adjustedSpacing,
                        containerY: parentCenterY
                    }
                ];

                // Try preferred positions first
                let bestPosition: Position | null = null;
                let foundValidPosition = false;

                for (const pos of preferredPositions) {
                    // Convert container coordinates to relative position (percentage/transform)
                    // Label is positioned relative to parent button
                    const relativeX = pos.containerX - parentLeft;
                    const relativeY = pos.containerY - parentTop;
                    
                    // Set label position using transform for precise control
                    label.style.top = '0';
                    label.style.left = '0';
                    // Apply counter-scale if zoomed
                    if (this.zoom_level !== 1) {
                        const counterScale = 1 / this.zoom_level;
                        label.style.transform = `translate(${relativeX}px, ${relativeY}px) translate(-50%, -50%) scale(${counterScale})`;
                        label.style.transformOrigin = 'center center';
                    } else {
                        label.style.transform = `translate(${relativeX}px, ${relativeY}px) translate(-50%, -50%)`;
                        label.style.transformOrigin = '';
                    }
                    
                    // Force reflow to get actual position
                    void label.offsetHeight;
                    
                    // Get actual label rect (accounting for counter-scale)
                    const testLabelRect = label.getBoundingClientRect();
                    const testLabelRectInContainer = new DOMRect(
                        testLabelRect.left - containerRect.left,
                        testLabelRect.top - containerRect.top,
                        testLabelRect.width,
                        testLabelRect.height
                    );

                    // Check if this position is valid
                    if (this.isPositionValid(testLabelRectInContainer, allLabels.map(l => ({parent: l.parent, isArticle: l.isArticle})), allLabels.map(l => ({label: l.label})), container, i, i)) {
                        bestPosition = pos;
                        foundValidPosition = true;
                        break;
                    }
                }

                // If no preferred position works, try progressive distance search
                if (!foundValidPosition) {
                    const maxSearchDistance = Math.max(containerRect.width, containerRect.height) * 0.5;
                    const stepSize = 15 * spacingMultiplier; // Smaller steps when zoomed in for closer positioning
                    // Start search very close to the shape edge
                    let searchDistance = maxRadius + Math.max(labelWidth, labelHeight) / 2 + adjustedSpacing;
                    let found = false;

                    // Try positions at increasing distances in 8 directions
                    while (searchDistance < maxSearchDistance && !found) {
                        const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];
                        
                        for (const angle of angles) {
                            const offsetX = Math.cos(angle) * searchDistance;
                            const offsetY = Math.sin(angle) * searchDistance;
                            
                            const testX = parentCenterX + offsetX;
                            const testY = parentCenterY + offsetY;
                            
                            // Convert to relative position
                            const relativeX = testX - parentLeft;
                            const relativeY = testY - parentTop;
                            
                            // Set label position
                            label.style.top = '0';
                            label.style.left = '0';
                            // Apply counter-scale if zoomed - keeps text at fixed size
                            if (this.zoom_level !== 1) {
                                const counterScale = 1 / this.zoom_level;
                                label.style.transform = `translate(${relativeX}px, ${relativeY}px) translate(-50%, -50%) scale(${counterScale})`;
                                label.style.transformOrigin = 'center center';
                            } else {
                                label.style.transform = `translate(${relativeX}px, ${relativeY}px) translate(-50%, -50%)`;
                                label.style.transformOrigin = '';
                            }
                            
                            // Force reflow
                            void label.offsetHeight;
                            
                            // Get actual label rect (accounting for counter-scale)
                            const testLabelRect = label.getBoundingClientRect();
                            const testLabelRectInContainer = new DOMRect(
                                testLabelRect.left - containerRect.left,
                                testLabelRect.top - containerRect.top,
                                testLabelRect.width,
                                testLabelRect.height
                            );

                            // Check bounds
                            if (testLabelRectInContainer.left >= 0 && testLabelRectInContainer.top >= 0 &&
                                testLabelRectInContainer.right <= containerRect.width &&
                                testLabelRectInContainer.bottom <= containerRect.height) {
                                
                                // Check if valid
                                if (this.isPositionValid(testLabelRectInContainer, allLabels.map(l => ({parent: l.parent, isArticle: l.isArticle})), allLabels.map(l => ({label: l.label})), container, i, i)) {
                                    bestPosition = {
                                        name: 'progressive',
                                        containerX: testX,
                                        containerY: testY
                                    };
                                    found = true;
                                    break;
                                }
                            }
                        }
                        
                        if (!found) {
                            searchDistance += stepSize;
                        }
                    }
                }

                // If still no position found, use default below (will draw connecting line)
                if (!bestPosition) {
                    label.style.top = '100%';
                    label.style.left = '50%';
                    // Apply counter-scale if zoomed - keeps text at fixed size
                    if (this.zoom_level !== 1) {
                        const counterScale = 1 / this.zoom_level;
                        label.style.transform = `translateX(-50%) scale(${counterScale})`;
                        label.style.transformOrigin = 'center center';
                    } else {
                        label.style.transform = 'translateX(-50%)';
                        label.style.transformOrigin = '';
                    }
                } else if (bestPosition.name !== 'progressive') {
                    // Apply the best preferred position
                    const relativeX = bestPosition.containerX - parentLeft;
                    const relativeY = bestPosition.containerY - parentTop;
                    label.style.top = '0';
                    label.style.left = '0';
                    // Apply counter-scale if zoomed - keeps text at fixed size
                    if (this.zoom_level !== 1) {
                        const counterScale = 1 / this.zoom_level;
                        label.style.transform = `translate(${relativeX}px, ${relativeY}px) translate(-50%, -50%) scale(${counterScale})`;
                        label.style.transformOrigin = 'center center';
                    } else {
                        label.style.transform = `translate(${relativeX}px, ${relativeY}px) translate(-50%, -50%)`;
                        label.style.transformOrigin = '';
                    }
                }
            }

            // Final pass: draw connecting lines for labels that are far from their shapes
            setTimeout(() => {
                allLabels.forEach((item, index) => {
                    const labelRect = item.label.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    const parentRect = item.parent.getBoundingClientRect();

                    const labelRectInContainer = new DOMRect(
                        labelRect.left - containerRect.left,
                        labelRect.top - containerRect.top,
                        labelRect.width,
                        labelRect.height
                    );
                    const parentRectInContainer = new DOMRect(
                        parentRect.left - containerRect.left,
                        parentRect.top - containerRect.top,
                        parentRect.width,
                        parentRect.height
                    );

                    // Calculate distance from shape edge to label edge
                    const circleCenterX = parentRectInContainer.left + parentRectInContainer.width / 2;
                    const circleCenterY = parentRectInContainer.top + parentRectInContainer.height / 2;
                    const circleRadius = Math.max(parentRectInContainer.width, parentRectInContainer.height) / 2;
                    const labelCenterX = labelRectInContainer.left + labelRectInContainer.width / 2;
                    const labelCenterY = labelRectInContainer.top + labelRectInContainer.height / 2;
                    
                    // Distance from shape center to label center
                    const centerToCenterDistance = Math.sqrt(
                        Math.pow(circleCenterX - labelCenterX, 2) + 
                        Math.pow(circleCenterY - labelCenterY, 2)
                    );
                    
                    // Draw connecting line always
                    this.drawConnectingLine(item.parent, item.label, container);
                });

                // Remove positioning class to show labels
                if (slideEl) {
                    slideEl.classList.remove("positioning-labels");
                }
            }, 10);
        }, 0);
    }

    // Zoom functionality
    setup_zoom_handlers() {
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;

        // Mouse wheel zoom for desktop - zoom from center
        this.wheel_handler = (event: WheelEvent) => {
            // Only zoom if over the photo container area
            const target = event.target as HTMLElement;
            const isInPhotoArea = photoContainer.contains(target) || 
                                 target === photoContainer || 
                                 target.closest('.photo-faces-container') === photoContainer ||
                                 target.closest('#photo-image') !== null;
            
            if (!isInPhotoArea) return;
            
            // Don't zoom if over zoom buttons
            if (target.closest('.zoom-controls')) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            const delta = event.deltaY > 0 ? -this.zoom_step : this.zoom_step;
            // Zoom from center of container
            const rect = photoContainer.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            this.zoom_at_point(centerX, centerY, delta);
        };

        // Touch pinch zoom for mobile
        this.touch_start_handler = (event: TouchEvent) => {
            const target = event.target as HTMLElement;
            // Don't interfere with face buttons or other interactive elements
            if (target.closest('button.face') || target.closest('.zoom-controls')) {
                return;
            }
            
            if (event.touches.length === 2) {
                event.preventDefault();
                this.is_zooming = true;
                this.is_panning = false;
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];
                this.last_touch_distance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
            } else if (event.touches.length === 1 && this.zoom_level > 1 && !this.marking_face_active && !this.cropping) {
                // Single touch for panning when zoomed in
                event.preventDefault();
                this.is_panning = true;
                this.is_zooming = false;
                const touch = event.touches[0];
                this.pan_start_x = touch.clientX;
                this.pan_start_y = touch.clientY;
                
                // Get current transform
                const currentTransform = photoContainer.style.transform || '';
                const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                if (translateMatch) {
                    this.pan_current_x = parseFloat(translateMatch[1]) || 0;
                    this.pan_current_y = parseFloat(translateMatch[2]) || 0;
                }
            }
        };

        this.touch_move_handler = (event: TouchEvent) => {
            if (event.touches.length === 2 && this.is_zooming) {
                event.preventDefault();
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];
                const currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );

                // Zoom from center
                const rect = photoContainer.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const distanceDelta = currentDistance - this.last_touch_distance;
                const zoomDelta = (distanceDelta / 100) * this.zoom_step;
                
                this.zoom_at_point(centerX, centerY, zoomDelta);
                this.last_touch_distance = currentDistance;
            } else if (event.touches.length === 1 && this.is_panning && this.zoom_level > 1) {
                // Pan when zoomed in
                event.preventDefault();
                const touch = event.touches[0];
                const deltaX = touch.clientX - this.pan_start_x;
                const deltaY = touch.clientY - this.pan_start_y;
                
                const newX = this.pan_current_x + deltaX;
                const newY = this.pan_current_y + deltaY;
                
                // Apply pan transform - combine with container translation
                const totalX = this.container_translate_x + newX;
                const totalY = this.container_translate_y + newY;
                photoContainer.style.transform = `translate(${totalX}px, ${totalY}px) scale(${this.zoom_level})`;
                photoContainer.style.transformOrigin = '0 0';
            }
        };

        this.touch_end_handler = () => {
            if (this.is_zooming) {
                this.is_zooming = false;
                this.last_touch_distance = 0;
            }
            if (this.is_panning) {
                this.is_panning = false;
                // Update current pan position (extract total and subtract container translation)
                const currentTransform = photoContainer.style.transform || '';
                const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                if (translateMatch) {
                    const totalX = parseFloat(translateMatch[1]) || 0;
                    const totalY = parseFloat(translateMatch[2]) || 0;
                    // Extract only the pan part (subtract container translation)
                    this.pan_current_x = totalX - this.container_translate_x;
                    this.pan_current_y = totalY - this.container_translate_y;
                }
            }
        };

        // Mouse pan handlers for desktop when zoomed in
        this.pan_start_handler = (event: MouseEvent) => {
            // Don't pan if clicking on buttons, faces, or other interactive elements
            const target = event.target as HTMLElement;
            if (target.closest('button') || 
                target.closest('.zoom-controls') || 
                target.closest('.face') ||
                target.closest('#cropper') ||
                this.cropping ||
                this.marking_face_active) {
                return;
            }
            
            if (this.zoom_level > 1) {
                event.preventDefault();
                this.is_panning = true;
                this.pan_start_x = event.clientX;
                this.pan_start_y = event.clientY;
                
                // Get current transform and extract only pan values (subtract container translation)
                const currentTransform = photoContainer.style.transform || '';
                const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                if (translateMatch) {
                    const totalX = parseFloat(translateMatch[1]) || 0;
                    const totalY = parseFloat(translateMatch[2]) || 0;
                    // Extract only the pan part (subtract container translation)
                    this.pan_current_x = totalX - this.container_translate_x;
                    this.pan_current_y = totalY - this.container_translate_y;
                }
                
                photoContainer.style.cursor = 'grabbing';
            }
        };

        this.pan_move_handler = (event: MouseEvent) => {
            if (this.is_panning && this.zoom_level > 1) {
                event.preventDefault();
                const deltaX = event.clientX - this.pan_start_x;
                const deltaY = event.clientY - this.pan_start_y;
                
                const newX = this.pan_current_x + deltaX;
                const newY = this.pan_current_y + deltaY;
                
                // Apply pan transform - combine with container translation
                const totalX = this.container_translate_x + newX;
                const totalY = this.container_translate_y + newY;
                photoContainer.style.transform = `translate(${totalX}px, ${totalY}px) scale(${this.zoom_level})`;
                photoContainer.style.transformOrigin = '0 0';
            }
        };

        this.pan_end_handler = () => {
            if (this.is_panning) {
                this.is_panning = false;
                const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
                if (photoContainer) {
                    // Update current pan position
                    const currentTransform = photoContainer.style.transform || '';
                    const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                    if (translateMatch) {
                        this.pan_current_x = parseFloat(translateMatch[1]) || 0;
                        this.pan_current_y = parseFloat(translateMatch[2]) || 0;
                    }
                    // Restore cursor based on zoom level
                    if (this.zoom_level > 1) {
                        photoContainer.style.cursor = 'grab';
                    } else {
                        photoContainer.style.cursor = '';
                    }
                }
            }
        };

        // Add event listeners
        photoContainer.addEventListener('wheel', this.wheel_handler, { passive: false });
        photoContainer.addEventListener('touchstart', this.touch_start_handler, { passive: false });
        photoContainer.addEventListener('touchmove', this.touch_move_handler, { passive: false });
        photoContainer.addEventListener('touchend', this.touch_end_handler);
        photoContainer.addEventListener('mousedown', this.pan_start_handler);
        document.addEventListener('mousemove', this.pan_move_handler);
        document.addEventListener('mouseup', this.pan_end_handler);
    }

    remove_zoom_handlers() {
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;

        if (this.wheel_handler) {
            photoContainer.removeEventListener('wheel', this.wheel_handler);
        }
        if (this.touch_start_handler) {
            photoContainer.removeEventListener('touchstart', this.touch_start_handler);
        }
        if (this.touch_move_handler) {
            photoContainer.removeEventListener('touchmove', this.touch_move_handler);
        }
        if (this.touch_end_handler) {
            photoContainer.removeEventListener('touchend', this.touch_end_handler);
        }
        if (this.pan_start_handler) {
            photoContainer.removeEventListener('mousedown', this.pan_start_handler);
        }
        if (this.pan_move_handler) {
            document.removeEventListener('mousemove', this.pan_move_handler);
        }
        if (this.pan_end_handler) {
            document.removeEventListener('mouseup', this.pan_end_handler);
        }
    }

    zoom_at_point(centerX: number, centerY: number, delta: number) {
        const oldZoom = this.zoom_level;
        this.zoom_level = Math.max(this.zoom_min, Math.min(this.zoom_max, this.zoom_level + delta));
        
        if (oldZoom === this.zoom_level) return; // No change

        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;

        // Get current transform from container
        const currentTransform = photoContainer.style.transform || '';
        let currentTranslateX = 0;
        let currentTranslateY = 0;
        let currentScale = 1;
        
        // Extract current translation and scale from transform string
        const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
        const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
        
        if (translateMatch) {
            currentTranslateX = parseFloat(translateMatch[1]) || 0;
            currentTranslateY = parseFloat(translateMatch[2]) || 0;
        }
        if (scaleMatch) {
            currentScale = parseFloat(scaleMatch[1]) || 1;
        }

        // Calculate the point in the unzoomed coordinate system
        const unzoomedX = (centerX - currentTranslateX) / currentScale;
        const unzoomedY = (centerY - currentTranslateY) / currentScale;

        // Calculate new translation to keep the zoom point fixed
        const newTranslateX = centerX - unzoomedX * this.zoom_level;
        const newTranslateY = centerY - unzoomedY * this.zoom_level;

        // Apply transform to container - this will scale everything inside (image + shapes)
        // Combine with container translation for arrow key movement
        const totalX = this.container_translate_x + newTranslateX;
        const totalY = this.container_translate_y + newTranslateY;
        
        // Disable transition for faster response on button clicks
        photoContainer.style.transition = 'none';
        photoContainer.style.transform = `translate(${totalX}px, ${totalY}px) scale(${this.zoom_level})`;
        photoContainer.style.transformOrigin = '0 0';
        
        // Re-enable transition after a short delay for smooth scrolling
        setTimeout(() => {
            photoContainer.style.transition = 'transform 0.1s ease-out';
        }, 50);
        
        // Update pan position for dragging (without container translation, as that's separate)
        this.pan_current_x = newTranslateX;
        this.pan_current_y = newTranslateY;
        
        // Update cursor style and class based on zoom level
        if (this.zoom_level > 1) {
            photoContainer.style.cursor = 'grab';
            photoContainer.classList.add('zoom-active');
        } else {
            photoContainer.style.cursor = '';
            photoContainer.classList.remove('zoom-active');
        }
        
        // Apply counter-scale to labels to keep them at fixed size
        this.update_label_scale();
        
        // Recalculate label positions after zoom (with delay to ensure transform is applied)
        if (this.highlighting) {
            // Wait a bit for the transform to be applied, then recalculate
            setTimeout(() => {
                this.force_recalculate_face_positions();
                requestAnimationFrame(() => {
                    this.reset_label_positions();
                    this.adjust_label_overlaps();
                });
            }, 150);
        }
    }

    zoom_in(event?: Event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;
        
        // Always zoom from center
        const rect = photoContainer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        // Use larger step for button/touch interactions
        this.zoom_at_point(centerX, centerY, this.zoom_step_touch);
    }

    zoom_out(event?: Event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;
        
        // Always zoom from center
        const rect = photoContainer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        // Use larger step for button/touch interactions
        this.zoom_at_point(centerX, centerY, -this.zoom_step_touch);
    }

    reset_zoom(event?: Event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        this.zoom_level = 1;
        this.pan_current_x = 0;
        this.pan_current_y = 0;
        // Reset container translation
        this.container_translate_x = 0;
        this.container_translate_y = 0;
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (photoContainer) {
            photoContainer.style.transform = '';
            photoContainer.style.transformOrigin = '';
            photoContainer.style.cursor = '';
        }
        
        // Reset label scale
        this.update_label_scale();
        
        // Recalculate label positions after resetting zoom
        if (this.highlighting) {
            setTimeout(() => {
                this.force_recalculate_face_positions();
                requestAnimationFrame(() => {
                    this.reset_label_positions();
                    this.adjust_label_overlaps();
                });
            }, 100);
        }
    }

    // Update label scale to keep them at fixed size regardless of zoom
    update_label_scale() {
        const labels = document.querySelectorAll('.photo-faces-container .highlighted-face') as NodeListOf<HTMLElement>;
        labels.forEach(label => {
            if (this.zoom_level !== 1) {
                // Apply counter-scale to keep label at original visual size
                // This makes labels appear the same size regardless of zoom
                const counterScale = 1 / this.zoom_level;
                
                // Get current transform to preserve positioning
                const currentTransform = label.style.transform || '';
                let baseTransform = '';
                
                // Extract any existing translate transforms (for positioning)
                const translateMatches = currentTransform.match(/translate\([^)]+\)(?:\s+translate\([^)]+\))?/g);
                if (translateMatches) {
                    baseTransform = translateMatches.join(' ');
                } else if (currentTransform.includes('translateX')) {
                    // Preserve translateX if present
                    const translateXMatch = currentTransform.match(/translateX\([^)]+\)/);
                    if (translateXMatch) {
                        baseTransform = translateXMatch[0];
                    }
                }
                
                // Remove any existing scale from transform
                const transformWithoutScale = currentTransform.replace(/\s*scale\([^)]+\)/g, '').trim();
                if (transformWithoutScale && !baseTransform) {
                    baseTransform = transformWithoutScale;
                }
                
                // Apply counter-scale, preserving position transforms
                if (baseTransform) {
                    label.style.transform = `${baseTransform} scale(${counterScale})`;
                } else {
                    // Default position with scale
                    const defaultPos = label.style.top === '100%' ? 'translateX(-50%)' : '';
                    label.style.transform = defaultPos ? `${defaultPos} scale(${counterScale})` : `scale(${counterScale})`;
                }
                label.style.transformOrigin = 'center center';
            } else {
                // Reset scale, keep only position transforms
                const currentTransform = label.style.transform || '';
                const transformWithoutScale = currentTransform.replace(/\s*scale\([^)]+\)/g, '').trim();
                label.style.transform = transformWithoutScale || '';
                label.style.transformOrigin = '';
            }
        });
    }

    position_zoom_controls() {
        // Position zoom controls at top-right of photo container
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        const zoomControls = document.querySelector('.zoom-controls') as HTMLElement;
        
        if (photoContainer && zoomControls) {
            // Use requestAnimationFrame to ensure layout is complete
            requestAnimationFrame(() => {
                const containerRect = photoContainer.getBoundingClientRect();
                const slideEl = photoContainer.closest('.slide.full-size-photo') as HTMLElement;
                
                if (slideEl) {
                    const slideRect = slideEl.getBoundingClientRect();
                    // Calculate position relative to slide
                    const top = containerRect.top - slideRect.top + 10;
                    const right = slideRect.right - containerRect.right + 10;
                    
                    zoomControls.style.top = top + 'px';
                    zoomControls.style.right = right + 'px';
                }
            });
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
