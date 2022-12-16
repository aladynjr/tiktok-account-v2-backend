const express = require('express');
const fs = require('fs');
const cors = require('cors');
const randomUseragent = require('random-useragent');
const puppeteer = require('puppeteer-extra')
const request = require('request');
const cheerio = require('cheerio');
const os = require('os');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const app = express();
const clc = require('cli-color');
const path = require('path');
const EventEmitter = require('node:events');
const exec = require('child_process').exec;
const uuidv4 = require('uuid').v4;
var zipper = require("zip-local");
const Airtable = require('airtable');
const axios = require('axios');
const ObjectsToCsv = require('objects-to-csv');

// Google sheet npm package
const { GoogleSpreadsheet } = require('google-spreadsheet');
// spreadsheet key is the long id in the sheets URL
const RESPONSES_SHEET_ID = '180tSiten5LqevY9sOc2OztT9GkeTkMd29E_Jr3-EL2U';
// Create a new document
const doc = new GoogleSpreadsheet(RESPONSES_SHEET_ID);
// Credentials for the service account
const CREDENTIALS = JSON.parse(fs.readFileSync('cloudkey.json'));

app.use(express.json({ limit: '50mb' }));

//increase 
const corsOptions = {
    origin: '*',
    credentials: true,            //access-control-allow-credentials:true
    optionSuccessStatus: 200,
}

app.use(cors(corsOptions)) // Use this after the variable declaration


//SPREAD SHEET 
async function CheckIfSheetExists(sheetName) {
    await doc.useServiceAccountAuth({
        client_email: CREDENTIALS.client_email,
        private_key: CREDENTIALS.private_key
    });

    await doc.loadInfo();

    // Index of the sheet
    let sheet = doc.sheetsByTitle[sheetName];
    return sheet;

}


//check if we scraped an account before 
app.get('/check/:username', async (req, res) => {

    const username = req.params.username;


    await doc.useServiceAccountAuth({
        client_email: CREDENTIALS.client_email,
        private_key: CREDENTIALS.private_key
    });

    await doc.loadInfo();

    // Index of the sheet
    let sheet = doc.sheetsByTitle[username];

    if (sheet) {

        //get the last row in that sheet 
        const rows = await sheet.getRows();

        //get the last row in that sheet
        const lastRow = rows[rows.length - 1];

        console.log(clc.green('username exists in spreadsheet ! WE SCRAPED THIS ACCOUNT IN THE PAST'))
        console.log('last video : ' + lastRow._rawData[3])
        res.send({ "message": "username exists in spreadsheet ! WE SCRAPED THIS ACCOUNT IN THE PAST", 'row': lastRow._rawData[3] });

    } else {
        console.log(clc.red('username DOES NOT exist in spreadsheet, FRESH ACCOUNT'))
        res.send({ "message": "username DOES NOT exist in spreadsheet, FRESH ACCOUNT" });

        /*
        //create a new sheet with the username as name
        await doc.addSheet({ title: username });
        console.log(clc.blue('created new sheet with name  : ' + username))

        //create columns (row headers)
        let sheet = doc.sheetsByTitle[username];
        await sheet.setHeaderRow(['videoId','username', 'videoName','videoLink',  'musicLink', 'downloadLink']);

        console.log(clc.blue('added row headers to new sheet '))*/


    }

})



//AIRTABLE 
Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: 'key320l6hCLmpsd4F'
});

const base = new Airtable({ apiKey: 'key320l6hCLmpsd4F' }).base('appyEOmHmMzD6EEhJ');
//airtable table has 4 columns : Tiktok Username, Videos Download Link, N° of Videos, Date / Time
//add dummy data to airtable
function addDataToAirtable(username, link, numberOfVideos, lastDownloadedVideos) {

    base('Table 1').create([
        {
            "fields": {
                "Tiktok Username": username,
                "Videos Download Link": link,
                "N° of Videos": numberOfVideos,
                "Last Downloaded Videos ": lastDownloadedVideos
            }
        }
    ], function (err, records) {
        if (err) {
            console.error(err);
            return;
        }
        records.forEach(function (record) {
            console.log(record.getId());
        });
    });
}



//GET MUSIC IDS
var videosList = [
    'https://www.tiktok.com/@celestexoxo454/video/7158658192883322158',

]
//GET MUSIC IDS
/*videosList.forEach(async (link) => {
    await axios.get(`https://api.douyin.wtf/api?url=${link}`)
        .then(resp => {
            if (resp.data.status === "success") {
                //write response to a json file ds.json
                //  fs.writeFileSync('ds.json', JSON.stringify(resp.data));

                var musicId = resp.data.video_music_id;
                var musicTitle = resp.data.video_music_title;


                if (musicTitle.includes('original sound')) {
                    musicTitle = 'original-sound'
                }
                musicTitle = musicTitle.replace(/\s/g, '-');

                // console.log(clc.blue('music id : ' + musicId + '  music title : ' + musicTitle))
                console.log(clc.blue('link : ' + link + '  api url : ' + `https://api.douyin.wtf/api?url=${link}`))
                console.log(clc.green('music url : ' + 'https://www.tiktok.com/music/' + musicTitle + '-' + musicId + ' ' + resp.data.video_music_id))
            } else {
                console.log(clc.red('something went wrong with this video : ' + `https://api.douyin.wtf/api?url=${link}`))
            }
        })
})*/


