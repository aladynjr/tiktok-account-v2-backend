

//this provides the request url for the videos batch 
export function getRecentVideosContentURL(user, count, startCur) {
    if (typeof user.id === 'undefined') {
        throw new IllegalArgument("Passed User must have an id set.");
    }

    return 'https://m.tiktok.com/api/item_list/?user_agent=&minCursor=0'
        + `&maxCursor=${startCur}&id=${user.id}&count=${count}&sourceType=${TYPE_RECENT_VIDEOS}`;
}

//this 
async function getUploadedVideosBatch(this, count, startCur, user) {
    const contentURL = getRecentVideosContentURL(user, count, startCur);

    return getVideosBatch.call(this, contentURL);
}

async function getVideosBatch(this, url) {
    const content = await this.getTiktokContent(url);

    return typeof content.items === 'undefined' ? 
        { 
            videos: [], 
            cur: '-1', 
        } : { 
            videos: content.items.map((v) => getVideoInfoFromContent(v)), 
            cur: content.maxCursor, 
        };
}


export async function* getVideoGenerator(subset, count, startCur) {
    let nextCur = startCur;

    while (true) {
        const batch = await subset(count, nextCur, type);
        nextCur = batch.cur;

        if (batch.videos.length === 0) {
            return [];
        }

        yield batch.videos;
    }
}


app.getUploadedVideos = function (user, { count = 30, startCur = '0' }) {
    return getVideoGenerator(getUploadedVideosBatch.bind(this), count, startCur, user);
}

