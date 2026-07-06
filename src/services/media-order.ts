const date_keys = [
    'photo_date_datestr',
    'photo_date_str',
    'video_date_datestr',
    'video_date_str',
    'date_datestr',
    'date_str',
    'date'
];

const id_keys = ['photo_id', 'video_id', 'id', 'story_id', 'doc_id'];

function first_value(item, keys) {
    if (!item) return null;
    for (const key of keys) {
        const value = item[key];
        if (value !== null && value !== undefined && value !== '') {
            return value;
        }
    }
    return null;
}

function to_int(value) {
    const n = parseInt(String(value || '').replace(/[^\d-]/g, ''), 10);
    return isNaN(n) ? 0 : n;
}

export function media_date_value(item) {
    const raw = first_value(item, date_keys);
    if (!raw) return 0;

    const date_str = String(raw).trim();
    if (!date_str) return 0;

    const parts = date_str.split(/[.\-/]/)
        .map(part => part.trim())
        .filter(part => part.length > 0);

    let year = 0;
    let month = 0;
    let day = 0;

    if (parts.length >= 3) {
        const first = to_int(parts[0]);
        const second = to_int(parts[1]);
        const third = to_int(parts[2]);

        if (parts[0].length === 4 || first > 31) {
            year = first;
            month = second;
            day = third;
        } else {
            day = first;
            month = second;
            year = third;
        }
    } else if (parts.length === 2) {
        const first = to_int(parts[0]);
        const second = to_int(parts[1]);

        if (parts[0].length === 4 || first > 31) {
            year = first;
            month = second;
        } else {
            month = first;
            year = second;
        }
    } else {
        year = to_int(parts[0] || date_str);
    }

    if (!year) return 0;

    month = 1 <= month && month <= 12 ? month : 12;
    day = 1 <= day && day <= 31 ? day : 31;

    return year * 10000 + month * 100 + day;
}

export function media_id_value(item) {
    const id = first_value(item, id_keys);
    return Number(id || 0) || 0;
}

export function compare_media_newest_first(item1, item2) {
    const date1 = media_date_value(item1);
    const date2 = media_date_value(item2);
    if (date1 !== date2) return date2 - date1;
    return media_id_value(item2) - media_id_value(item1);
}

export function sort_media_newest_first(list) {
    if (!list) return [];
    return list.slice(0).sort(compare_media_newest_first);
}

export function compare_member_media_videos_first(item1, item2) {
    const item1_is_video = item1 && item1.video_id ? 1 : 0;
    const item2_is_video = item2 && item2.video_id ? 1 : 0;
    if (item1_is_video !== item2_is_video) return item2_is_video - item1_is_video;
    return compare_media_newest_first(item1, item2);
}

export function sort_member_media_videos_first(list) {
    if (!list) return [];
    return list.slice(0).sort(compare_member_media_videos_first);
}
