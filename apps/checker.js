'use strict';
var _ = require('lodash');
var request = require('superagent');
const EventEmitter = require('events');
var logger = require('botd/logger');
var SlackText = require('../slack_text');
var HnApi = require('../hn_api');
var moment = require('moment');
var co = require('co');

class Checker extends EventEmitter{
    constructor(ctx) {
        super();
        this.cid = ctx.cid;
        this.db = ctx.db;
        this.save = ctx.save;
        this.push = ctx.push;
        
        this.on('slack', this.onSlack);
    }

    match(cid, text, type) {
        var url = testLink(text);
        return url;
    }

    *checkLinkByHnSearchApi(url) {
        logger.debug(`checker: start to search url ${url}`);
        var results = yield HnApi.search(url);
        logger.debug(`checker: url search result ${JSON.stringify(results)}`);
        if(results && results.hits){
            return _.map(results.hits, hit => HnApi.hit2Item(hit))
        }else{
            return [];
        }
    }

    onSlack(event) {
        var cid = event.cid;
        var text = event.text;
        var url = testLink(text);
        if(!url) return ;

        //check the url 
        co(this.checkLinkByHnSearchApi(url)).then(items => {
            if(!items || items.length == 0) {
                this.push(`_*Not submitted*_`,[SlackText.toPostHNAttachment(url)]);
                return ;
            }
            var items = _.sortBy(items, a => -1*a.score);
            var title = _.reduce(items, (m,i) => i.score > m.score ? i : m, {score:0}).title;

            this.push(`_*${title}*_`, _.map(items, i => SlackText.toItemAttachment(i)));
        }).catch(err => {
            var msg = `check: fail to check the url ${url}, reason ${err}`;
            logger.error(msg, err);
        });
    }
}

function testLink(text) {
  if(!text) return ;
  var matches = text.match(/https?:\/\/[^\s]+/g);
  if(!matches) return ;
  var url = matches[0];
  if(url.endsWith(">"))
    url = url.substring(0, url.length - 1);
  return url;
}

Checker.help = function(verbose) {
    return `*Checker* - automatially check your link in HN
    `;
}
module.exports = Checker;