//SOCKET IO
const http = require('http');
const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ['GET', 'POST']
    }
})


//SOCKET CONNECTION 
class MyEmitter extends EventEmitter { }
const updateEmitter = new MyEmitter();

io.on('connection', (socket) => {

    console.log('a user connected  ' + socket.id);


    socket.on('join_room', data => {
        console.log('a user joined the room ' + data.roomCode)
        //join room
        socket.join(data.roomCode)


        updateEmitter.on('scrapingUpdate', (message) => {
            io.to(data.roomCode).emit("scrapingUpdate", message);

        });

        updateEmitter.on('downloadingUpdate', (message) => {
            io.to(data.roomCode).emit("downloadingUpdate", message);

        });

        updateEmitter.on('csvGeneratingUpdate', (message) => {
            io.to(data.roomCode).emit("csvGeneratingUpdate", message);
        });

        updateEmitter.on('soundLinksUpdate', (message) => {
            io.to(data.roomCode).emit("soundLinksUpdate", message);
        });



        //eventEmitter.emit('scrapingUpdate', 'yo' );

    })
})



puppeteer.use(StealthPlugin())

//set exectuable path for puppeteer
const osPlatform = os.platform(); // possible values are: 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
console.log('Scraper running on platform: ', osPlatform);
let executablePath;
if (/^win/i.test(osPlatform)) {
    executablePath = "C://Program Files//Google//Chrome//Application//chrome.exe";
} else if (/^linux/i.test(osPlatform)) {
    executablePath = "/usr/bin/google-chrome";
}

//SCROLLING 
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0
            var distance = 100
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight
                window.scrollBy(0, distance)
                totalHeight += distance
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer)
                    resolve()
                }
            }, 100)
        })
    })
}
//succesfull user agenst 
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
    
   /*' Mozilla/5.0 (Windows; U; Windows CE 5.1; rv:1.8.1a3) Gecko/20060610 Minimo/0.016',
    ' Mozilla/5.0 (Windows; U; Win98; en-US; rv:1.4) Gecko Netscape/7.1 (ax)',
    ' Mozilla/5.0 (Windows; U; Windows XP) Gecko MultiZilla/1.6.1.0a',
    ' Mozilla/5.0 (X11; Linux x86_64; rv:10.0.1) Gecko/20100101 Firefox/10.0.1',
    ' Mozilla/5.0 (X11; Linux i686; rv:6.0) Gecko/20100101 Firefox/6.0',
    ' Mozilla/5.0 (X11; Linux i686; rv:12.0) Gecko/20120502 Firefox/12.0 SeaMonkey/2.9.1',
    ' Mozilla/5.0 (X11; Linux i686; rv:12.0) Gecko/20120502 Firefox/12.0 SeaMonkey/2.9.1',
    ' Mozilla/5.0 (X11; Linux i686; rv:8.0) Gecko/20100101 Firefox/8.0',
    'Mozilla/5.0 (X11; Linux i686; rv:8.0) Gecko/20100101 Firefox/8.0',
    'Mozilla/5.0 (X11; Linux i686; rv:10.0.1) Gecko/20100101 Firefox/10.0.1',
    ' Konqueror/3.0-rc4; (Konqueror/3.0-rc4; i686 Linux;;datecode)',
    'Konqueror/3.0-rc4; (Konqueror/3.0-rc4; i686 Linux;;datecode)',
    'Mozilla/5.0 (X11; Linux i686; rv:10.0.1) Gecko/20100101 Firefox/10.0.1',
    ' Mozilla/5.0 (X11; Linux i686; rv:32.0) Gecko/20100101 Firefox/32.0',
    ' Mozilla/5.0 (X11; Linux i686; rv:5.0) Gecko/20100101 Firefox/5.0',
    ' Links (2.1pre15; Linux 2.4.26 i686; 158x61)',
    ' Mozilla/5.0 (X11; U; Linux i686; en-us) AppleWebKit/528.5  (KHTML, like Gecko, Safari/528.5 ) lt-GtkLauncher'*/
]

