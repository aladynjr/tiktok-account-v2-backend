const express = require('express');
const cors = require('cors');
const fs = require("fs");
const clc = require('cli-color');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const os = require('os');
const exec = require('child_process').exec;
const archiver = require('archiver');
const path = require('path');

const app = express();
app.use(express.json())

const corsOptions = {
    origin: '*',
    credentials: true,
    optionSuccessStatus: 200,
}

app.use(cors(corsOptions))
puppeteer.use(StealthPlugin())

const HOST = 'localhost:8080';

//SPREADSHEET 
// spreadsheet key is the long id in the sheets URL
const RESPONSES_SHEET_ID = '1Kp4jEz394KUrzI-PgHmd_mHxYNizCYkqmyGNGGx82Ow';
// Create a new document
const doc = new GoogleSpreadsheet(RESPONSES_SHEET_ID);
// Credentials for the service account
const CREDENTIALS = JSON.parse(fs.readFileSync('cloudkey.json'));


//set exectuable path for puppeteer
const osPlatform = os.platform();
console.log('Scraper running on platform: ', osPlatform);
let executablePath;
if (/^win/i.test(osPlatform)) {
    //make sure this is the correct path to your chrome.exe file !
    executablePath = "C://Program Files//Google//Chrome//Application//chrome.exe";
} else if (/^linux/i.test(osPlatform)) {
    executablePath = "/usr/bin/google-chrome";
}

const userAgents = [
    'Mozilla/5.0 (X11; U; Linux armv6l; rv 1.8.1.5pre) Gecko/20070619 Minimo/0.020',
    'Mozilla/5.0 (hp-tablet; Linux; hpwOS/3.0.2; U; de-DE) AppleWebKit/534.6 (KHTML, like Gecko) wOSBrowser/234.40.1 Safari/534.6 TouchPad/1.0',
    'Mozilla/5.0 (X11; U; Linux i686; pt-PT; rv:1.9.2.3) Gecko/20100402 Iceweasel/3.6.3 (like Firefox/3.6.3) GTB7.0',
    'Mozilla/5.0 (X11; Linux x86_64; en-US; rv:2.0b2pre) Gecko/20100712 Minefield/4.0b2pre',
    'Links (2.1pre15; Linux 2.4.26 i686; 158x61)',
    'Mozilla/5.0 (X11; Linux) KHTML/4.9.1 (like Gecko) Konqueror/4.9',
    'Mozilla/5.0 (X11; U; Linux; i686; en-US; rv:1.6) Gecko Epiphany/1.2.5',
    'ELinks (0.4pre5; Linux 2.6.10-ac7 i686; 80x33)',
    'Mozilla/5.0 (X11; U; Linux x86_64; en-US; rv:1.9.1.13) Gecko/20100916 Iceape/2.0.8',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.85 Safari/537.36 OPR/32.0.1948.25',
    'Opera/9.80 (X11; Linux x86_64; U; pl) Presto/2.7.62 Version/11.00',
    'Uzbl (Webkit 1.3) (Linux i686 [i686])',
    'Links/0.9.1 (Linux 2.4.24; i386;)',
    'Mozilla/5.0 (X11; U; Linux armv6l; rv 1.8.1.5pre) Gecko/20070619 Minimo/0.020',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.21 (KHTML, like Gecko) konqueror/4.14.10 Safari/537.21',
    'Mozilla/5.0 (X11; U; Linux arm7tdmi; rv:1.8.1.11) Gecko/20071130 Minimo/0.025',
    'Links (2.1pre15; Linux 2.4.26 i686; 158x61)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.166 Safari/537.36 OPR/20.0.1396.73172',
    ' Mozilla/5.0 (X11; Linux x86_64; en-US; rv:2.0b2pre) Gecko/20100712 Minefield/4.0b2pre',
    ' Mozilla/5.0 (X11; U; Linux x86_64; en-US; rv:1.9.1.17) Gecko/20110123 SeaMonkey/2.0.12',
]


const ZipFolder = (folderName, zipName) => {
    return new Promise((resolve, reject) => {
        var output = fs.createWriteStream(`./tiktoks/${zipName}.zip`);
        var archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        output.on('close', function () {
            //   console.log('archiver has been finalized and the output file descriptor has closed.');
            resolve()

        });

        output.on('end', function () {
            console.log('Data has been drained');
        });

        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                // log warning
            } else {
                // throw error
                reject(err)
            }
        });

        archive.on('error', function (err) {
            reject(err)
        });

        archive.pipe(output);
        archive.directory(`./tiktoks/${folderName}`, false);

        archive.finalize();
    })

}


