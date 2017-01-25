'use strict';

var CONST = require('./constants');
var logger = require('botd/logger');
var redis = require("redis");

const sub = redis.createClient();
sub.on("subscribe", function (channel, count) {
    logger.info(`channel ${channel} subscribe done, count ${count}`);
});

sub.subscribe(CONST.PUB_TOPIC.NEW);
sub.subscribe(CONST.PUB_TOPIC.UPDATE);
logger.info(`redis subscribe topic ${CONST.PUB_TOPIC.NEW} & ${CONST.PUB_TOPIC.UPDATE} is ready`);

sub.on("error", function (err) {
    logger.error("redis sub module error", err);
    process.exit(-1);
});

exports.onGetNewItem = function (cb) {
    sub.on("message", (channel, item) => {
        
        if(cb && item){
            try{
                
            }catch(err) {
                logger.error(`fail to parse item ${item} into json`， err);
            }
            try{
                cb(item);                
            }catch(err){
                logger.error(`fail to handle item ${item}`, err);    
            }
        }
    });
}

// exports.onGetNewItem(logger.debug);