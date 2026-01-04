import {autoinject, singleton} from "aurelia-framework";
import { Misc } from '../services/misc';

let YT;
enum PlayerStates {
    UNSTARTED = -1,
    ENDED,
    PLAYING,
    PAUSED,
    BUFFERING,
    CUED = 5
}

@autoinject()
@singleton()
export class YtKeeper {
    player;
    player_is_ready = false;
    playerState;
    misc;
    pending_source = null;
    ready_resolvers = [];

    constructor(misc: Misc) {
        console.log("yt keeper constructed");
        this.misc = misc;
        YT = this;
        //this.create();
    }


    created() {
        console.log("youtube player created. this player: ", this.player);
        if (this.player) {
            this.reconnect_iframe();
            return;
        }
        let tag = document.getElementById('youtube-script') as HTMLScriptElement;
        if (!tag) {
            tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            tag.id = 'youtube-script';
            let firstScriptTag = document.getElementsByTagName('script')[0];
            console.log("firstScriptTag: ", firstScriptTag);
            if (firstScriptTag && firstScriptTag.parentNode) {
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            } else {
                document.head.appendChild(tag);
            }
        } else if ((<any>window).YT && (<any>window).YT.Player) {
            this.create_player();
        }
        // 3. This function creates an <iframe> (and YouTube player)
        //    after the API code downloads.
        (<any>window).onYouTubeIframeAPIReady = () => {
            this.create_player();
        }
    }

    attached() {
        this.reconnect_iframe();
        this.ensure_player_ready();
    }

    create_player() {
        if (this.player) return;
        const target = document.getElementById('ytplayer');
        if (!target) return;
        this.player = new (<any>window).YT.Player('ytplayer', {
            height: '100%',
            width: '100%',
            videoId: '', //'M7lc1UVf-VE', //'OTnLL_2-Dj8', //  'M7lc1UVf-VE',
            playerVars: {
                'playsinline': 1
            },
            events: {
                'onReady': this.onPlayerReady,
                'onStateChange': this.onPlayerStateChange
            }
        });
        console.log("---API is ready. player is ", this.player);
    }

    ensure_player_ready(retries=10) {
        if (this.player) {
            this.reconnect_iframe();
            return;
        }
        const hasYT = (<any>window).YT && (<any>window).YT.Player;
        const target = document.getElementById('ytplayer');
        if (hasYT && target) {
            this.create_player();
            return;
        }
        if (retries > 0) {
            setTimeout(() => this.ensure_player_ready(retries - 1), 100);
        }
    }

    onPlayerReady(event) {
        console.log("--------------===player is ready?")
        YT.player_is_ready = true;
        YT.reconnect_iframe();
        if (YT.pending_source) {
            YT.player.loadVideoById(YT.pending_source);
            YT.pending_source = null;
        }
        YT.resolve_ready_waiters(true);
    }

    onPlayerStateChange(event) {
        YT.playerState = event.data;
    }

    get currentTime() {
        return this.player.getCurrentTime();
    }

    set currentTime(ct) {
        this.player.seekTo(ct);
    }

    set videoSource(src) {
        console.log("set video source ", src);
        this.pending_source = src;
        if (!this.player || !this.player_is_ready) return;
        this.player.loadVideoById(src);
        this.pending_source = null;
    }

    async waitForReady(timeout=15000) {
        if (this.player_is_ready) return true;
        return new Promise(resolve => {
            let timer;
            const resolver = (ok=true) => {
                clearTimeout(timer);
                resolve(ok);
            };
            timer = setTimeout(() => {
                this.ready_resolvers = this.ready_resolvers.filter(fn => fn !== resolver);
                resolve(false);
            }, timeout);
            this.ready_resolvers.push(resolver);
        });
    }

    resolve_ready_waiters(result) {
        while (this.ready_resolvers.length) {
            let resolve_fn = this.ready_resolvers.shift();
            resolve_fn(result);
        }
    }

    reconnect_iframe() {
        if (!this.player || typeof this.player.getIframe !== 'function') return;
        const shell = <HTMLElement>document.querySelector('.yt-player-shell');
        const iframe = this.player.getIframe();
        if (shell && iframe && iframe.parentElement !== shell) {
            shell.innerHTML = '';
            shell.appendChild(iframe);
        }
    }

    get state() {
        return this.playerState;
    }

    get paused() {
        return this.playerState != PlayerStates.PLAYING;
    }

    get buffering() {
        return this.playerState == PlayerStates.BUFFERING;
    }

    set paused(p) {
        if (p) {
            this.pause();
        } else {
            this.player.playVideo();
        }
    }

    async pause() {
        console.log("Pause now!")
        let ready = await this.waitForReady(1000);
        if (!ready || !this.player) return;
        this.player.pauseVideo();
    }

}