//scrape videos
app.get('/scrape/:username', async (req, res) => {
    const username = req.params.username;
    console.log(clc.blue('request received for username: ', username));

    var tiktokAccount = 'https://www.tiktok.com/@' + username + '?lang=en';
    console.log(clc.magenta(tiktokAccount))

    //random linux user agent randomUseragent



    var userImage = '';

    //PUPPETEER
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

        /*    const ua = randomUseragent.getRandom((ua)=>{
            //only os windows mac or linux 
            if(ua.osName == 'Linux'){
                return ua;
            }

        });*/
        try {
            const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
            // generate a random user agent but only with os linux using package randomUseragent

           /* const ua = randomUseragent.getRandom((ua) => {
                //only os windows 

                if (ua.osName == 'Linux') {
                    return ua;
                }




            });*/
            console.log(clc.green('user agent: ', ua))

            const page = await browser.newPage();
            console.log('Puppeteer is running...');
            updateEmitter.emit('scrapingUpdate', 'Bot is trying to emulate a real user on Titok to avoid detection, this might take up to one minute');

            console.log('using useragent: ' + ua);
            await page.setUserAgent(ua);
            //close browser 
            console.log('going to tiktok homepage...');
            await page.goto('https://www.tiktok.com', { waitUntil: 'networkidle2', timeout: 0 });


            //find out if tiktok page is loaded 

            const isLoaded = await page.$('#app > div.tiktok-xk7ai4-DivHeaderContainer.e10win0d0 > div > div.tiktok-ba55d9-DivHeaderRightContainer.e13wiwn60 > button');
            if (isLoaded) {
                console.log(clc.green('Tiktok Homepage loaded'));
                updateEmitter.emit('scrapingUpdate', "Bot is on Titok's Homepage successfully undetected !");

            } else {
                console.log(clc.red('FAIL : Tiktok Homepage not loaded, something went wrong'));
                //check if the text of this elector says Acess Denied body > h1

                const isAccessDenied = await page.$('body > h1');
                if (isAccessDenied) {
                    console.log(clc.red('FAIL : Tiktok Homepage not loaded, ACCESS DENIED'));

                    //STOP PUPPETEER 
                    await browser.close();
                    return res.status(403).json({
                        error: 'Access Denied'
                    });

                }
                //save page html to local file error2.html 
                await page.screenshot({ path: 'error2.png' });

                const html = await page.content();
                fs.writeFile('error2.html', html, function (err) {
                    if (err) throw err;
                    console.log('error 2 html saved!');
                });

                updateEmitter.emit('scrapingUpdate', 'Bot faced an issue on Homepage, but it is navigating to the Profile page anyway');

            }

            //scroll down a bit like a real user 
           // await autoScroll(page);
            //wait 2 seconds
            await page.waitForTimeout(3000);

            //wait for random time but less than 5 seconds 
            // await page.waitForTimeout(Math.floor(Math.random() * 5000) + 1000);

            //got to tiktok profile page
            console.log('going to tiktok profile page...');
            await page.goto(tiktokAccount, { waitUntil: 'networkidle2', timeout: 0 });

            const isLoadedProfile = await page.$('#app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-w4ewjk-DivShareLayoutV2.enm41490');
            if (isLoadedProfile) {
                console.log(clc.green('Profile page loaded'));
                updateEmitter.emit('scrapingUpdate', "Bot is on Titok's Profile page successfully undetected !");
            } else {
                console.log(clc.red('FAIL : Profile page not loaded, something went wrong'));
                //save page html to local file error2.html
                await page.screenshot({ path: 'error.png' });

                //save html to a text file 
                const html = await page.content();
                fs.writeFile('error.html', html, function (err) {
                    if (err) throw err;
                    console.log('error html saved!');
                });

                res.send({ error: 'Could not find user data, please run again. If the error persists, please contact the developer' });
                await browser.close();

                return;
            }
            //get img src from this selector : #app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-w4ewjk-DivShareLayoutV2.elmjn4l0 > div > div.tiktok-1g04lal-DivShareLayoutHeader-StyledDivShareLayoutHeaderV2.elmjn4l2 > div.tiktok-1gk89rh-DivShareInfo.ekmpd5l2 > div.tiktok-uha12h-DivContainer.e1vl87hj1 > span > img, but if we couldn't find it, send a reponse with an error message 


            console.log('Userimage: ' + userImage.substring(0, 50) + '...');


            //auto scroll
            updateEmitter.emit('scrapingUpdate', 'Bot started scrolling and collecting the videos !');

            await autoScroll(page)


            //evaluate the page and get html content
            const html = await page.evaluate(() => document.body.innerHTML);
            //count how many elements have this classname : tiktok-yz6ijl-DivWrapper e1cg0wnj1 using cheerio 
            const $ = cheerio.load(html);
            const count = $('.tiktok-yz6ijl-DivWrapper.e1cg0wnj1').length;
            console.log(clc.green('DONE ! Number of videos: ' + count));
            updateEmitter.emit('scrapingUpdate', 'Bot finished succesfully and is now checking if this Profile has been scraped before !');

            //get href for a elements, each is inside a div with className tiktok-yz6ijl-DivWrapper e1cg0wnj1 using cheerio
            const links = [];
            $('.tiktok-yz6ijl-DivWrapper.e1cg0wnj1').each(function (i, elem) {
                links[i] = $(this).find('a').attr('href');
            });



            //transform the previous function to an airtable curl request 
            // var curl = new Curl();
            // curl.setOpt('URL', 'https://api.airtable.com/v0/appXZ4XZ4XZ4XZ4XZ/Table%201?filterByFormula=%7BTiktok%20Username%7D%20%3D%20%27' + username + '%27');


            //SEND LINKS BACK 
            res.send({ links: links, userImage: userImage });

            //organise links then put links in text file
            const linksString = links.join(os.EOL);
            fs.writeFile('links.txt', linksString, function (err) {
                if (err) throw err;
                console.log(clc.green('Links Saved!'));
            });


            //save the html content to a file
            fs.writeFile('tiktok.html', html, (err) => {
                if (err) throw err;
                console.log('The file has been saved!');
            });
            //finish and close browser

            console.log('closing browser');
            await browser.close();

        } catch (e) {
            console.log(e)
            res.send({ error: 'Something went wrong, please run again. If the error persists, please contact the developer' });

        }
        finally {
            console.log('closing browser using finally')

            await browser.close();

        }
        //send back the links and userimage

    })()




});

