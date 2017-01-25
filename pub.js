'use strict';

var CONST = require('./constants');
var logger = require('botd/logger');
var redis = require("redis");
var HnApi = require('./hn_api');
var co = require('co');
var _ = require('lodash');

const pubClient = redis.createClient();

var PUB_JOB_STATUS = process.env.PUB || "NOT_START";
const HN_JOB_KEY = "hn";

pubClient.on("error", function (err) {
    logger.error("redis pub module error", err);
    process.exit(-1);
});

exports.onGetNewItem = function (cb) {
    sub.on("message", (channel, item) => {
        if(cb && item){
            try{
                item = JSON.parse(item);
            }catch(err) {
                logger.error(`fail to parse item ${item} into json`);
            }
            try{
                cb(item);                
            }catch(err){
                logger.error(`fail to handle item ${item}`, err);    
            }
        }
    });
}
function runAgain(func, timeout) {
    setTimeout(() => {
        co(func())
            .then((jobid) => {
                logger.info(`pub: job ${jobid} run done`);
            })
            .catch(err => {
            logger.error(`pub: job fail to finish`, err)
        });
    }, timeout);  
}
function checkAndPub() {
    logger.info(`pub: system start to to pub job`);
    PUB_JOB_STATUS = "STARTING";
    co(checkMaxAndPubNew());
    co(checkRetry());
    co(checkChanges());
    PUB_JOB_STATUS = "STARTED";
}

///////////////////////
// new item start
function *fetchLocalMaxId() {
    return new Promise((resolve, reject) => {
        pubClient.hget(HN_JOB_KEY, "max", (err, res) => {
            if(err) reject(err);
            else resolve(parseInt(res));
        })
    })
}
function updateLocalMaxId(id) {
    pubClient.hset(HN_JOB_KEY, "max", "" + id);    
}

function *checkMaxAndPubNew() {
    var jobid = "not-setting";
    try{
        var maxId = yield HnApi.fetchMaxId();
        var localId = yield fetchLocalMaxId();
        if(!localId){
            //first run,
            localId = maxId - 10;
            logger.info(`pub: first run, local id set as ${localId} run done`);
        }
        jobid = `pub-new-${localId}-${maxId}`;
        if(localId >= maxId) {
            runAgain(checkMaxAndPubNew, CONST.CRAWL_NEW_INTERVAL * 1000)
            return ;
        }
        for(var cur = localId; cur < maxId; cur ++) {
            try{
                var item = yield HnApi.fetchItem(cur);
                pubClient.publish(CONST.PUB_TOPIC.NEW, JSON.stringify(item));
                if(cur % 10 === 0)
                    updateLocalMaxId(cur);
                logger.debug(`pub: job ${jobid} fetch item ${cur} and publish done`);
            }catch(err) {
                logger.error(`pub: job ${jobid} fetch item ${cur} fail, need retry later`, err);
                //todo: retry list
                addRetryItem(cur);
            }
        }
        updateLocalMaxId(maxId);
        logger.info(`pub: job ${jobid} run done`);
    }catch(err) {
        logger.error(`pub: fail to run pub new job`, err);
    }
    runAgain(checkMaxAndPubNew,CONST.CRAWL_NEW_INTERVAL * 1000);
    return jobid;
}
/// new itme done

// retry start
function *fetchRetryList() {
    return new Promise((resolve, reject) => {
        pubClient.hget(HN_JOB_KEY, "retry", (err, res) => {
            if(err) reject(err);
            else resolve(_.chain((res || "").split(";")).map(s => parseInt(s)).filter(i => i).value());
        })
    })
}
function *removeRetryItem(id) {
    var lst = yield fetchRetryList();
    var str = _.filter(lst || [], i => i !== id).join(";");
    pubClient.hset(HN_JOB_KEY, "retry", str);    
}
function *addRetryItem(id) {
    var lst = yield fetchRetryList();
    var str =(lst || []).concat("" + id).join(";");
    pubClient.hset(HN_JOB_KEY, "retry", str);
}
function *checkRetry() {
    var jobid = `retry-job-${new Date().getTime()}`;
    try{
        logger.debug(`pub: retry job ${jobid} started`);
        var lst = yield fetchRetryList();
        for(var i = 0; i < lst.length; i ++){
            var id = lst[i];
            var item = yield HnApi.fetchItem(id);
            pubClient.publish(CONST.PUB_TOPIC.NEW, JSON.stringify(item));
            yield removeRetryItem(id);
            logger.debug(`pub: retry job ${jobid} fetch item ${id} and publish done`);
        }
        logger.info(`pub: retry job ${jobid} run done`);
    }catch(err) {
        logger.error(`pub: retry job ${jobid} fail run`, err);
    }
    runAgain(checkRetry, CONST.CRAWL_NEW_INTERVAL * 1000);
    return jobid;
}
//// retry done

///////////////////////
// change start
function *fetchLatestChangeStr() {
    return new Promise((resolve, reject) => {
        pubClient.hget(HN_JOB_KEY, "change", (err, res) =>{
            if(err) reject(err)
            else resolve(res);
        })
    })
}
function putLatestChange(str) {
    pubClient.hset(HN_JOB_KEY, "change", str);
}
function *checkChanges() {
    var jobid = `change-job-${new Date().getTime()}`;
    try{
        var changed = yield HnApi.fetchChanges();
        var str = JSON.stringify(changed);
        //diff with latest one
        var old = yield fetchLatestChangeStr();
        if(old && old === str){
            //not changes
            logger.debug(`pub: change job ${jobid} find latest change no diff, ignore`);
        }else{
            pubClient.publish(CONST.PUB_TOPIC.UPDATE, str);
            putLatestChange(str);
            logger.info(`pub: change job ${jobid} run done`);
        }
    }catch(err) {
        logger.error(`pub: change job ${jobid} run fail`, err);
    }
    runAgain(checkChanges, CONST.CHECK_CHANGE_INTERVAL * 1000);
    return jobid;
}

if(PUB_JOB_STATUS === "NOT_START") {
    checkAndPub();
}
////change done

// exports.onGetNewItem(logger.debug);