function runShellCommand(command) {
    //send a download message to the client with emitter after 3 seconds (this should run asynchronously to not block the main thread)
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.warn(error);
            }
            resolve(stdout ? stdout : stderr);
        });
    });
}


const UpdateSpreadsheet = async (videosData, path, username, videoCount, followerCount, hasNewVideos) => {
    if (doc.sheetsByTitle[username]) {
        console.log(clc.blue('sheet already exists, deleting it'))
        await doc.sheetsByTitle[username].delete();
    }
    await doc.addSheet({ title: username });


    let sheet = doc.sheetsByTitle[username];
    await sheet.setHeaderRow(['account followers','account posts' ,'download all videos', 'download new videos', 'id', 'description ', 'link', 'sound link', 'views', 'likes', 'comments', 'shares', 'download link', 'upload date', 'download status',]);
    console.log(clc.green('added row headers to new sheet '))

    //get list of videos in folder username 
    var files = fs.readdirSync(path);

    var videosDataCleaneed = videosData.map((video, i) => {
        //get hashtags titles from challenges
        var hashtags = '';
        if (video.challenges) {
            video.challenges.map((challenge) => {
                hashtags += '#' + challenge?.title + ' '
            })
        }
        var musicTitle = video.music.title.trim().replace(/ /g, '-');

        var videoDownloaded = files.find(file => file.startsWith(video.id))
        var uploadDate = new Date(video.createTime * 1000).toISOString().slice(0, 10)

        var videoDownloadLink = `${HOST}/redirect/video/${username}/${video.id}`;

        var zipDownloadLink = `${HOST}/redirect/zip/${username}`
        var newZipDownloadLink = `${HOST}/redirect/zip/${username}-new`

        return {
            id: video.id,
            description: video.desc,
            link: `https://www.tiktok.com/@${username}/video/${video.id}`,
            'sound link': 'https://www.tiktok.com/music/' + musicTitle + '-' + video.music.id,
            views: video.stats.playCount,
            likes: video.stats.diggCount,
            comments: video.stats.commentCount,
            shares: video.stats.shareCount,
            'download link': videoDownloadLink,
            'upload date': uploadDate,
            'download status': videoDownloaded ? 'downloaded' : 'FAILED',
            'download all videos' : (i==0) ? zipDownloadLink : '' ,
            'account followers' :  (i==0) ? followerCount  : '',
            'account posts' : (i==0) ?  videoCount  : '',
            'download new videos' : (hasNewVideos && (i==0)) ? newZipDownloadLink : ''
        }
    }
    )

    await sheet.addRows(videosDataCleaneed);
    console.log(clc.green('added rows to new sheet '))

}


const GetUserId = async (videoId, page) => {
    var link = `https://m.tiktok.com/api/item/detail/?agent_user=&itemId=${videoId}`

    //send a requset to link and log reponse to console
    await page.goto(link, { waitUntil: 'networkidle2', timeout: 0 });
    const response = await page.evaluate(() => {
        if (document.body.innerHTML) {
            var json = document.body.innerHTML.replace(/<[^>]*>?/gm, '');
            return json;
        } else {
            return 'no body'
        }
    }
    );

    var data = JSON.parse(response)
    if(!data){
        console.log(clc.red('WE DID NOT GET DATA'))
    }
   /* fs.writeFile('user.json', response, function (err) {
        if (err) throw err;
        console.log('saved!');
    });*/

    var userId = data.itemInfo.itemStruct.author.id
    var username = data.itemInfo.itemStruct.author.uniqueId
    var videoCount = data.itemInfo.itemStruct.authorStats.videoCount
    var followerCount = data.itemInfo.itemStruct.authorStats.followerCount
    console.log(clc.green('got user id : ' + userId + '   and username : ' + username))

    return { userId, username ,videoCount, followerCount }
}


