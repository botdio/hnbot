'use strict';

var CONST = require('./constants');
var logger = require('botd/logger');
var redis = require("redis");
var _ = require('lodash');

class Sub {
    constructor(emitter) {
        if(!Sub.INSTANCE) {
            this.init();
        }
        if(!emitter) return ;
        Sub.emitters.push(emitter);
    }
    remove(emitter) {
        Sub.emitters = _.filter(Sub.emitters, e => e !== emitter);
    }
    init() {
        const sub = redis.createClient();
        sub.on("subscribe", function (channel, count) {
            logger.info(`channel ${channel} subscribe done, count ${count}`);
        });
        sub.on("error", function (err) {
            logger.error("redis sub module error", err);
            process.exit(-1);
        });
        sub.subscribe(CONST.PUB_TOPIC.NEW);
        sub.subscribe(CONST.PUB_TOPIC.UPDATE);
        sub.on("message", (channel, str) => {
            switch(channel) {
                case CONST.PUB_TOPIC.NEW:
                    var item = JSON.parse(str);
                    _.each(Sub.emitters, e => {
                        try{
                            e.emit("item", item);                            
                        }catch(err) {
                            logger.error(`sub: fail to emit item event`, item, e.constructor.name);
                        }
                    });
                    break;

                case CONST.PUB_TOPIC.UPDATE:
                    var change = JSON.parse(str);
                    _.each(Sub.emitters, e => {
                        try{
                            e.emit("changes", change);                            
                        }catch(err) {
                            logger.error(`sub: fail to emit change event`, change, e.constructor.name);
                        }
                    });
                    break;
            }
        });
        Sub.INSTANCE = sub;
        logger.info(`sub: redis subscribe topic ${CONST.PUB_TOPIC.NEW} & ${CONST.PUB_TOPIC.UPDATE} is ready`);       
    }
}
Sub.INSTANCE = undefined;
Sub.emitters = [];

module.exports = Sub;