//DONWLOAD VIDEOS 
//run shell command and get output 
function runShellCommand(command, batchOrder) {
    //send a download message to the client with emitter after 3 seconds (this should run asynchronously to not block the main thread)
    if (batchOrder == 0) {
        setTimeout(() => {
            updateEmitter.emit('downloadingUpdate', 'Tip: 400 videos usually take about 10 minutes to download, at an average of 10MiB/s');
        }, 11000);
    }
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.warn(error);
            }
            resolve(stdout ? stdout : stderr);
        });
    });
}

//receive links from client and download them
app.post('/download', async (req, res) => {
    var links = req.body.links;
    var folderName = req.body.folderName;
    var batchOrder = req.body.batchOrder;
    var numberOfBatches = req.body.numberOfBatches;

    var pastVideosCount = 0;
    //if this is not the first batch, then count how many videos are already downloaded in the folder, else pastVideosCount is 0
    if (batchOrder != 0) {
        console.log(clc.blue('counting how many videos we ALREADY downloaded...'))
        //count how many videos exist in donwload folder 
        fs.readdirSync('./videos/' + folderName).forEach(file => {
            pastVideosCount++;
        })
    }
    console.log(clc.blue('past videos count : ' + pastVideosCount))


    console.log('received links: ' + links?.length);
    console.log('batch order : ' + batchOrder + ' / ' + numberOfBatches);

    //convert links to a clean string (only link space link etc)
    links = links.join(' ');
    console.log('links string: ' + links);

    console.log('folder name: ' + folderName);

    updateEmitter.emit('downloadingUpdate', "Download started on the server !");

    //yt-dlp options to get extra meta data for the tiktok video audio 


    runShellCommand(`yt-dlp -v  --output './videos/${folderName}/%(id)sDATE%(upload_date)s.%(ext)s' ${links}`, batchOrder)
        .then((result) => {
            // console.log(result)


            console.log(clc.green('Download of Batch ' + (batchOrder + 1) + ' Complete ! '));

            var videosCount = 0;
            console.log(clc.blue('counting how many videos we downloaded...'))
            //count how many videos exist in donwload folder 
            fs.readdirSync('./videos/' + folderName).forEach(file => {
                videosCount++;
            })
            videosCount = videosCount - pastVideosCount;

            console.log(clc.green('DONE ! Number of videos: ' + videosCount));

            //check if this is the last batch
            if ((batchOrder + 1) == numberOfBatches) {
                //zip the folder
                // updateEmitter.emit('downloadingUpdate', "All Batches Downloaded, Zipping the folder !");
                //console.log(clc.green(`All Batches Downloaded : ${(batchOrder + 1) + '==' + numberOfBatches} , Zipping the folder !`))

                updateEmitter.emit('downloadingUpdate', "All Batches Downloaded !");
                console.log(clc.green(`All Batches Downloaded : ${(batchOrder + 1) + '==' + numberOfBatches} `))



                // zipper.sync.zip(`./videos/${folderName}`).compress().save(`./videos/${folderName}.zip`);
                //zip the folder using zip shell command 
                /*  runShellCommand(`zip -r ./videos/${folderName}.zip ./videos/${folderName} -0`)
                      .then((result) => {
                          console.log(clc.green('video folder zipped ! : ' + folderName + '.zip'));
                          updateEmitter.emit('downloadingUpdate', "  Compressing complete ! Download link is ready.");
  
  
                      }
                      )
                      .catch((error) => {
                          console.log(error);
                          updateEmitter.emit('downloadingUpdate', "Something went wrong while zipping the folder, please contact the developer");
                      });*/

                var newBatchOrder = batchOrder + 1;
                console.log('we INCREMENTED the batch order to : ' + newBatchOrder + ' / ' + numberOfBatches);
                res.send({ folderName: folderName, batchOrder: newBatchOrder, videosCount: videosCount });


                // NOTE: sometimes some videos may not get downloaded due to TikTok's security measures. 
            } else {
                var newBatchOrder = batchOrder + 1;
                console.log('we INCREMENTED the batch order to : ' + newBatchOrder + ' / ' + numberOfBatches);
                res.send({ folderName: folderName, batchOrder: newBatchOrder, videosCount: videosCount });

            }
            //increment batch order 

        });

});