app.get('/api/:id', async (req, res) => {
    const videoId = req.params.id;


    (async () => {

        const browser = await puppeteer.launch({
            headless: true,
            executablePath: executablePath,
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--enable-webgl',
                '--window-size=1860,1400',
                '--disable-seccomp-filter-sandbox',
                //  '--proxy-server=' + Proxy

            ]
        });

        try {
            console.log('connecting to spreadsheet...');

            await doc.useServiceAccountAuth({
                client_email: CREDENTIALS.client_email,
                private_key: CREDENTIALS.private_key
            });
            await doc.loadInfo();


            const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
            console.log(clc.blue('user agent: ', ua))

            const page = await browser.newPage();
            console.log('Puppeteer is running...');

            await page.setUserAgent(ua);

           // var videoLink = 'https://www.tiktok.com/@saba._.tabaza/video/7172605008582659330?is_copy_url=1&is_from_webapp=v1';

          //  var videoId = videoLink.substring(videoLink.indexOf('/video/') + 7, videoLink.indexOf('/video/') + 7 + 19);


            const { userId, username ,videoCount, followerCount } = await GetUserId(videoId, page)

            var totalNumberOfVideos = 0;
            var videosData = [];


            const GetVideosList = async (startCur = 0, count = 30) => {
                var link = `https://m.tiktok.com/api/item_list/?minCursor=0&maxCursor=${startCur}&id=${userId}&sourceType=8&count=${count}`

                //send a requset to link and log reponse to console
                await page.goto(link, { waitUntil: 'networkidle2', timeout: 0 });
                const response = await page.evaluate(() => {
                    if (document.body.innerHTML) {
                        var json = document.body.innerHTML.replace(/<[^>]*>?/gm, '');
                        return json;
                    } else {
                        return 'no body'
                    }
                }
                );
                console.log(clc.green('response : ' + response.substring(0, 100)))

                var data = JSON.parse(response)
                videosData = videosData.concat(data.items)

                console.log(clc.green('we got ' + data.items.length + ' videos'))
                totalNumberOfVideos += data.items.length

                if (data.hasMore) {
                    startCur = data.maxCursor
                    console.log(clc.magenta('we got more videos, startCur is now ' + startCur))


                    //wait for 3 seconds 
                    await page.waitForTimeout(3000)
                    await GetVideosList(startCur)

                } else {

                    console.log(clc.green('no more videos'))
                    console.log('-----------------------')

                    console.log(clc.yellow('total number of videos is ' + totalNumberOfVideos))


                    //check if there's a folder in tiktoks folder with username as name
                    var path = `./tiktoks/${username}`

                    if (fs.existsSync(path)) {
                        console.log(clc.magenta('OLD USER : we have already scraped this user ' + username))

                        //---HANDLE OLD PROFILE ---

                        //get all files in folder
                        var oldVideos = fs.readdirSync(path);
                        console.log(clc.blue('we have ' + oldVideos.length + ' videos in folder already downloaded'))

                        var newVideosData = [];
                        var links;

                        videosData.forEach(video => {
                            if (!oldVideos.includes(video.id + '.mp4')) {
                                newVideosData.push(video)

                                if (!links) links = ''
                                links += `https://www.tiktok.com/@${username}/video/${video.id} `;

                            }
                        })


                        if (!links) {
                            console.log(clc.yellow('NO NEW VIDEOS TO DOWNLOAD'))

                            UpdateSpreadsheet(videosData, path, username, videoCount, followerCount)

                        }
                        else {

                            //NEW VIDEOS TO DOWNLOAD IN OLD PROFILE 

                            var videosToDownload = links.split(' ')?.length - 1
                            console.log(clc.blue('videos to download : ' + videosToDownload + ' videos. starting download... '))

                            var downloadedVideosCount = 0;
                            var isDownloading = true;

                            //track how many new videos we've downloaded
                            var interval = setInterval(async () => {
                                if (isDownloading) {
                                    var files = fs.readdirSync(path);
                                    //only count files that end with .mp4 not .part
                                    files = files.filter(file => file.endsWith('.mp4'))
                                    var previousDownloadedVideosCount = downloadedVideosCount;
                                    downloadedVideosCount = (files.length) - (oldVideos?.length);
                                    if (downloadedVideosCount > previousDownloadedVideosCount) {

                                        console.log(clc.green('we have downloaded ' + downloadedVideosCount + '/' + videosToDownload + ' videos'))
                                    }

                                } else {
                                    clearInterval(interval)
                                }
                            }, 50)


                            runShellCommand(`yt-dlp -v  --output /tiktoks/${username}/%(id)s.%(ext)s ${links}`)
                                .then(async (result) => {
                                    console.log(clc.green('downloaded videos to folder ' + path))
                                    isDownloading = false;

                                    var allVideos = fs.readdirSync(path);
                                    var newVideos = allVideos.filter(video => !oldVideos.includes(video))

                                    //create another folder in tiktoks folder username+random,
                                    var newFolderName = `${username}-new`
                                    fs.mkdirSync(`./tiktoks/${newFolderName}`);

                                    //and copy newVideos to it
                                    newVideos.forEach(video => {
                                        fs.copyFileSync(`./tiktoks/${username}/${video}`, `./tiktoks/${newFolderName}/${video}`)
                                    })

                                    console.log(clc.green('copied new videos to seperate folder ' + newFolderName))


                                    //check if zip file username.zip exists, and if it does delete it 
                                    if (fs.existsSync(`/tiktoks/${username}.zip`)) {
                                        fs.unlinkSync(`/tiktoks/${username}.zip`)
                                        console.log(clc.green('deleted old zip file ' + username + '.zip'))
                                    }
                                    if (fs.existsSync(`/tiktoks/${newFolderName}.zip`)) {
                                        fs.unlinkSync(`/tiktoks/${newFolderName}.zip`)
                                        console.log(clc.green('deleted old new videos zip file ' + newFolderName + '.zip'))
                                    }

                                    ZipFolder(username, username)
                                        .then(() => {
                                            console.log(clc.green('profile folder zipped'))

                                            ZipFolder(newFolderName, newFolderName)
                                                .then(() => {
                                                    console.log(clc.green('new videos folder zipped'))

                                                    UpdateSpreadsheet(videosData, path, username, videoCount, followerCount, true)

                                                })
                                        })
                                })
                                .catch((error) => {
                                    console.log(error);
                                });
                        }


                    } else {
                        console.log(clc.magenta('NEW USER : we havent scraped this user yet ' + username))

                        //--- HANDLE NEW PROFILE ---

                        var links = ''
                        videosData.forEach(video => {
                            links += `https://www.tiktok.com/@${username}/video/${video.id} `
                        })

                        var videosToDownload = links.split(' ')?.length - 1
                        console.log(clc.blue('videos to download : ' + videosToDownload + ' videos. starting download... '))

                        //create new folder
                        fs.mkdirSync(path);

                        var downloadedVideosCount = 0;
                        var isDownloading = true;

                        //track how many new videos we've downloaded
                        var interval = setInterval(async () => {
                            if (isDownloading) {
                                var files = fs.readdirSync(path);
                                //only count files that end with .mp4 not .part
                                files = files.filter(file => file.endsWith('.mp4'))
                                var previousDownloadedVideosCount = downloadedVideosCount;
                                downloadedVideosCount = files.length;
                                if (downloadedVideosCount > previousDownloadedVideosCount) {
                                    console.log(clc.green('we have downloaded ' + downloadedVideosCount + '/' + videosToDownload + ' videos'))
                                }

                            } else {
                                clearInterval(interval)
                            }
                        }, 50)
                        runShellCommand(`yt-dlp -v  --output /tiktoks/${username}/%(id)s.%(ext)s ${links}`)
                            .then(async (result) => {
                                console.log(clc.green('downloaded videos to folder ' + path))
                                isDownloading = false;




                                ZipFolder(username, username)
                                    .then(() => {
                                        console.log(clc.green('new profile folder zipped'))

                                        UpdateSpreadsheet(videosData, path, username, videoCount, followerCount)

                                    })


                            })
                            .catch((error) => {
                                console.log(error);
                            });

                        // zip whole folder
                    }
                }}

            await GetVideosList();

            //chek if we've already scraped videos in the past

        } catch (e) {
            console.log(e)
        }
        finally {
            console.log('closing browser using finally')
            //  await browser.close();
        }
    })()
})


