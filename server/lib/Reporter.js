/**
 * An heart bit sender
 */
let config = require("../../config"),
    axios = require('axios'),
    fs = require('fs');
var aws = require('aws-sdk');
const writeJson = require('write-json');
let knex     = require("../../db/pg/knex");

// const heartbeatConfigFile = '/home/ubuntu/heartbeat/config/defaults.json';
// const advertConfigFile = '/home/ubuntu/advert_node/config/local.json';

/**
* Constructor
* @constructor
*/
class Report {
    constructor() {
        this.routerId = config.get("router:id");
        // try{
        //     const defaultsData = fs.readFileSync(heartbeatConfigFile, 'utf8');
        //     const defaults = JSON.parse(defaultsData);
        //     const id = defaults.router.id;
        //     console.log("Gateway Id =>",id);

        //     const localData = fs.readFileSync(advertConfigFile, 'utf8');
        //     const contents = JSON.parse(localData);
        //     contents.router.id = id;

        //     writeJson(advertConfigFile,contents,err => {
        //         if(err) console.log("Write file error => ",err);
        //     });        
        // } catch(error) {
        //     console.log('Error at reading heartbeat/config/defaults.json file',error);
        // }
        this.jobInitializer();
    }

    async jobInitializer() {
        console.log('jobInitializer.......')
        var that = this;
        let body = {
            gateway_id: that.routerId
        };
        let now = new Date();
        let headers = {
            'content-type': 'application/json'
        }
        that.updateG1Location();
        try {
            setInterval(async ()=> {
                const response = await axios({
                    method: 'post',
                    url: config.get("reporter:url") + '/upload/ping',
                    data: body,
                    headers: headers,
                });
                console.log('response.data=>',response.data);
                config.log.info('Server response : '+response.data);
                
                if(response.data.ack == 1) {
                    console.log("Starting Download... ")
                    const s3 = new aws.S3(config.get("s3bucket"));
                    var baseImage = response.data.advert_video;
                    const params = {
                        Bucket: config.get("s3bucket:Bucket"),
                        Key: response.data.advert_video
                    };
                    let localFilePath = config.get("basedir")+"/server/uploads/video/"+baseImage;
                    s3.getObject(params, async(err, data) => {
                        if(err) console.error("download error",err);
                        console.log("localFilePath=>" + localFilePath);
                        fs.writeFileSync(localFilePath, data.Body);
                        console.log("Image Downloaded.");
                        await knex("videos")
                        .insert({
                            gateway_id: that.routerId,
                            video_url: localFilePath,
                            video_id: response.data.video_id,
                            start_time: response.data.start_time,
                            end_time: response.data.end_time,
                            timestamp: now.toISOString()
                        })
                        .catch((x) => {
                            console.log('DB videos insert error: ',x)
                            config.log.error(`DB videos insert error: ${x}`);
                        });
                    });
    
                    // acknowledge update
                    await axios({
                        method: 'post',
                        url: config.get("reporter:url") + '/upload/acknowledge',
                        data: {
                            reservation_id: response.data.reservation_id
                        },
                        headers: headers
                    }).catch((x) => {
                        console.log('acknowledge update error: ',x)
                        config.log.error(`cknowledge update error: ${x}`);
                    });

                    // invoking the scheduler
                    await axios({
                        method: 'post',
                        url: 'http://localhost:4040/video/videoupload',
                        data: {
                            video_url: localFilePath,
                            video_id: response.data.video_id,
                            start_time: response.data.start_time,
                            end_time: response.data.end_time,
                            portNumber: response.data.portNumber
                        },
                        headers: headers,
                    }).catch((x) => {
                        console.log('video scheduler error : ',x)
                        config.log.error(`video scheduler error : ${x}`);
                    });
                }
            }, 60000);
            
        } catch (error) {
            console.log('G1 time interval error: ',error)
            config.log.error('G1 time interval error: '+error);
        }
    }

    updateG1Location() {
        let interval = setInterval(() => {
            fs.readFile("/home/ubuntu/statusInfo.json",'utf-8',async(err,defaultsDataString) => {
                if(err) {
                    config.log.error(`G1 location read error: ${err}`);
                    console.error(`G1 location read error: ${err}`);
                }
                else {
                    let locationData;
                    try {
                        locationData = JSON.parse(defaultsDataString);
                    } catch (jsonParseError) {
                        console.error("Error on parsing statusInfo.json:", jsonParseError);
                    }
                    if (locationData) {
                        console.log("got location data:", locationData);

                        if (locationData.lat && locationData.lon) {
                            config.log.info(`G1 Location lat : ${locationData.lat} lon : ${locationData.lon}`);
                            console.log(`G1 Location lat : ${locationData.lat} lon : ${locationData.lon}`);

                            //update G1 location
                            let headers = {
                                'content-type': 'application/json'
                            }
                            try {
                                const ackResponse = await axios({
                                    method: 'post',
                                    url: config.get("reporter:url") + '/sensor/update_location/'+this.routerId,
                                    data: {
                                        lat: locationData.lat,
                                        long: locationData.lon
                                    },
                                    headers: headers
                                });
                                console.log("Success G1 location : ",ackResponse.data);
                                stopRetry();
                                return;
                            } catch(e) {
                                console.log("Error G1 location : ",e);
                            }
                        }
                    }
                }
                console.log("failed to get location, will retry within 10 seconds");
            });
        }, 10000);  // 10 sec

        function stopRetry() {
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
        }
    }
}

module.exports = Report;