//save data to airtable  

app.post('/save', async (req, res) => {
    console.log(clc.blue('we received request to save download link to airtable'));

    var username = req.body.username;
    var downloadLink = req.body.downloadLink;
    var numberOfVideos = req.body.numberOfVideos;
    var lastDownloadedVideos = req.body.lastDownloadedVideos;
    var csvDownloadLink = req.body.csvDownloadLink;

    console.log('csv download s ' + csvDownloadLink)
    //username + link + number of videos + last downloaded videos 
    base('Table 1').create([
        {
            "fields": {
                "Tiktok Username": username,
                "Videos Download Link": downloadLink,
                "N° of Videos": numberOfVideos,
                "Last Downloaded Videos ": lastDownloadedVideos,
                "Csv Download Link": csvDownloadLink
            }
        }
    ], function (err, records) {
        if (err) {
            console.error(err);
            res.send({ error: 'Something went wrong, please run again. If the error persists, please contact the developer' });
            return;
        }
        console.log(clc.green('we saved to airtable !'));
        var recordsDetails = []
        records.forEach(function (record) {

            recordsDetails.push({ id: record.getId(), tableName: record._table.name });
        });
        res.send({ records: recordsDetails });

    });

})

var videoLinks = [
    'https://www.tiktok.com/@tunisian_series3/video/7160405297272507653',
    'https://www.tiktok.com/@tunisian_series3/video/7160362907492961541',
    'https://www.tiktok.com/@tunisian_series3/video/7160077387735043334',
    "https://www.tiktok.com/@jaleesajaikaran/video/7094299177873771822",
    "https://www.tiktok.com/@jaleesajaikaran/video/7092529566945709355",
    "https://www.tiktok.com/@jaleesajaikaran/video/7090983084941724970",

]

//get html from videoLink using puppeteer 
async function getHtmlFromVideoLinkPuppeteer() {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath,
        args: [
            '--no-sandbox',
            '--disable-gpu',
            '--enable-webgl',
            '--window-size=1860,1400',
            '--disable-seccomp-filter-sandbox',
            //'--proxy-server=' + ProxyGenerator()
        ]
    });
    console.log(clc.blue('started puppeteer'))
    //loop through videoLinks and get html of each page (they all should open at the same time)
    for (let i = 0; i < videoLinks.length; i++) {

        const page = await browser.newPage();
        await page.setViewport({
            width: 1860,
            height: 1400
        });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.url().includes('content.css') || req.resourceType() == 'other' || req.resourceType() == 'fetch' || req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'xhr' || req.resourceType() == 'image' || req.resourceType() == 'gif' || req.resourceType() == 'media' || req.resourceType() == 'png' || req.resourceType() == 'jpeg' || req.resourceType() == 'png' || req.resourceType() == 'manifest' || req.resourceType() == 'svg' || req.resourceType() == 'script' || req.resourceType() == 'webp' || req.resourceType() == 'webm' || req.resourceType() == 'mp4' || req.resourceType() == 'mp3' || req.resourceType() == 'avi' || req.resourceType() == 'flv' || req.resourceType() == 'wmv' || req.resourceType() == 'mov' || req.resourceType() == 'm4v' || req.resourceType() == '3gp' || req.resourceType() == 'mkv' || req.resourceType() == 'mpg' || req.resourceType() == 'mpeg' || req.resourceType() == 'm3u8' || req.resourceType() == 'ts' || req.resourceType() == 'css' || req.resourceType() == 'html' || req.resourceType() == 'json' || req.resourceType() == 'text' || req.resourceType() == 'xml' || req.resourceType() == 'other') {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        //block request of file content.css
        await page.goto(videoLinks[i], { waitUntil: 'networkidle2' });

        await page.waitForTimeout(1000);

        const html = await page.content();
        if (html) {

            console.log(clc.green('GOT HTML FOR PAGE ' + i));
        } else {
            console.log(clc.red('OUPS DID NOT FIND HTML'))
        }

        //find href of this a selector #app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1sb4dwc-DivPlayerContainer.eqrezik3 > div.tiktok-aixzci-DivVideoInfoContainer.eqrezik2 > h4 > a
        const $ = cheerio.load(html);
        var date = $('#app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1gyd0ay-DivAuthorContainer.ege8lhx8 > div > a.tiktok-1b6v967-StyledLink.e17fzhrb3 > span.tiktok-lh6ok5-SpanOtherInfos.e17fzhrb2 > span:nth-child(2)').text();
        console.log(clc.green('date is : ' + date));
        var href = $('#app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1sb4dwc-DivPlayerContainer.eqrezik3 > div.tiktok-aixzci-DivVideoInfoContainer.eqrezik2 > h4 > a').attr('href');
        console.log(clc.green('href is : ' + href));
        //get text of this selector #app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1gyd0ay-DivAuthorContainer.ege8lhx8 > div > a.tiktok-1b6v967-StyledLink.e17fzhrb3 > span.tiktok-lh6ok5-SpanOtherInfos.e17fzhrb2 > span:nth-child(2)


        //close 
        await page.close();
    }

    await browser.close();
}