//download videos route using a video name and a folder name
app.get('/redirect/video/:folderName/:videoName', (req, res) => {
    const videoName = req.params.videoName;
    console.log(clc.blue('redirected  video : ' + videoName + 'for download'));
    res.sendFile(path.join(__dirname + '/download.html'));
});

//download videos route using a video name and a folder name
app.get('/download/video/:folderName/:videoName', (req, res) => {
    const videoName = req.params.videoName;
    const folderName = req.params.folderName;
    console.log(clc.blue('received video : ' + videoName + 'for download'));
    const file = `./tiktoks/${folderName}/${videoName}.mp4`;
    res.download(file);
});


//redirect route to download zip file
app.get('/redirect/zip/:folderName', (req, res) => {
    const folderName = req.params.folderName;
    console.log('redirecting to download zip file: ' + folderName);
    res.sendFile(path.join(__dirname + '/download.html'));
});


//download route to download zip file
app.get('/download/zip/:folderName', (req, res) => {
    const folderName = req.params.folderName;
    console.log('folder name: ' + folderName);
    const file = `./tiktoks/${folderName}.zip`;
    res.download(file); // Set disposition and send it.
});

app.get('/', (req, res) => {
    res.json('this is working fine')
})

app.listen(8080, () => {
    console.log('Server running on port 8080')
    console.log('time is ' + new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
})
