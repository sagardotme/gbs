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
    zoom_enabled = false;
    resize_subscription;
    container_resize_observer: ResizeObserver;
    zoom_level = 1;
    // Keep the "base" view at 100%: never zoom out smaller than fit-to-width behavior.
    zoom_min = 1;
    // Allow zoom-in 50% more than the previous max (was 9x); this keeps your requested "extra 50%" range.
    zoom_max = 13.5;
    zoom_step = 0.1;
    // Touch responsiveness: used by pinch + on-screen +/- buttons.
    // Keep it higher than desktop wheel zoom, but still stable.
    zoom_step_touch = 0.75; // 1.5x more responsive than the previous 0.5
    zoom_center_x = 0;
    zoom_center_y = 0;
    is_zooming = false;
    last_touch_distance = 0;
    is_panning = false;
    pending_pan = false;
    pan_activation_threshold = 6; // px movement before we treat a 1-finger touch as a pan (avoids jitter when starting pinch)
    pan_start_x = 0;
    pan_start_y = 0;
    pan_current_x = 0;
    pan_current_y = 0;
    pan_animation_frame = 0;
    pan_target_x = 0;
    pan_target_y = 0;
    pan_target_ease = false;
    pan_target_container: HTMLElement = null;
    last_tap_time = 0;
    last_tap_x = 0;
    last_tap_y = 0;
    double_tap_threshold = 320;
    double_tap_max_movement = 14;
    face_min_size_pct = 0.5;
    face_max_size_pct = 80;
    wheel_handler;
    touch_start_handler;
    touch_move_handler;
    touch_end_handler;
    pan_start_handler;
    pan_move_handler;
    pan_end_handler;
    double_click_handler;
    container_translate_x = 0;
    container_translate_y = 0;
    global_wheel_preventer;
    global_keydown_preventer;
    global_gesture_start_preventer;
    global_gesture_change_preventer;
    global_gesture_end_preventer;
    global_touchmove_preventer;
    global_gesture_last_scale = 1;
    // When zoom is actively changing, temporarily ignore drag/pan events coming from interact.js
    // to avoid conflicts between pinch/button zoom and drag_move_photo.
    drag_lock_until = 0;
    last_zoom_client_x: number = null;
    last_zoom_client_y: number = null;
    label_reposition_timeout;
    shape_positioning_timeout;
    private apply_mobile_label_size(label: HTMLElement) {
        if (this.theme.is_desktop) {
            label.style.fontSize = '';
            return;
        }
        const stored = label.getAttribute('data-base-font');
        let baseFont = stored || window.getComputedStyle(label).fontSize;
        if (!stored && baseFont) {
            label.setAttribute('data-base-font', baseFont);
        }
        const numeric = parseFloat(baseFont || '0') || 12;
        label.style.fontSize = `${numeric}px`;
    }
    private isContentLargerThanWrapper(): boolean {
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        const wrapper = document.querySelector('.photo-content-wrapper') as HTMLElement;
        if (!photoContainer || !wrapper) return false;

        const scale = this.zoom_level || 1;
        const baseWidth = photoContainer.offsetWidth || photoContainer.clientWidth || 0;
        const baseHeight = photoContainer.offsetHeight || photoContainer.clientHeight || 0;
        const scaledWidth = baseWidth * scale;
        const scaledHeight = baseHeight * scale;

        const wrapperRect = wrapper.getBoundingClientRect();
        return scaledWidth > wrapperRect.width || scaledHeight > wrapperRect.height;
    }
    clamp_translate(photoContainer: HTMLElement, desiredX: number, desiredY: number) {
        const wrapper = document.querySelector('.photo-content-wrapper') as HTMLElement;
        if (!photoContainer || !wrapper) {
            return { x: desiredX, y: desiredY };
        }

        const scale = this.zoom_level || 1;
        const baseWidth = photoContainer.offsetWidth || photoContainer.clientWidth || 0;
        const baseHeight = photoContainer.offsetHeight || photoContainer.clientHeight || 0;
        const scaledWidth = baseWidth * scale;
        const scaledHeight = baseHeight * scale;

        const wrapperRect = wrapper.getBoundingClientRect();
        const wrapperWidth = wrapperRect.width;
        const wrapperHeight = wrapperRect.height;

        let minX = wrapperWidth - scaledWidth;
        let maxX = 0;
        let minY = wrapperHeight - scaledHeight;
        let maxY = 0;

        // When the scaled content is smaller than the wrapper, keep it centered and non-draggable
        if (scaledWidth <= wrapperWidth) {
            const centerX = (wrapperWidth - scaledWidth) / 2;
            minX = maxX = centerX;
            desiredX = centerX;
            this.container_translate_x = 0;
            this.pan_current_x = 0;
        }
        if (scaledHeight <= wrapperHeight) {
            const centerY = (wrapperHeight - scaledHeight) / 2;
            minY = maxY = centerY;
            desiredY = centerY;
            this.container_translate_y = 0;
            this.pan_current_y = 0;
        }

        const clampedX = Math.max(minX, Math.min(maxX, desiredX));
        const clampedY = Math.max(minY, Math.min(maxY, desiredY));
        return { x: clampedX, y: clampedY };
    }

    private recenter_if_small_or_unzoomed(useEase = true) {
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        const wrapper = document.querySelector('.photo-content-wrapper') as HTMLElement;
        if (!photoContainer || !wrapper) return;

        const scale = this.zoom_level || 1;
        const baseWidth = photoContainer.offsetWidth || photoContainer.clientWidth || 0;
        const baseHeight = photoContainer.offsetHeight || photoContainer.clientHeight || 0;
        const wrapperRect = wrapper.getBoundingClientRect();
        const scaledWidth = baseWidth * scale;
        const scaledHeight = baseHeight * scale;

        const shouldRecentre = scale <= 1.01 || scaledWidth <= wrapperRect.width || scaledHeight <= wrapperRect.height;
        if (!shouldRecentre) return;

        this.container_translate_x = 0;
        this.container_translate_y = 0;
        this.pan_current_x = 0;
        this.pan_current_y = 0;

        const clamped = this.clamp_translate(photoContainer, 0, 0);
        this.queue_pan_transform(photoContainer, clamped.x, clamped.y, useEase);
    }

    private queue_pan_transform(container: HTMLElement, desiredX: number, desiredY: number, useEase = false) {
        if (!container) return;
        // Store the latest desired transform; apply it on the next animation frame.
        // Important: do NOT cancel & reschedule frames on every pointer event, as that can cause
        // visible stutter/lag on mobile (especially when touchmove fires near the frame boundary).
        this.pan_target_container = container;
        this.pan_target_x = desiredX;
        this.pan_target_y = desiredY;
        this.pan_target_ease = useEase;

        if (this.pan_animation_frame) return;

        this.pan_animation_frame = requestAnimationFrame(() => {
            this.pan_animation_frame = 0;
            const container = this.pan_target_container;
            if (!container) return;

            const desiredX = this.pan_target_x;
            const desiredY = this.pan_target_y;
            const useEase = this.pan_target_ease;
            const scale = this.zoom_level > 1 ? this.zoom_level : 1;

            container.style.transition = useEase ? 'transform 0.08s ease-out' : 'none';
            const clamped = this.clamp_translate(container, desiredX, desiredY);

            if (scale > 1) {
                container.style.transform = `translate(${clamped.x}px, ${clamped.y}px) scale(${scale})`;
                container.style.transformOrigin = '0 0';
                // Track pan offset (relative to any base container translation)
                this.pan_current_x = clamped.x - this.container_translate_x;
                this.pan_current_y = clamped.y - this.container_translate_y;
            } else {
                container.style.transform = `translate(${clamped.x}px, ${clamped.y}px)`;
                container.style.transformOrigin = '';
                // When not zoomed, translation is owned by container_translate_* (pan_* is ignored)
                this.container_translate_x = clamped.x;
                this.container_translate_y = clamped.y;
                this.pan_current_x = 0;
                this.pan_current_y = 0;
            }
        });
    }

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

        // On mobile, tag the dialog container to take full viewport
        if (!this.theme.is_desktop) {
            setTimeout(() => {
                const dialog = document.querySelector('ux-dialog-container');
                if (dialog) {
                    dialog.classList.add('photo-fullscreen-mobile');
                    // Prevent horizontal scroll
                    document.body.style.overflowX = 'hidden';
                }
            }, 0);
        }
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
        if (this.label_reposition_timeout) {
            clearTimeout(this.label_reposition_timeout);
            this.label_reposition_timeout = null;
        }
        if (this.pan_animation_frame) {
            cancelAnimationFrame(this.pan_animation_frame);
            this.pan_animation_frame = 0;
        }
        // Remove zoom event handlers
        this.remove_zoom_handlers();
        this.remove_global_zoom_prevention();
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
        if (!this.isContentLargerThanWrapper()) {
            return;
        }
        
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
            this.queue_pan_transform(container, totalX, totalY, !this.is_panning);
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
        
        this.apply_zoom_capability(true);

        this.resize_subscription = this.eventAggregator.subscribe('WINDOW-RESIZED', () => {
            this.apply_zoom_capability(false);
        });

        // Set up resize observer for label overlap detection
        this.setup_label_overlap_detection();
        // Set up resize observer for photo-faces-container
        this.setup_container_resize_observer();
        // Position zoom controls relative to photo
        this.position_zoom_controls();
    }

    detached() {
        this.remove_zoom_handlers();
        this.remove_global_zoom_prevention();
        if (this.resize_subscription) {
            this.resize_subscription.dispose();
            this.resize_subscription = null;
        }
        // Clean up window resize handler
        if (this.resize_handler) {
            window.removeEventListener('resize', this.resize_handler);
            this.resize_handler = null;
        }
        // Clean up container resize observer
        if (this.container_resize_observer) {
            this.container_resize_observer.disconnect();
            this.container_resize_observer = null;
        }
    }

    private determine_zoom_enabled() {
        // Allow zoom only on touch-first devices (phones/tablets), never on laptops/desktops
        try {
            if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
                return true;
            }
        } catch (e) {
            console.log('matchMedia not available, falling back for zoom detection');
        }
        // Secondary check for touch, but only on narrow viewports to avoid small laptops with touchpads
        const touchPoints = (navigator.maxTouchPoints || 0) > 0;
        return touchPoints && this.theme.width <= 1024;
    }

    private apply_zoom_capability(force=false) {
        const shouldEnable = this.determine_zoom_enabled();
        if (!force && shouldEnable === this.zoom_enabled) {
            this.position_zoom_controls();
            return;
        }
        this.zoom_enabled = shouldEnable;
        this.remove_zoom_handlers();
        this.remove_global_zoom_prevention();
        if (this.zoom_enabled) {
            this.setup_zoom_handlers();
            this.setup_global_zoom_prevention();
        } else {
            this.reset_zoom();
        }
        this.position_zoom_controls();
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
                // Reposition after data arrives
                this.schedule_shape_positioning();
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
                // Reposition after data arrives
                this.schedule_shape_positioning();
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

    // Effective scale must include the current zoom transform; boundingClientRect values
    // already reflect zoom, so we need both the base scale and zoom factor to convert
    // screen-space deltas to original image coordinates.
    private getEffectiveScale(): number {
        const baseScale = this.getScaleFactor();
        const zoom = this.zoom_level || 1;
        return baseScale * zoom;
    }

    private clampPercent(value: number, min: number, max: number) {
        if (isNaN(value)) return min;
        return Math.min(max, Math.max(min, value));
    }

    // Wait for image and then (re)position shapes/labels. Debounced to avoid thrashing
    // when faces/articles arrive separately or during resize.
    private schedule_shape_positioning() {
        if (this.shape_positioning_timeout) {
            clearTimeout(this.shape_positioning_timeout);
        }
        this.shape_positioning_timeout = window.setTimeout(() => {
            this.shape_positioning_timeout = null;
            this.wait_for_image_rendered().then(() => {
                this.update_face_stroke();
                this.force_recalculate_face_positions();
                if (this.highlighting) {
                    this.reset_label_positions();
                    this.adjust_label_overlaps();
                }
            });
        }, 120);
    }

    private update_face_stroke() {
        const container = document.querySelector('.photo-faces-container') as HTMLElement;
        const dims = this.getImageDisplayDimensions();
        if (!container || !dims) return;
        // Stroke about 0.4% of image width, clamped for sanity.
        // Desktop/laptop: make it ~2x thicker (requested) and allow a higher cap so it actually changes.
        const baseStroke = Math.round(dims.width * 0.004);
        const isDesktop = !!this.theme?.is_desktop;
        const stroke = isDesktop
            ? Math.max(4, Math.min(16, baseStroke * 2))
            : Math.max(2, Math.min(8, baseStroke));
        container.style.setProperty('--face-stroke', `${stroke}px`);
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

        // Use percentage-based positioning with clamped size to avoid outlier tiny/huge shapes
        const cx = (face.x / pw) * 100;
        const cy = (face.y / ph) * 100;
        const widthPctRaw = (d / pw) * 100;
        const heightPctRaw = (d / ph) * 100;

        const widthPct = this.clampPercent(widthPctRaw, this.face_min_size_pct, this.face_max_size_pct);
        const heightPct = this.clampPercent(heightPctRaw, this.face_min_size_pct, this.face_max_size_pct);

        const left = this.clampPercent(cx - widthPct / 2, 0, 100 - widthPct);
        const top = this.clampPercent(cy - heightPct / 2, 0, 100 - heightPct);

        return {
            left: `${left}%`,
            top: `${top}%`,
            width: `${widthPct}%`,
            height: `${heightPct}%`,
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
        // Calculate scale factor using actual image dimensions and current zoom (not container)
        let scale = this.getEffectiveScale();
        // Convert click position to original image coordinates (where faces are stored)
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
        let scale = this.getEffectiveScale();
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
        // Calculate scale factor using actual image dimensions and current zoom (not container)
        let scale = this.getEffectiveScale();
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
        // Calculate scale factor using actual image dimensions and current zoom (not container)
        let scale = this.getEffectiveScale();
        
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
            // While pinch-zooming (or immediately after a zoom step), ignore drag to prevent conflicts
            // between zoom math and container translation.
            if (this.is_zooming || this.is_panning || this.pending_pan || Date.now() < (this.drag_lock_until || 0)) {
                return;
            }
            if (!this.isContentLargerThanWrapper()) {
                return;
            }
            let event = customEvent.detail;
            // Move only photo-faces-container, not the entire full-size-photo
            let container = document.querySelector('.photo-faces-container') as HTMLElement;
            if (container) {
                this.container_translate_x += event.dx;
                this.container_translate_y += event.dy;
                // Touch drag should be "snappy": no easing during movement.
                const totalX = this.container_translate_x + (this.zoom_level > 1 ? this.pan_current_x : 0);
                const totalY = this.container_translate_y + (this.zoom_level > 1 ? this.pan_current_y : 0);
                this.queue_pan_transform(container, totalX, totalY, false);
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
        // Hide circles immediately during the fullscreen transition so they don't flash
        // at an incorrect size/position.
        if (this.highlighting) {
            const root = document.getElementById("full-size-photo");
            if (root) root.classList.remove("highlight-faces");
            if (this.show_circles_timeout) {
                clearTimeout(this.show_circles_timeout);
                this.show_circles_timeout = null;
            }
        }

        // Fullscreen the slide wrapper (NOT just the image) so circles/labels stay in the same
        // coordinate space as the photo.
        const el: any =
            document.querySelector(".slide.full-size-photo") ||
            document.getElementById("full-size-photo");

        const req =
            el && (el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen);

        if (req) {
            try {
                const ret = req.call(el);
                if (ret && typeof ret.then === 'function') {
                    await ret;
                }
            } catch (e) {
                console.log("Fullscreen request failed", e);
            }
        } else {
            console.log("Fullscreen API is not supported");
        }
        await sleep(100);
        this.calc_percents();
    }

    fullscreen_change(event) {
        // Always hide circles during enter/exit fullscreen; image sizing changes and we re-show
        // only after the new layout is stable (handled by image_loaded -> show_circles_with_delay).
        if (this.highlighting) {
            const root = document.getElementById("full-size-photo");
            if (root) root.classList.remove("highlight-faces");
            if (this.show_circles_timeout) {
                clearTimeout(this.show_circles_timeout);
                this.show_circles_timeout = null;
            }
        }
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
        // If circles are currently shown, hide them immediately while we reflow the image and
        // recompute positions. We'll re-show after `wait_for_image_rendered()` completes.
        if (this.highlighting) {
            const root = document.getElementById("full-size-photo");
            if (root) root.classList.remove("highlight-faces");
            if (this.show_circles_timeout) {
                clearTimeout(this.show_circles_timeout);
                this.show_circles_timeout = null;
            }
        }
        this.image_height = this.slide[this.slide.side].height;
        this.image_width = this.slide[this.slide.side].width;
        this.calc_percents();
        // Wait for image to be fully rendered, especially important on mobile
            this.wait_for_image_rendered().then(() => {
                // Reposition zoom controls after image loads
                this.position_zoom_controls();
                // Set consistent face stroke based on rendered size
                this.update_face_stroke();
                // Center the image when unzoomed or smaller than the wrapper
                this.recenter_if_small_or_unzoomed(true);
                // Reposition faces/labels after image is settled
                this.schedule_shape_positioning();
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
            const maxAttempts = 120; // ~2.4 second max wait (120 * 20ms)
            
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
                    if (hasDisplaySize) {
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
                    const sizesMatch = (imgWidth > 0 && Math.abs(container.offsetWidth - imgWidth) < 5);
                    
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
                    if (img && container) {
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
        
        if (img && container) {
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
        // Keep transforms stable (do not write inline transform/origin); CSS handles zoom counter-scale.
        this.faces.forEach(face => {
            let el = document.getElementById('face-' + face.member_id);
            if (el) {
                let label = el.querySelector('.highlighted-face') as HTMLElement;
                if (label) {
                    label.style.top = '100%'; // Reset to default
                    this.apply_mobile_label_size(label); // Adjust font size for mobile
                    // Clear any legacy inline overrides so stylesheet rules apply
                    label.style.transform = '';
                    label.style.transformOrigin = '';
                    label.style.removeProperty('--label-offset-y');
                }
            }
        });
        this.articles.forEach(article => {
            let el = document.getElementById('article-' + article.article_id);
            if (el) {
                let label = el.querySelector('.highlighted-face') as HTMLElement;
                if (label) {
                    label.style.top = '100%'; // Reset to default
                    this.apply_mobile_label_size(label); // Adjust font size for mobile
                    // Clear any legacy inline overrides so stylesheet rules apply
                    label.style.transform = '';
                    label.style.transformOrigin = '';
                    label.style.removeProperty('--label-offset-y');
                }
            }
        });
    }

    setup_label_overlap_detection() {
        // Adjust labels on window resize
        this.resize_handler = () => {
            // Reposition zoom controls on resize
            this.position_zoom_controls();
            this.update_face_stroke();
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
            this.recenter_if_small_or_unzoomed(true);
        };
        window.addEventListener('resize', this.resize_handler);
    }

    setup_container_resize_observer() {
        // Clean up existing observer if any
        if (this.container_resize_observer) {
            this.container_resize_observer.disconnect();
            this.container_resize_observer = null;
        }

        // Wait a bit for the container to be available in the DOM
        setTimeout(() => {
            const container = document.querySelector('.photo-faces-container') as HTMLElement;
            if (!container) {
                return;
            }

            // Create ResizeObserver to watch for container size changes
            this.container_resize_observer = new ResizeObserver(() => {
                // When container resizes, recalculate shape positions and sizes
                if (this.highlighting) {
                    // Wait for image to be re-rendered, then recalculate
                    this.wait_for_image_rendered().then(() => {
                        this.force_recalculate_face_positions();
                        requestAnimationFrame(() => {
                            this.reset_label_positions();
                            this.adjust_label_overlaps();
                        });
                    });
                } else {
                    // Even if highlighting is off, recalculate positions
                    this.schedule_shape_positioning();
                }
            });

            // Start observing the container
            this.container_resize_observer.observe(container);
        }, 100);
    }

    // Helper function to check if two rectangles overlap
    private rectanglesOverlap(rect1: DOMRect, rect2: DOMRect, padding: number = 1): boolean {
        // Reduced padding to allow labels to be closer together
        return !(rect1.right + padding < rect2.left - padding || 
                 rect1.left - padding > rect2.right + padding ||
                 rect1.bottom + padding < rect2.top - padding || 
                 rect1.top - padding > rect2.bottom + padding);
    }

    // Shift labels vertically to avoid overlap by adding a translateY offset
    private nudge_labels_down(labels: HTMLElement[], padding: number = 4) {
        if (!labels || labels.length === 0) return;
        const sorted = [...labels].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        let prevBottom = -Infinity;
        sorted.forEach(label => {
            const rect = label.getBoundingClientRect();
            let offset = 0;
            if (rect.top < prevBottom + padding) {
                offset = (prevBottom + padding) - rect.top;
            }
            // Store vertical offset in a CSS variable so we don't rewrite transform/origin.
            label.style.setProperty('--label-offset-y', `${offset}px`);
            prevBottom = rect.top + offset + rect.height;
        });
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

    // Helper to get the current visual label size (accounts for zoom/counter-scale)
    private getLabelVisualSize(label: HTMLElement): {width: number, height: number} {
        const rect = label.getBoundingClientRect();
        const width = rect.width || label.offsetWidth || label.clientWidth;
        const height = rect.height || label.offsetHeight || label.clientHeight;
        return { width, height };
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

        // Position labels at bottom-center of their shapes.
        // IMPORTANT: Keep label font size static (do not shrink based on count/overlap),
        // and keep label visual size constant while zooming (counter-scale transform).
        const labels = document.querySelectorAll('.photo-faces-container .highlighted-face') as NodeListOf<HTMLElement>;
        labels.forEach(label => {
            this.apply_mobile_label_size(label);
            label.style.top = '100%';
            label.style.left = '50%';
            // Keep transforms stable; rely on stylesheet transform with CSS variables
            label.style.transform = '';
            label.style.transformOrigin = '';
            label.style.removeProperty('--label-offset-y');
        });

        // Ensure labels keep a constant on-screen size while zooming.
        this.update_label_scale(false);

        this.clearConnectingLines();
    }

    // Zoom functionality
    private zoom_to_photo_from_global_input(delta: number, clientX?: number, clientY?: number) {
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;

        const rect = photoContainer.getBoundingClientRect();
        const centerX = typeof clientX === 'number' ? Math.max(0, Math.min(rect.width, clientX - rect.left)) : rect.width / 2;
        const centerY = typeof clientY === 'number' ? Math.max(0, Math.min(rect.height, clientY - rect.top)) : rect.height / 2;

        this.zoom_at_point(centerX, centerY, delta);
    }

    setup_global_zoom_prevention() {
        if (!this.zoom_enabled) return;
        // Prevent browser-level zoom when photo viewer is open
        this.global_wheel_preventer = (event: WheelEvent) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const containerExists = document.querySelector('.photo-content-wrapper');
            if (!containerExists) return;
            event.preventDefault();
            event.stopPropagation();
            const delta = event.deltaY > 0 ? -this.zoom_step_touch : this.zoom_step_touch;
            this.zoom_to_photo_from_global_input(delta, event.clientX, event.clientY);
        };

        this.global_keydown_preventer = (event: KeyboardEvent) => {
            const containerExists = document.querySelector('.photo-content-wrapper');
            if (!containerExists) return;
            const key = event.key;
            const isZoomKey = key === '+' || key === '=' || key === '-' || key === '_' || key === '0';
            if (!isZoomKey || !(event.ctrlKey || event.metaKey)) return;

            event.preventDefault();
            event.stopPropagation();

            if (key === '0') {
                this.reset_zoom();
                return;
            }

            const delta = (key === '-' || key === '_') ? -this.zoom_step_touch : this.zoom_step_touch;
            this.zoom_to_photo_from_global_input(delta);
        };

        // Safari mobile pinch zoom uses gesture events
        this.global_gesture_start_preventer = (event: any) => {
            const containerExists = document.querySelector('.photo-content-wrapper');
            if (!containerExists) return;
            event.preventDefault();
            this.global_gesture_last_scale = event.scale || 1;
        };
        this.global_gesture_change_preventer = (event: any) => {
            const containerExists = document.querySelector('.photo-content-wrapper');
            if (!containerExists) return;
            event.preventDefault();
            // Only prevent browser/page zoom here. Actual pinch-zoom of the photo is handled
            // by the touch handlers on the photo container (for correct center math and to avoid
            // double-applying zoom on Safari where both gesture and touch events may fire).
            this.global_gesture_last_scale = event.scale || 1;
        };
        this.global_gesture_end_preventer = (event: any) => {
            const containerExists = document.querySelector('.photo-content-wrapper');
            if (!containerExists) return;
            event.preventDefault();
            this.global_gesture_last_scale = 1;
        };

        // Block pinch gestures from zooming the entire page while viewer is open
        this.global_touchmove_preventer = (event: TouchEvent) => {
            const containerExists = document.querySelector('.photo-content-wrapper');
            if (!containerExists) return;
            if (event.touches && event.touches.length > 1) {
                event.preventDefault();
            }
        };

        window.addEventListener('wheel', this.global_wheel_preventer, { passive: false, capture: true });
        window.addEventListener('keydown', this.global_keydown_preventer, { passive: false, capture: true });
        window.addEventListener('gesturestart', this.global_gesture_start_preventer, { passive: false, capture: true });
        window.addEventListener('gesturechange', this.global_gesture_change_preventer, { passive: false, capture: true });
        window.addEventListener('gestureend', this.global_gesture_end_preventer, { passive: false, capture: true });
        window.addEventListener('touchmove', this.global_touchmove_preventer, { passive: false, capture: true });
    }

    remove_global_zoom_prevention() {
        if (this.global_wheel_preventer) {
            window.removeEventListener('wheel', this.global_wheel_preventer, { capture: true } as any);
            this.global_wheel_preventer = null;
        }
        if (this.global_keydown_preventer) {
            window.removeEventListener('keydown', this.global_keydown_preventer, { capture: true } as any);
            this.global_keydown_preventer = null;
        }
        if (this.global_gesture_start_preventer) {
            window.removeEventListener('gesturestart', this.global_gesture_start_preventer, { capture: true } as any);
            this.global_gesture_start_preventer = null;
        }
        if (this.global_gesture_change_preventer) {
            window.removeEventListener('gesturechange', this.global_gesture_change_preventer, { capture: true } as any);
            this.global_gesture_change_preventer = null;
        }
        if (this.global_gesture_end_preventer) {
            window.removeEventListener('gestureend', this.global_gesture_end_preventer, { capture: true } as any);
            this.global_gesture_end_preventer = null;
        }
        if (this.global_touchmove_preventer) {
            window.removeEventListener('touchmove', this.global_touchmove_preventer, { capture: true } as any);
            this.global_touchmove_preventer = null;
        }
        this.global_gesture_last_scale = 1;
    }

    setup_zoom_handlers() {
        if (!this.zoom_enabled) return;
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;
        photoContainer.style.willChange = 'transform';

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

        // Double-click zoom toggle (desktop)
        this.double_click_handler = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('button') || target.closest('.zoom-controls') || target.closest('#cropper') || this.cropping) return;

            const rect = photoContainer.getBoundingClientRect();
            const centerX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
            const centerY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
            if (this.zoom_level > 1.01) {
                this.reset_zoom();
            } else {
                this.zoom_at_point(centerX, centerY, this.zoom_step_touch * 2);
            }
        };

        // Touch pinch zoom for mobile
        this.touch_start_handler = (event: TouchEvent) => {
            const target = event.target as HTMLElement;
            const isInteractive = !!(target.closest('button.face') || target.closest('.zoom-controls'));

            if (event.touches.length === 2) {
                // Always allow a two-finger gesture to initiate pinch zoom (even if it starts on a face button)
                event.preventDefault();
                this.pending_pan = false;
                this.is_zooming = true;
                this.is_panning = false;
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];
                this.last_touch_distance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                return;
            }

            // Don't interfere with single-finger interactions on face buttons / zoom controls
            if (isInteractive) {
                return;
            }

            if (event.touches.length === 1 && this.zoom_level > 1 && !this.marking_face_active && !this.cropping) {
                // Don't start panning immediately (avoids jitter when the user is about to place a 2nd finger to pinch).
                event.preventDefault();
                this.pending_pan = true;
                this.is_panning = false;
                this.is_zooming = false;

                const touch = event.touches[0];
                this.pan_start_x = touch.clientX;
                this.pan_start_y = touch.clientY;

                // Capture current translate as the pan base (subtract container translation, which is tracked separately)
                const currentTransform = photoContainer.style.transform || '';
                const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                if (translateMatch) {
                    const totalX = parseFloat(translateMatch[1]) || 0;
                    const totalY = parseFloat(translateMatch[2]) || 0;
                    this.pan_current_x = totalX - this.container_translate_x;
                    this.pan_current_y = totalY - this.container_translate_y;
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

                // Zoom from the midpoint between the two touches (natural pinch behavior)
                const rect = photoContainer.getBoundingClientRect();
                const midX = (touch1.clientX + touch2.clientX) / 2;
                const midY = (touch1.clientY + touch2.clientY) / 2;
                const centerX = Math.max(0, Math.min(rect.width, midX - rect.left));
                const centerY = Math.max(0, Math.min(rect.height, midY - rect.top));

                const distanceDelta = currentDistance - this.last_touch_distance;
                // Use touch-specific step for a faster, smoother pinch response
                const zoomDelta = (distanceDelta / 80) * this.zoom_step_touch;
                
                this.zoom_at_point(centerX, centerY, zoomDelta);
                this.last_touch_distance = currentDistance;
            } else if (event.touches.length === 1 && this.pending_pan && this.zoom_level > 1) {
                // Only promote to actual panning after meaningful movement (prevents "jump" when starting a 2nd pinch)
                event.preventDefault();
                const touch = event.touches[0];
                const dx = touch.clientX - this.pan_start_x;
                const dy = touch.clientY - this.pan_start_y;
                const dist = Math.hypot(dx, dy);
                if (dist >= this.pan_activation_threshold) {
                    this.pending_pan = false;
                    this.is_panning = true;
                    // While dragging, update immediately (no easing).
                    photoContainer.style.transition = 'none';
                    // Reset start to current point so we don't jump by the pre-threshold movement
                    this.pan_start_x = touch.clientX;
                    this.pan_start_y = touch.clientY;
                } else {
                    return;
                }
            }

            if (event.touches.length === 1 && this.is_panning && this.zoom_level > 1) {
                // Pan when zoomed in
                event.preventDefault();
                const touch = event.touches[0];
                const deltaX = touch.clientX - this.pan_start_x;
                const deltaY = touch.clientY - this.pan_start_y;

                // Incremental deltas (not "from start") so panning stays 1:1 with the finger
                // and does not get sticky when clamped at the edges.
                this.pan_start_x = touch.clientX;
                this.pan_start_y = touch.clientY;
                this.pan_current_x += deltaX;
                this.pan_current_y += deltaY;

                // Apply pan transform - combine with container translation
                const desiredX = this.container_translate_x + this.pan_current_x;
                const desiredY = this.container_translate_y + this.pan_current_y;
                // Touch pan should track the finger directly: no easing during move.
                this.queue_pan_transform(photoContainer, desiredX, desiredY, false);
            }
        };

        this.touch_end_handler = (event?: TouchEvent) => {
            if (this.is_zooming) {
                this.is_zooming = false;
                this.last_touch_distance = 0;
            }
            // Any touch end cancels the "maybe pan" state; we may re-enter it below if a finger remains.
            this.pending_pan = false;
            if (this.is_panning) {
                this.is_panning = false;
                if (this.pan_animation_frame) {
                    cancelAnimationFrame(this.pan_animation_frame);
                    this.pan_animation_frame = 0;
                }
                photoContainer.style.transition = 'transform 0.12s ease-out';
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

            // Double-tap to toggle zoom in/out at tap location (mobile convenience)
            if (
                event &&
                event.changedTouches &&
                event.changedTouches.length === 1 &&
                event.touches &&
                event.touches.length === 0 &&
                !this.is_zooming &&
                !this.is_panning &&
                !this.marking_face_active &&
                !this.cropping
            ) {
                const now = Date.now();
                const touch = event.changedTouches[0];
                const dx = Math.abs(touch.clientX - this.last_tap_x);
                const dy = Math.abs(touch.clientY - this.last_tap_y);
                const isClose = dx <= this.double_tap_max_movement && dy <= this.double_tap_max_movement;
                if (now - this.last_tap_time < this.double_tap_threshold && isClose) {
                    const rect = photoContainer.getBoundingClientRect();
                    const centerX = Math.max(0, Math.min(rect.width, touch.clientX - rect.left));
                    const centerY = Math.max(0, Math.min(rect.height, touch.clientY - rect.top));
                    if (this.zoom_level > 1.01) {
                        this.reset_zoom();
                    } else {
                        this.zoom_at_point(centerX, centerY, this.zoom_step_touch * 2);
                    }
                    this.last_tap_time = 0;
                    return;
                }
                this.last_tap_time = now;
                this.last_tap_x = touch.clientX;
                this.last_tap_y = touch.clientY;
            }

            // If a pinch ended with one finger still down, transition into a "pending pan" for that remaining finger.
            if (
                event &&
                event.touches &&
                event.touches.length === 1 &&
                this.zoom_level > 1 &&
                !this.marking_face_active &&
                !this.cropping
            ) {
                const touch = event.touches[0];
                this.pending_pan = true;
                this.pan_start_x = touch.clientX;
                this.pan_start_y = touch.clientY;

                const currentTransform = photoContainer.style.transform || '';
                const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                if (translateMatch) {
                    const totalX = parseFloat(translateMatch[1]) || 0;
                    const totalY = parseFloat(translateMatch[2]) || 0;
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
                photoContainer.style.transition = 'transform 0.08s ease-out';
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
                const desiredX = this.container_translate_x + newX;
                const desiredY = this.container_translate_y + newY;
                this.queue_pan_transform(photoContainer, desiredX, desiredY, true);
            }
        };

        this.pan_end_handler = () => {
            if (this.is_panning) {
                this.is_panning = false;
                const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
                if (photoContainer) {
                    if (this.pan_animation_frame) {
                        cancelAnimationFrame(this.pan_animation_frame);
                        this.pan_animation_frame = 0;
                    }
                    photoContainer.style.transition = 'transform 0.12s ease-out';
                    // Update current pan position
                    const currentTransform = photoContainer.style.transform || '';
                    const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                    if (translateMatch) {
                        const totalX = parseFloat(translateMatch[1]) || 0;
                        const totalY = parseFloat(translateMatch[2]) || 0;
                        this.pan_current_x = totalX - this.container_translate_x;
                        this.pan_current_y = totalY - this.container_translate_y;
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
        photoContainer.addEventListener('dblclick', this.double_click_handler);
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
        if (this.double_click_handler) {
            photoContainer.removeEventListener('dblclick', this.double_click_handler);
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
        if (!this.zoom_enabled) return;
        const oldZoom = this.zoom_level;
        this.zoom_level = Math.max(this.zoom_min, Math.min(this.zoom_max, this.zoom_level + delta));
        
        if (oldZoom === this.zoom_level) return; // No change
        // While zoom is changing, ignore interact-driven drag for a short window
        this.drag_lock_until = Date.now() + 120;
        if (this.pan_animation_frame) {
            cancelAnimationFrame(this.pan_animation_frame);
            this.pan_animation_frame = 0;
        }

        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;

        // Remember the last zoom focal point in client coords so subsequent button zooms continue around it.
        const rectForClient = photoContainer.getBoundingClientRect();
        this.last_zoom_client_x = rectForClient.left + centerX;
        this.last_zoom_client_y = rectForClient.top + centerY;

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

        // Keep the chosen point fixed in the viewport by adjusting translation based on the
        // ratio between the new and current scales. centerX/centerY are in the *current*
        // scaled coordinate system (relative to the element's bounding rect).
        const safeCurrentScale = currentScale || 1;
        const ratio = this.zoom_level / safeCurrentScale;
        let totalX = currentTranslateX + centerX * (1 - ratio);
        let totalY = currentTranslateY + centerY * (1 - ratio);

        const clamped = this.clamp_translate(photoContainer, totalX, totalY);
        totalX = clamped.x;
        totalY = clamped.y;
        
        // Disable transition for faster response on button clicks
        photoContainer.style.transition = 'none';
        photoContainer.style.transform = `translate(${totalX}px, ${totalY}px) scale(${this.zoom_level})`;
        photoContainer.style.transformOrigin = '0 0';
        
        // Re-enable transition after a short delay for smooth scrolling
        setTimeout(() => {
            photoContainer.style.transition = 'transform 0.1s ease-out';
        }, 50);
        
        // Update pan position for dragging (without container translation, as that's separate)
        this.pan_current_x = totalX - this.container_translate_x;
        this.pan_current_y = totalY - this.container_translate_y;
        
        // Update cursor style and class based on zoom level
        if (this.zoom_level > 1) {
            photoContainer.style.cursor = 'grab';
            photoContainer.classList.add('zoom-active');
        } else {
            photoContainer.style.cursor = '';
            photoContainer.classList.remove('zoom-active');
        }
        
        // Apply label scaling so text follows zoom
        this.update_label_scale();
        
        // Recalculate label positions after zoom using the new label size
        if (this.highlighting) {
            this.force_recalculate_face_positions();
            requestAnimationFrame(() => this.adjust_label_overlaps());
        }

        // When zoomed out or image fits inside the wrapper, keep it centered and lock vertical pan
        if (this.zoom_level <= 1.01 || !this.isContentLargerThanWrapper()) {
            this.recenter_if_small_or_unzoomed(true);
        }
    }

    zoom_in(event?: Event) {
        if (!this.zoom_enabled) return;
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;

        // Zoom around the last focal point if available; otherwise around the wrapper viewport center.
        const rect = photoContainer.getBoundingClientRect();
        const wrapper = document.querySelector('.photo-content-wrapper') as HTMLElement;
        const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
        let clientX: number = null;
        let clientY: number = null;

        if (typeof this.last_zoom_client_x === 'number' && typeof this.last_zoom_client_y === 'number') {
            // Only reuse if it's still inside the container's current rect (otherwise it will clamp oddly)
            if (
                this.last_zoom_client_x >= rect.left &&
                this.last_zoom_client_x <= rect.right &&
                this.last_zoom_client_y >= rect.top &&
                this.last_zoom_client_y <= rect.bottom
            ) {
                clientX = this.last_zoom_client_x;
                clientY = this.last_zoom_client_y;
            }
        }

        if (clientX == null || clientY == null) {
            if (wrapperRect) {
                clientX = wrapperRect.left + wrapperRect.width / 2;
                clientY = wrapperRect.top + wrapperRect.height / 2;
            } else {
                clientX = rect.left + rect.width / 2;
                clientY = rect.top + rect.height / 2;
            }
        }

        const centerX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const centerY = Math.max(0, Math.min(rect.height, clientY - rect.top));
        
        // Use larger step for button/touch interactions
        this.zoom_at_point(centerX, centerY, this.zoom_step_touch);
    }

    zoom_out(event?: Event) {
        if (!this.zoom_enabled) return;
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (!photoContainer) return;

        // Zoom around the last focal point if available; otherwise around the wrapper viewport center.
        const rect = photoContainer.getBoundingClientRect();
        const wrapper = document.querySelector('.photo-content-wrapper') as HTMLElement;
        const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
        let clientX: number = null;
        let clientY: number = null;

        if (typeof this.last_zoom_client_x === 'number' && typeof this.last_zoom_client_y === 'number') {
            if (
                this.last_zoom_client_x >= rect.left &&
                this.last_zoom_client_x <= rect.right &&
                this.last_zoom_client_y >= rect.top &&
                this.last_zoom_client_y <= rect.bottom
            ) {
                clientX = this.last_zoom_client_x;
                clientY = this.last_zoom_client_y;
            }
        }

        if (clientX == null || clientY == null) {
            if (wrapperRect) {
                clientX = wrapperRect.left + wrapperRect.width / 2;
                clientY = wrapperRect.top + wrapperRect.height / 2;
            } else {
                clientX = rect.left + rect.width / 2;
                clientY = rect.top + rect.height / 2;
            }
        }

        const centerX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const centerY = Math.max(0, Math.min(rect.height, clientY - rect.top));
        
        // Use larger step for button/touch interactions
        this.zoom_at_point(centerX, centerY, -this.zoom_step_touch);
    }

    reset_zoom(event?: Event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        if (this.pan_animation_frame) {
            cancelAnimationFrame(this.pan_animation_frame);
            this.pan_animation_frame = 0;
        }
        this.zoom_level = 1;
        this.last_zoom_client_x = null;
        this.last_zoom_client_y = null;
        this.pan_current_x = 0;
        this.pan_current_y = 0;
        // Reset container translation
        this.container_translate_x = 0;
        this.container_translate_y = 0;
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        if (photoContainer) {
            // Recenter within wrapper when not zoomed in
            const clamped = this.clamp_translate(photoContainer, 0, 0);
            photoContainer.style.transform = `translate(${clamped.x}px, ${clamped.y}px)`;
            photoContainer.style.transformOrigin = '';
            photoContainer.style.cursor = '';
            this.pan_current_x = clamped.x - this.container_translate_x;
            this.pan_current_y = clamped.y - this.container_translate_y;
            this.recenter_if_small_or_unzoomed(true);
        }
        
        // Reset label scale
        this.update_label_scale();
        
        // Recalculate label positions after resetting zoom
        if (this.highlighting) {
            this.force_recalculate_face_positions();
            requestAnimationFrame(() => this.adjust_label_overlaps());
        }
    }

    // Labels: damped zoom (non-linear).
    //
    // The photo container scales by `zoom_level` (z). We want labels to scale with the photo, but much less,
    // so text stays readable at high zoom.
    //
    // We use a log2 curve so each 2x zoom increases label size by ~30%:
    //   labelScaleOnScreen = 1 + 0.30 * log2(z)
    // Examples:
    //   z=1  -> 1.0x
    //   z=2  -> 1.3x
    //   z=4  -> 1.6x
    //
    // Since the label lives inside the scaled container, we set a *local* scale so the on-screen
    // result matches the formula:
    //   localScale = labelScaleOnScreen / z
    //
    // IMPORTANT: Do not write inline `transform` / `transform-origin` on zoom; that causes jitter and
    // fights with positioning logic. Only update the CSS variable.
    update_label_scale(schedule = true) {
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        const zRaw = (this.zoom_enabled && this.zoom_level) ? this.zoom_level : 1;
        const z = zRaw && zRaw > 0 ? zRaw : 1;
        const damp = 0.30;
        const log2 = Math.log(z) / Math.log(2);
        const labelScaleOnScreen = 1 + damp * log2;
        const localScale = labelScaleOnScreen / z;
        // Keep precision high to avoid visible drift in long pinch gestures
        const localScaleRounded = Math.round(localScale * 1000000) / 1000000;
        if (photoContainer) {
            photoContainer.style.setProperty('--label-scale', `${localScaleRounded}`);
        }

        if (schedule && this.highlighting) {
            this.schedule_label_reposition();
        }
    }

    schedule_label_reposition() {
        if (!this.highlighting) return;
        if (this.label_reposition_timeout) {
            clearTimeout(this.label_reposition_timeout);
        }
        this.label_reposition_timeout = window.setTimeout(() => {
            this.label_reposition_timeout = null;
            this.adjust_label_overlaps();
        }, 30);
    }

    position_zoom_controls() {
        const zoomControls = document.querySelector('.zoom-controls') as HTMLElement;
        if (!this.zoom_enabled) {
            if (zoomControls) {
                zoomControls.style.display = 'none';
            }
            return;
        } else if (zoomControls) {
            zoomControls.style.display = '';
        }
        // Position zoom controls at top-right of photo container
        const photoContainer = document.querySelector('.photo-faces-container') as HTMLElement;
        
        if (photoContainer && zoomControls) {
            // Use requestAnimationFrame to ensure layout is complete
            requestAnimationFrame(() => {
                const containerRect = photoContainer.getBoundingClientRect();
                const slideEl = photoContainer.closest('.slide.full-size-photo') as HTMLElement;
                
                // On mobile, if container has no size yet (image not loaded), keep default CSS position to prevent jumpiness
                if (!this.theme.is_desktop && (!containerRect.width || !containerRect.height)) {
                    zoomControls.style.top = '10px';
                    zoomControls.style.right = '10px';
                    return;
                }

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