//getHtmlFromVideoLinkPuppeteer()
//get music name list and save data to csv file 
app.post('/music', (req, res) => {
    const folderName = req.body.folderName;
    const links = req.body.links;
    updateEmitter.emit('soundLinksUpdate', 'Bot is going to scrape sound link from each video page');

    //get list of file names in videos/folderName that exists in videos folder
    const files = fs.readdirSync('./videos/' + folderName);




    var serverHostAdresse = req.protocol + '://' + req.get('host');
    console.log('serverHostAdresse : ' + serverHostAdresse);
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
                //'--proxy-server=' + ProxyGenerator()
            ]
        });
        console.log(clc.blue('started puppeteer'))

        //loop through links and get html of each page (they all should open at the same time)
        var musicData = [];

        var failCounter = 0;
        for (let i = 0; i < links.length; i++) {

            const page = await browser.newPage();
            await page.setViewport({
                width: 1860,
                height: 1400
            });
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.url().includes('content.css') || req.resourceType() == 'other' || req.resourceType() == 'fetch' || req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'xhr' || req.resourceType() == 'image' || req.resourceType() == 'gif' || req.resourceType() == 'media' || req.resourceType() == 'png' || req.resourceType() == 'jpeg' || req.resourceType() == 'png' || req.resourceType() == 'manifest' || req.resourceType() == 'svg' || req.resourceType() == 'script' || req.resourceType() == 'webp' || req.resourceType() == 'webm' || req.resourceType() == 'mp4' || req.resourceType() == 'mp3' || req.resourceType() == 'avi' || req.resourceType() == 'flv' || req.resourceType() == 'wmv' || req.resourceType() == 'mov' || req.resourceType() == 'm4v' || req.resourceType() == '3gp' || req.resourceType() == 'mkv' || req.resourceType() == 'mpg' || req.resourceType() == 'mpeg' || req.resourceType() == 'm3u8' || req.resourceType() == 'ts' || req.resourceType() == 'css' || req.resourceType() == 'html' || req.resourceType() == 'json' || req.resourceType() == 'text' || req.resourceType() == 'xml' || req.resourceType() == 'other') {
                    req.abort();
                }
                else {
                    req.continue();
                }
            });
            //block request of file content.css
            await page.goto(links[i], { waitUntil: 'networkidle2' });

            await page.waitForTimeout(1000);

            const html = await page.content();
            if (html) {
                updateEmitter.emit('soundLinksUpdate', 'Bot reached Video ' + (i + 1));
                failCounter = 0;
                console.log(clc.green('GOT HTML FOR PAGE ' + (i + 1) + ' ' + html.substring(0, 50)));
            } else {
                console.log(clc.red('OUPS DID NOT FIND HTML'))
                updateEmitter.emit('soundLinksUpdate', 'OUPS ! Bot is having trouble with Video ' + (i + 1));
                failCounter = failCounter + 1;
                if (failCounter >= 5) {
                    console.log(clc.red('FAILED TOO MANY TIMES, EXITING...'))
                    updateEmitter.emit('soundLinksUpdate', 'FAILED TOO MANY TIMES, EXITING...');

                    res.send(null);
                    await browser.close();
                    return;


                }
            }

            //find href of this a selector #app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1sb4dwc-DivPlayerContainer.eqrezik3 > div.tiktok-aixzci-DivVideoInfoContainer.eqrezik2 > h4 > a
            //find href of this a selector #app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1sb4dwc-DivPlayerContainer.eqrezik3 > div.tiktok-aixzci-DivVideoInfoContainer.eqrezik2 > h4 > a
            const $ = cheerio.load(html);



            var href = $('#app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1sb4dwc-DivPlayerContainer.eqrezik3 > div.tiktok-aixzci-DivVideoInfoContainer.eqrezik2 > h4 > a').attr('href');
            var videoName = $('#app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div.tiktok-1senhbu-DivLeftContainer.ege8lhx7 > div.tiktok-1sb4dwc-DivPlayerContainer.eqrezik3 > div.tiktok-aixzci-DivVideoInfoContainer.eqrezik2 > div > span:nth-child(2)').text();
            if (href) {
                console.log(clc.green('href is : ' + href + ' and name is : ' + videoName + ' and video id is : ' + links[i].split('/')[5]));
            } else {
                console.log(clc.red('COULD NOT FIND HREF '))
                updateEmitter.emit('soundLinksUpdate', 'OUPS ! Bot could not find sound link for ' + (i + 1) + 'please start again');

            }
            //get content of this span element #app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1gyd0ay-DivAuthorContainer.ege8lhx8 > div > a.tiktok-1b6v967-StyledLink.e17fzhrb3 > span.tiktok-lh6ok5-SpanOtherInfos.e17fzhrb2 > span:nth-child(2)
            //get content of this span element #app > div.tiktok-ywuvyb-DivBodyContainer.e1irlpdw0 > div.tiktok-2vzllv-DivMainContainer.elnrzms0 > div.tiktok-19j62s8-DivVideoDetailContainer.ege8lhx0 > div.tiktok-12kupwv-DivContentContainer.ege8lhx6 > div > div.tiktok-1gyd0ay-DivAuthorContainer.ege8lhx8 > div > a.tiktok-1b6v967-StyledLink.e17fzhrb3 > span.tiktok-lh6ok5-SpanOtherInfos.e17fzhrb2 > span:nth-child(2)



            //there is a span elemnt with classname tiktok-lh6ok5-SpanOtherInfos e17fzhrb2 , it contains  text, a span elemnt, and a span elemnt, get the text contetn of the last span element

            //get uplaod date that exist between DATE and .mp4
            var uploadDate = files[i] ? (files[i].substring(files[i].indexOf('DATE') + 4, files[i].indexOf('.mp4'))) : 'empty';

            //get date object form uploadDate (it is in this format : 20221026)
            var date = uploadDate.substring(0, 4) + '-' + uploadDate.substring(4, 6) + '-' + uploadDate.substring(6, 8);
            //leave only the date part, without time 
            console.log(clc.green('video ' + i + ' was uploaded on ' + date))




            musicData.push({
                videoId: links[i].split('/')[5],
                username: links[i].split('/')[3].substring(1),
                videoLink: links[i],
                videoName: videoName,
                musicLink: ('https://www.tiktok.com' + href),
                downloadLink: serverHostAdresse + '/download/' + folderName + '/' + links[i].split('/')[5]/*+'DATE'+uploadDate*/,
                uploadDate: date,
                // downloadLink: 'https://tiktok-account-frontend-app-4kxke.ondigitalocean.app' + '/download/' + folderName + '/' + links[i].split('/')[5],
            });

            // await page.waitForTimeout(100000);
            //close 
            await page.close();
        }
        console.log(clc.green('FINISHED, SENDING LINKS BACK TO CLIENT '))

        // res.send({ csvDownloadLink: serverHostAdresse + '/csv/download/' + folderName });
        res.send({ musicData: musicData });
        await browser.close();
    })()

})


