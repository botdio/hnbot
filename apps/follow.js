'use strict';
var _ = require('lodash');
var request = require('superagent');
const EventEmitter = require('events');
var logger = require('botd/logger');
var SlackText = require('../slack_text');
var SlackBuilder = require('slack_builder');
var HnApi = require('../hn_api');
var co = require('co');
var CONST = require('../constants');
var Sub = require('../sub');

const TYPE = {
    PRINT_FOLLOW: "PRINT_FOLLOW",
    FOLLOW_ITEM: "FOLLOW_ITEM",
    FOLLOW_USER: "FOLLOW_USER",
    FOLLOW_KEYWORDS: "FOLLOW_KEYWORDS",
    UF_ITEM: "UF_ITEM",
    UF_USER: "UF_USER",
    UF_KEYWORDS: "UF_KEYWORDS",
    UNFOLLOW_ALL: "UNFOLLOW_ALL",
    SET : "SET",
}

const SETTING_KEY = {
    POINTS: ["points", "point", "p"],
    COMMENTS: ["comments", "comment", "c"]
}
const MUTE_VALUES = ["mute", "false", "0"];
const UN_MUTE_VALUES = ["push", " true", "1"];

const SETTING_DEFAULT_VALUE = {
    POINTS: "mute",
    COMMENTS: "push"
}
function tokenize(text) {
  return _.filter((text || "").split(/[\s,]+/), t => t.length > 0)
}
class Follow extends EventEmitter{
    constructor(ctx) {
        super();
        this.cid = ctx.cid;
        this.db = ctx.db;
        this.push = ctx.push;
        this.save = ctx.save;
        
        this.on('slack', this.onSlack);
        this.on('item', this.onGetItem);
        this.on('changes', this.onGetChanges);
        this.on('timer', this.onTimer);
        this.on('destroy', this.onDestory);
        this.sub = new Sub(this);
    }    
    onDestory() {
        this.sub.remove(this);
        logger.info(`follow: recv destroy event, remove subscribe`);
    }

    onTimer(event) {
        var cid = event.cid;
        var text = event.cmd;
        var jobid = event.id;
        this.push(new SlackBuilder(`start to run the cron job `).b(jobid).build());
        this.onSlack({cid: cid, text: text});
    }

    match(cid, text) {
        var tokens = tokenize(text);
        if(tokens.length > 0) {
            return _.find(["f","uf", "follow", "unfollow"], f => f === tokens[0].toLowerCase())
        }
    }
    parse(text) {
        var tokens = tokenize(text);
        switch(tokens[0]){
            case "f":
            case "follow":
                if(!tokens[1]) return {type: TYPE.PRINT_FOLLOW};
                if(_.find(["set", "s"], set => set === tokens[1].toLowerCase())) {
                    // set the profile
                    return {type: TYPE.SET, key: tokens[2], value: tokens[3]};
                }
                var itemid;
                if(itemid = Follow.parseItem(tokens[1])) return {type: TYPE.FOLLOW_ITEM, itemid: itemid};
                if(tokens[1].indexOf("@") === 0) return {type: TYPE.FOLLOW_USER, user: tokens[1].substring(1)};
                return {type: TYPE.FOLLOW_KEYWORDS, keywords: Follow.parseKeywords(tokens.slice(1))};

            case "uf":
            case "unfollow":
                if(!tokens[1]) return ;
                var itemid;
                if(itemid = Follow.parseItem(tokens[1])) return {type: TYPE.UF_ITEM, itemid: itemid};
                if(tokens[1].indexOf("@") === 0) return {type: TYPE.UF_USER, user: tokens[1].substring(1)};
                return {type: TYPE.UF_KEYWORDS, keywords: Follow.parseKeywords(tokens.slice(1))};
        }
    }

    toHnSearchUrl(keywords){
        return `https://hn.algolia.com/?query=${encodeURIComponent(keywords)}&sort=byDate&prefix=false&page=0&dateRange=all&type=story`;
    }

