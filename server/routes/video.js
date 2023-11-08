const debug   = require("debug")("api:addresses"),
      _       = require('lodash'),
      fs = require('fs'),
      config = require("../../config"),
      axios = require('axios')
      express = require("express");
let knex     = require("../../db/pg/knex");
const writeJson = require('write-json');
const path = require('path');
const kill = require('tree-kill');

// Import child process module
const { spawn, exec } = require("child_process");

const router = express.Router();

const nestenLogoUrl = "/home/ubuntu/advert_node/server/assets/nestenLogo.png";
let currentMediaChild;
let videoData = [];
let gatewaySeries = 6;
let initial;
let initialVideoEnd;

let previousPipeID = "";
let pipelines = {};

router.post('/videoupload', async (req, res) => {
    clearTimeout(initial);
    console.log('req.body',req.body)

    videoData.push(req.body);
    videoData.sort(function(a,b){
        // Turn your strings into dates, and then subtract them
        // to get a value that is either negative, positive, or zero.
        return new Date(a.start_time) - new Date(b.start_time);
    });
    
    let diffTime = Math.abs(new Date(videoData[0].start_time) - new Date()); // milliseconds
    console.log(`Next video will play : ${videoData[0].start_time}`);
    config.log.info(`Next video will play : ${videoData[0].start_time}`);

    // schedule video play start function
    initial = setTimeout(() => {
        videoPlayStart(videoData)
    }, diffTime);
    
    return res.status(201).send({data: videoData }).end();
});

/* this function will call once video schedule time is start */
async function videoPlayStart(videoData) {
    try {
        clearTimeout(initial);
        console.log(`We will use this path for play video: ${videoData[0].video_url}`);
        config.log.info(`We will use this info for play video:`, videoData[0]);

        var num = videoData[0].portNumber;
        console.log(String(num)[0]);
        if(String(num)[0] == 6){
            // Play the media
            console.log("Cannot play media in 6000 series");
            // displayMedia(videoData[0].video_url);
        } else {
            // Play the media
            console.log("Playing media 9000 series:", videoData[0].video_url, videoData[0].video_id, previousPipeID);
            // displayMediaWithDriverName(videoData[0].video_url);
            displayMediaWithDaemon(videoData[0].video_url, videoData[0].video_id, previousPipeID);
            previousPipeID = videoData[0].video_id;
            gatewaySeries=9;
        }
            
        let diffSeconds = Math.abs(new Date(videoData[0].start_time) - new Date(videoData[0].end_time)); // milliseconds
        let diffMins = Math.round(((diffSeconds % 86400000) % 3600000) / 60000); // minutes
        config.log.info(`Duration : ${diffMins} minutes`);

        let now = new Date();
        let gateway_id = config.get("router:id");
        config.log.info(`gateway_id : ${gateway_id}`);

        // send request to server
        let body = {
            duration: diffMins,
            gateway_id: gateway_id,
            video_id: videoData[0].video_id,
            start_time: videoData[0].start_time,
            end_time: videoData[0].end_time,
        };
        config.log.info(`Server request body data : ${body}`);

        let headers = {
            'content-type': 'application/json'
        }
        await axios({
            method: 'post',
            url: config.get("reporter:url") + '/sensor/file/start',
            data: body,
            headers: headers,
        }).catch((x) => {
            console.log('video play start update error : ',x)
            config.log.error(`video play start update error : ${x}`);
        });
        
        await knex("videos")
        .insert({
            "gateway_id": gateway_id,
            "video_id": videoData[0].video_id,
            "start_time": videoData[0].start_time,
            "end_time": videoData[0].end_time,
            "video_url": videoData[0].video_url,
            "timestamp": now.toISOString()
        })
        .catch((x) => {
            console.log(`DB videos insert error: ${x}`);
            config.log.error(`DB videos insert error: ${x}`);
        });
        
        // schedule video play end function
        initialVideoEnd = setTimeout(() => {
            videoPlayEnd(body);
        }, diffSeconds);

        // remove first object from queue because video already started
        videoData.splice(0, 1);

        // Reschedule video play start function again if there is not empty queue
        if(videoData.length > 0) {
            let diffTime = Math.abs(new Date(videoData[0].start_time) - new Date()); // milliseconds
            config.log.info(`Next video will play : ${videoData[0].start_time}`);

            initial = setTimeout(() => {
                videoPlayStart(videoData)
            }, diffTime);
        }
        
    } catch(x) {
        config.log.error(`videoPlayStart error: ${x}`);
    };
}