app.post('/spreadsheet', async (req, res) => {
    const folderName = req.body.folderName;
    const musicData = req.body.musicData;
    const username = req.body.username;

    var serverHostAdresse = req.protocol + '://' + req.get('host');
    console.log('serverHostAdresse : ' + serverHostAdresse);

    console.log('we are renaming files in folder to keep only id')
    //rename all files in folderName by keeping only the first 19 chars + extension 
    fs.readdirSync('./videos/' + folderName).forEach(file => {
        fs.renameSync('./videos/' + folderName + '/' + file, './videos/' + folderName + '/' + file.substring(0, 19) + file.substring(file.length - 4, file.length))
    })

    //check files in folderName, and check if each file with the name videoId exists or not, if it exists add key downloaded YEs, if it doesnt add key downloaded NO
    fs.readdirSync('./videos/' + folderName).forEach(file => {
        var videoId = file.substring(0, 19);
        var found = false;
        for (var i = 0; i < musicData.length; i++) {
            if (musicData[i].videoId == videoId) {
                musicData[i].downloaded = 'YES';
                found = true;
                console.log('found videoId ' + videoId + ' in musicData')
            }
        }

    })

    //go through musicData, if downloaded doesnt say YES, then let it be FAILED
    for (var i = 0; i < musicData.length; i++) {
        if (musicData[i].downloaded != 'YES') {
            musicData[i].downloaded = 'FAILED';
        }
    }




    console.log(musicData[0])

    //SAVE TO SPREADSHEET
    updateEmitter.emit('csvGeneratingUpdate', 'Saving to spreadsheet...')
    await doc.useServiceAccountAuth({
        client_email: CREDENTIALS.client_email,
        private_key: CREDENTIALS.private_key
    });

    await doc.loadInfo();

    // Index of the sheet
    // var username = links[0].split('/')[3].substring(1)

    let sheet = doc.sheetsByTitle[username];
    //remove first letter from username

    var sheetLink;
    if (sheet) {

        sheetLink = sheet._spreadsheet._spreadsheetUrl + '#gid=' + sheet._rawProperties.sheetId


        console.log(clc.green('username exists in spreadsheet ! WE SCRAPED THIS ACCOUNT IN THE PAST'))



        //put each 50 elements of music data to musicDataSplitted

        for (var i = 0; i < musicData.length; i += 50) {
            await sheet.addRows(musicData.slice(i, i + 50))
            updateEmitter.emit('csvGeneratingUpdate', 'Saving...')

        }
        console.log(clc.green('added all rows'))
        updateEmitter.emit('csvGeneratingUpdate', 'Saved all rows to Spreadsheet !')



        //await sheet.addRows(musicData);


        // Add rows to the sheet
        /*  for (let index = 0; index < musicData.length; index++) {
              const row = musicData[index];
              await sheet.addRow(row);
  
  
              setTimeout(() => {
                  console.log(clc.blue('UPDATED row ' + index + ' to spreadsheet !'))
                  updateEmitter.emit('csvGeneratingUpdate', 'Saved row ' + index + ' !')
              }, 1100);
  
          }*/


    } else {
        console.log(clc.red('username DOES NOT exist in spreadsheet, FRESH ACCOUNT'))

        //create a new sheet with the username as name
        await doc.addSheet({ title: username });
        console.log(clc.blue('created new sheet with name  : ' + username))

        //create columns (row headers)
        let sheet = doc.sheetsByTitle[username];
        await sheet.setHeaderRow(['videoId', 'username', 'videoName', 'videoLink', 'musicLink', 'downloadLink', 'uploadDate', 'downloaded']);

        console.log(clc.blue('added row headers to new sheet '))

        // Add rows to the sheet
        /*  for (let index = 0; index < musicData.length; index++) {
              const row = musicData[index];
              await sheet.addRow(row);
  
              setTimeout(() => {
                  console.log(clc.blue('UPDATED row ' + index + ' to spreadsheet !'))
                  updateEmitter.emit('csvGeneratingUpdate', 'Saved row ' + index + ' !')
              }, 1100);
  
  
          }*/

        for (var i = 0; i < musicData.length; i += 50) {
            await sheet.addRows(musicData.slice(i, i + 50))
            updateEmitter.emit('csvGeneratingUpdate', 'Saving...')

        }
        console.log(clc.green('added all rows'))
        updateEmitter.emit('csvGeneratingUpdate', 'Saved all rows to Spreadsheet !')


        sheetLink = sheet._spreadsheet._spreadsheetUrl + '#gid=' + sheet._rawProperties.sheetId

    }

    // res.send({ csvDownloadLink: serverHostAdresse + '/csv/download/' + folderName });
    res.send({ csvDownloadLink: sheetLink });


})