    onGetItem(item) {
        // logger.debug(`follow: recv the new item ${JSON.stringify(item)}`);
        if(item && item.by) {
            var watchingUsers = this.db.users || [];
            var found = _.find(watchingUsers, u => u.id === item.by);
            if(found) {
                //my watching user submmitting a item, push
                this.push(
                        new SlackBuilder("User ")
                            .a(`@${found.id}`, `https://news.ycombinator.com/user?id=${found.id}`)
                            .text(" submitted item:")
                            .i()
                            .build(),
                            [SlackText.toItemAttachment(item)]
                        );
                this.db.submitted = (this.db.submitted || []).concat([item]);
                this.save();
                logger.info(`follow: for watched user ${found.id}, add item ${item.id} to submitted list`)
            }
        }
        if(item && item.title) {
            var keywordsList = this.db.keywords || [];
            var keyword;
            if(keyword = _.find(keywordsList, kw => item.title.toLowerCase().indexOf(kw) >= 0)){
                this.push(
                    new SlackBuilder("keywords ")
                        .a(`"${keyword}"`, this.toHnSearchUrl(keyword))
                        .text(" filter new item:")
                        .i()
                        .build(),
                        [SlackText.toItemAttachment(item)]
                    );

                this.db.kwItems = (this.db.kwItems || []).concat([item]);
                this.save();
                logger.info(`follow: for watched keyword ${keyword} add item ${item.id} ${item.title} to topics items`);
            }
        }
    }
    isMute(keys) {
        var settings = this.db.settings || {};
        var pointsSettingValues = _.chain(keys).map(k => settings[k]).filter(v => v).value();
        return _.find(MUTE_VALUES, mute => _.find(pointsSettingValues, v => v === mute));
    }
    diffChange(old, renew) {
        var sb = new SlackBuilder(); 
        if(renew.score !== old.score && !this.isMute(SETTING_KEY.POINTS)) {
            sb.text("points").b(`+${renew.score - old.score}`);
        }
        if(renew.descendants !== old.descendants && !this.isMute(SETTING_KEY.COMMENTS)) {
            sb.text(" comments").b(`+${renew.descendants - old.descendants}`);
        }
        return sb.build();
    }

    onGetChanges(changes){
        this.onGetChangesForItems(changes);
        this.onGetChangesForUsers(changes);
        this.onGetChangesForKeywords(changes);
    }
    onGetChangesForUsers(changes) {
        var items = this.db.submitted || [];
        var changed = changes.items;
        var watchingItems = _.filter(changed, id => _.find(items, i => i.id === id));
        _.each(watchingItems, id => {
            co(HnApi.fetchItem(id)).then(item => {
               this.db.submitted = _.filter(this.db.submitted || [], i => i.id !== item.id).concat([item]);
               this.save();
               logger.info(`follow: item ${item.id} updated for user ${item.by} watching`); 
            })
        })
    }
    onGetChangesForKeywords(changes) {
        var items = this.db.kwItems || [];
        var changed = changes.items;
        var watchingItems = _.filter(changed, id => _.find(items, i => i.id === id));
        _.each(watchingItems, id => {
            co(HnApi.fetchItem(id)).then(item => {
               this.db.kwItems = _.filter(this.db.kwItems || [], i => i.id !== item.id).concat([item]);
               this.save();
               logger.info(`follow: item ${item.id} updated for keyword watching`); 
            })
        })
    }

    onGetChangesForItems(changes) {
        // logger.debug(`follow: recv the changed items ${JSON.stringify(changes)}`);
        // if the items changes
        var watchings = this.db.items || [];
        var itemids = changes.items || [];
        var changedItemIds = _.filter(itemids, id => _.find(watchings, w => w.id === id));
        if(changedItemIds.length > 0)
            logger.debug(`follow: changed items ids ${JSON.stringify(changedItemIds)}`);
        _.each(changedItemIds, changedId => {
            //update the item
            co(HnApi.fetchItem(changedId)).then(item => {
                var old = _.find(this.db.items, old => old.id === item.id);
                if(_.isEqual(old, item)) return ;
                var renew = _.filter(this.db.items, old => old.id !== item.id).concat([item]);
                this.db.items = renew;
                this.save();
                logger.info(`follow: find changed item ${changedId} and update into db`);
                var changedDesc = this.diffChange(old, item);
                if(changedDesc && changedDesc.length > 0){
                    this.push(new SlackBuilder("following Item")
                                .a("" + item.id, `https://news.ycombinator.com/item?id=${item.id}`)
                                .text(" " + changedDesc)
                                .i()
                                .build(),
                    [SlackText.toItemAttachment(item)]);  
                } 
            }).catch(err => {
                logger.error(`follow: fail to fetch item ${changedId}`, err);
            })
        });
    }