/* this function will call once video schedule time is end */
async function videoPlayEnd(body) {
    try {
        clearTimeout(initialVideoEnd);
        const pipeID = body.video_id;
        console.log("end of pipe:", pipeID);
        console.log('videoEnd data',body)
        config.log.info(`videoEnd data : ${body}`);
        
        // Kill the child process that is currently playing the media with SIGKILL signal
        // currentMediaChild.kill();
        if (pipeID && pipelines[pipeID]) {
            console.log("killing process of pipeID:", pipeID);
            // pipelines[pipeID].kill();
            kill(pipelines[pipeID].pid);
            delete pipelines[pipeID];
        }
        // Display nesten logo so that frame that the video was killed on doesnt stay on screen forever // Not working
        if(gatewaySeries == 6) {
            exec(`gst-launch-1.0 playbin uri=file://${nestenLogoUrl}`);
        }else {
            exec(`gst-launch-1.0 playbin uri=file://${nestenLogoUrl} video-sink=glimagesink`);
        }

        // send request to server
        let headers = {
            'content-type': 'application/json'
        }

        await axios({
            method: 'post',
            url: config.get("reporter:url") + '/sensor/file/end',
            data: body,
            headers: headers,
        })
        .then(async data => {
            
            console.log("/sensor/file/end posted: ", pipeID, "owner_address:", data.data.owner_address);
            // const jsonString = `{"Account":"${data.data.owner_address.substring(2)}","Duration":"${body.duration}"}`;
            // const base64String = Buffer.from(jsonString).toString('base64');
            // const requestData = {
            //   events: [
            //     {
            //       header: {
            //         event_type: "2147483647"
            //       },
            //       payload: base64String
            //     }
            //   ]
            // };
            // await axios({
            //  method: 'post',
            //  url: 'http://localhost:8888/srv-applet-mgr/v0/event/medianest-project',
            //  data: requestData,
            //  headers: headers
            // })
            // .then(_ => {
            //   console.log("sent w3bstream request");
            // })
            // .catch(err => {
            //   console.log("w3bstream request err:", err);
            // });

            // configWrite(data.data.owner_address);
        })
        .catch((x) => {
            console.log('video play end update error : ',x)
            config.log.error(`video play end update error : ${x}`);
        });

        
        try {
            knex('videos').where({video_id: body.video_id}).first().then((video) => {
                console.log("UNLINKING FILE.......", pipeID);
                fs.unlinkSync(video.video_url);
            })
        } catch(e) {
            console.error("Ended file removal failed");
        }
        
    } catch(x) {
        config.log.error(`videoPlayEnd error: ${x}`);
    };
}
/**
 * Smoother Video play for 9000
 * @param {*} mediaUrl 
 */
async function displayMediaWithDaemon(mediaUrl, pipeID, prevPipeID) {
    console.log("gstd new spawn with pipeID:", pipeID, " previous:", prevPipeID);
	// Play the media - Launch a child process that uses gstreamer daemon to play and loop the video file
    // If not jpg or png then must be video
    let ext = mediaUrl.split(".").pop().toLowerCase()
    let jpgExt = /^(jpg|jpeg)$/i
    let pngExt = /^(png)$/i
    let newPipe;
    if (ext.match(jpgExt)) {
        newPipe = spawn('bash', [path.join(process.cwd(), '/server/lib/gstd-image.sh'), "jpegdec", mediaUrl, pipeID, prevPipeID], { shell: true });
    } else if (ext.match(pngExt)) {
        newPipe = spawn('bash', [path.join(process.cwd(), '/server/lib/gstd-image.sh'), "pngdec", mediaUrl, pipeID, prevPipeID], { shell: true });
    } else {
        newPipe = spawn('bash', [path.join(process.cwd(), '/server/lib/gstd-video.sh'), mediaUrl, pipeID, prevPipeID], { shell: true });
    }
    newPipe.on("exit", (code) => {
        console.log("gst pipe exit:", pipeID, code);
    });
    pipelines[pipeID] = newPipe;
}

function configWrite(owner_address){
    fs.readFile("/home/ubuntu/advert_node/config/local.json",(err,res) => {
      if(err) return ;
      let contents = JSON.parse(res.toString("utf-8"));
      contents.owner_address = owner_address;
      writeJson("/home/ubuntu/advert_node/config/local.json",contents,err => {
        if(err) return ;
      })
    });
    console.log("Config Write Complete")
}

router.get('/gettime', (req, res) => {
    return res.status(201).send({data: new Date() }).end();
});
module.exports = router;