const test = async () => {
    await doc.useServiceAccountAuth({
        client_email: CREDENTIALS.client_email,
        private_key: CREDENTIALS.private_key
    });

    await doc.loadInfo();


    let sheet = doc.sheetsByTitle['celestexoxo454'];
    console.log((sheet._spreadsheet._spreadsheetUrl + '#gid=' + sheet._rawProperties.sheetId))
}

//download route to download zip file
app.get('/download/:folderName', (req, res) => {
    const folderName = req.params.folderName;
    console.log('folder name: ' + folderName);
    const file = `./videos/${folderName}.zip`;
    res.download(file); // Set disposition and send it.
});

//download videos route using a video name and a folder name
app.get('/download/:folderName/:videoName', (req, res) => {
    const videoName = req.params.videoName;
    const folderName = req.params.folderName;
    console.log(clc.blue('received video : ' + videoName + 'for download'));
    const file = `./videos/${folderName}/${videoName}.mp4`;

    //show simple html page

    res.sendFile(path.join(__dirname + '/download.html'));



});

//download videos route using a video name and a folder name
app.get('/startdownload/:folderName/:videoName', (req, res) => {
    const videoName = req.params.videoName;
    const folderName = req.params.folderName;
    console.log(clc.blue('received video : ' + videoName + 'for download'));
    const file = `./videos/${folderName}/${videoName}.mp4`;
    res.download(file); // Set disposition and send it.
});


//download csv file route
app.get('/csv/download/:folderName', (req, res) => {
    const folderName = req.params.folderName;
    console.log(clc.blue('received request to download csv in folder : ' + folderName));

    const file = `./videos/${folderName}/${folderName}.csv`;
    //check if file exists 
    if (fs.existsSync(file)) {
        console.log(clc.green('csv file exists ! '))
        res.download(file); // Set disposition and send it.

    } else {
        console.log(clc.red('OUPS FILE DOES NOT EXIST'))
    }



})


app.get("/", async (req, res) => {
    try {

        res.json({ 'message: ': 'this is working fine' })
    } catch (err) {
        console.log(err.message)
    }
})

server.listen(8080, () => {
    console.log('listening on port 8080')
})
/*

//generate proxy for puppeteer
let Proxy = '';
const ProxyGenerator = () => {
    let ip_addresses = [];
    let port_numbers = [];

    request("https://sslproxies.org/", function (error, response, html) {
        if (!error && response.statusCode == 200) {
            const $ = cheerio.load(html);

            $("td:nth-child(1)").each(function (index, value) {
                ip_addresses[index] = $(this).text();
            });

            $("td:nth-child(2)").each(function (index, value) {
                port_numbers[index] = $(this).text();
            });
        } else {
            console.log("Error loading proxy, please try again");
        }
        ip_addresses.join(", ");
        port_numbers.join(", ");

        //console.log("IP Addresses:", ip_addresses);
        //console.log("Port Numbers:", port_numbers);
        let random_number = Math.floor(Math.random() * 100);
        // let proxy = `http://${ip_addresses[random_number]}:${port_numbers[random_number]}`;
        Proxy = `http://${ip_addresses[random_number]}:${port_numbers[random_number]}`;
    });
}

ProxyGenerator()

*/