    onSlack(event) {
        var cid = event.cid;
        var text = event.text;
        var opt = this.parse(text);
        if(!opt) return ;
        logger.debug(`follow: parse the opt as ${JSON.stringify(opt)}`);
        switch(opt.type){
            case TYPE.PRINT_FOLLOW:
                // print watch list
                var items = this.db.items || [];
                var empty = true;
                if(items.length > 0) {
                    this.push(
                        new SlackBuilder().i("following Items:").build(),
                        _.map(items, item => SlackText.toItemAttachment(item, {id: true}))
                        );
                    empty = false;
                }
                
                if((this.db.users || []).length > 0) {
                    var sb = new SlackBuilder().text("following users");
                    _.each(this.db.users, u => {
                        sb.a(`@${u.id}`, `https://news.ycombinator.com/user?id=${u.id}`).text(", ");
                    });
                    sb.text(" submitted:").i()
                    var submitted = this.db.submitted || [];
                    if(submitted.length > 0){
                        this.push(
                            sb.build(),
                            _.map(submitted, item => SlackText.toItemAttachment(item, {id: true}))
                        ); 
                    }else{
                        this.push(sb.b("None").build());
                    }    
                    empty = false;           
                }
                if((this.db.keywords || []).length > 0) {
                    var sb = new SlackBuilder().text("following keywords");
                    _.each(this.db.keywords, kw => {
                        sb.a(`"${kw}"`, this.toHnSearchUrl(kw)).text(", ");
                    })
                    sb.text(" submitted:").i()
                    var kwItems = this.db.kwItems || [];
                    if(kwItems.length > 0) {
                        this.push(sb.build(),
                            _.map(kwItems, item => SlackText.toItemAttachment(item, {id: true}))
                        ); 
                    }else{
                        this.push(sb.b("None").build());
                    }
                    empty = false;
                }
                if(empty) {
                    this.push(new SlackBuilder()
                        .i("not follow any items, users or keywords,")
                        .br()
                        .text(new SlackBuilder("help follow").text(" - to find more").i().build())
                        .build());
                }
                break;
            case TYPE.FOLLOW_ITEM:
                var itemid = opt.itemid;
                co(HnApi.fetchItem(itemid))
                .then(item => {
                    this.db.items = _.filter(this.db.items || [],i => i.id !== item.id).concat([item]); // put new item into watch list
                    this.save();
                    this.push(new SlackBuilder("OK, Start to follow item").i().br().text(SlackText.toSlack(item)).build());
                })
                .catch(err => {
                    logger.error(`follow: fail to fetch item, seems not exist`);
                    this.push(
                        new SlackBuilder().b("FAIL").text(' - follow item')
                        .a(itemid, `https://news.ycombinator.com/item?id=${itemid}`)
                        .text(" fail: not exist item")
                        .i().build()
                    );
                })
                break;
            case TYPE.UF_ITEM:
                var itemid = opt.itemid;
                var item = _.find(this.db.items || [], i => i.id === itemid);
                if(!item){
                    this.push(
                        new SlackBuilder("Well, not follow item ")
                        .a("" + itemid, `https://news.ycombinator.com/item?id=${itemid}`)
                        .i().build()
                    );
                    break;
                }
                this.db.items = _.filter(this.db.items || [], i => i.id !== itemid);
                this.save();
                this.push(new SlackBuilder("Bye bye").i().build(), [SlackText.toItemAttachment(item)]);
                break;
            case TYPE.FOLLOW_USER:
                var user = opt.user;
                co(HnApi.fetchHnUser(user))
                .then(profile => {
                    profile.submitted = profile.submitted.length > CONST.MAX_SUBMITTED_COUNT 
                            ? profile.submitted.slice(0,CONST.MAX_SUBMITTED_COUNT) 
                            : profile.submitted;
                    this.db.users = _.filter(this.db.users || [], u => u.id !== user).concat([profile]);
                    this.save();
                    this.push(
                        new SlackBuilder("OK, Start to follow user ")
                        .a(user, `https://news.ycombinator.com/user?id=${profile.id}`).i()
                        .br().text(SlackText.profile2slack(profile))
                        .build());
                })
                .catch(err => {
                    logger.error(`follow: fail to fetch user ${user}, seems not exist`);
                    this.push(
                        new SlackBuilder().b("FAIL").text(' - follow user')
                        .a(user, `https://news.ycombinator.com/user?id=${user}`)
                        .text(" fail: not exist user").i()
                        .build()
                    );
                })
                break;
            case TYPE.UF_USER:
                var userid = opt.user;
                var user = _.find(this.db.users || [], i => i.id === userid);
                if(!user){
                    this.push(
                        new SlackBuilder("Well, not follow user ")
                        .a(userid, `https://news.ycombinator.com/user?id=${userid}`)
                        .i()
                        .build()
                    );
                    break;
                }
                this.db.users = _.filter(this.db.users || [], i => i.id !== userid);
                this.db.submitted = _.filter(this.db.submitted||[], i => i.by !== userid);
                this.save();
                this.push(new SlackBuilder("Bye bye ")
                    .a(`@${userid}`, `https://news.ycombinator.com/user?id=${userid}`)
                    .i().build(), [SlackText.profile2slack(user)]);
                break;
            case TYPE.FOLLOW_KEYWORDS:
                var keywords = opt.keywords.toLowerCase();
                co(HnApi.search(keywords, {sort: "byDate"}))
                .then(results => {
                    var hits = results.hits;
                    var items = _.map(hits||[], hit => HnApi.hit2Item(hit))
                    var attachments = _.map(items, i => SlackText.toItemAttachment(i));
                    this.push(
                        new SlackBuilder("OK, Start to follow keywords")
                        .a(keywords, this.toHnSearchUrl(keywords)).i()
                        .br().i("BTW, these are the latest items")
                        .build(),
                        attachments.length > 0 ? attachments : undefined);
                    // save
                    this.db.keywords = _.filter(this.db.keywords || [], k => k !== keywords).concat([keywords]);
                    this.save();
                })
                .catch(err => {
                    logger.error(`follow: fail to fetch keywords ${keywords}, seems not exist`);
                    this.push(
                        new SlackBuilder().b("FAIL").text(' - follow keywords')
                        .a(keywords, this.toHnSearchUrl(keywords))
                        .text(` fail: ${err}`)
                        .i().build()
                    );
                })
                break;  
            case TYPE.UF_KEYWORDS:
                var kw = opt.keywords.toLowerCase();
                if(!_.find(this.db.keywords || [], k => k === kw)){
                    this.push(
                        new SlackBuilder("Well, not follow keywords ")
                        .text(` "${kw}" `)
                        .i().build()
                    );
                    break;
                }
                this.db.keywords = _.filter(this.db.keywords || [], k => k !== kw);
                //remove the list
                this.db.kwItems = _.filter(this.db.kwItems || [], i => i.title.toLowerCase().indexOf(kw) < 0);
                this.save();
                this.push(
                        new SlackBuilder("Bye bye ")
                        .text(` "*${kw}*" `)
                        .i().build()
                    );
                break;  

            case TYPE.SET:
                var key = opt.key;
                var value = opt.value;
                if(key && value) {
                    this.db.settings = this.db.settings || {};
                    this.db.settings[key] = value;
                    this.save();
                    this.push(new SlackBuilder("this channel follow app setting ").i()
                                .code(`${key}=${value}`)
                                .build()
                            );
                }else{
                    this.push(new SlackBuilder("current follow app setting:").i()
                                .pre(JSON.stringify(this.db.settings))
                                .build()
                            );
                }          
        }
    }
}
Follow.parseItem = function(token){
    var id;
    if(id = parseInt(token))
        return id;
    var m = token.match(/news.ycombinator.com\/item\?id=(\d+)/);
    if(!m) return ;
    return parseInt(m[1]);
}
Follow.parseKeywords = function(tokens) {
    var str = tokens.join(" ");
    return str.match(/(\w|\s)+/)[0];
}
Follow.help = function(verbose) {
    if(verbose){
        return `*Follow* - follow the item, user or keywords, then get notification for item changes
        \`f <item id>\` or \`f <item url>\` - follow the specified item, then item changes will get notification.
            e.g. \`f 1227\`, \`f https://news.ycombinator.com/item?id=1227\`
        \`f @<hn id>\` - follow the user, then whose submitted items will get notification.
            .e.g \`f @pg\`
        \`f "<keywords>"\` - follow the keywords, then when new stories contains, will get notification.
            e.g. \`f react\` \`f javascript\` \`f "machine learning"\`
        \`f set\` - manage the follow app settings (open or mute some notification)
            e.g. \`f set points mute\` - close the points change notification
            e.g. \`f set comments mute\` - close the new comments notification
        `;   
    }else{
        return `*Follow* - follow the item, user or keywords, then get notification for item changes
        \`f <item id>\` or \`f <item url>\` - follow the specified item, then item changes will get notification.
        \`f @<hn id>\` - follow the user, then whose submitted items will get notification.
        \`f "<keywords>"\` - follow the keywords, then when new stories contains, will get notification.
        \`f set\` - manage the follow app settings (open or mute some notification)
        `;        
    }

}
module.exports = Follow;