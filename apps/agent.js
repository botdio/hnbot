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

class Agent extends EventEmitter{
    constructor(ctx) {
        super();
        this.cid = ctx.cid;
        this.db = ctx.db;
        this.push = ctx.push;
        this.save = ctx.save;
        this.livings = [];
        
        this.on('slack', this.onSlack);
        this.on('item', this.onGetItem);
        this.on('changes', this.onGetChanges);
        this.on('destroy', this.onDestory); // on uninstall the app, need clean me
        co(this.loadLiving(this.db.submitted || [])).catch(err => {
            logger.error(`agent: fail to build living list`, err);
        });
        this.sub = new Sub(this);
    }
    onDestory() {
        this.sub.remove(this);
    }

    match(cid, text) {
        return Agent.parseHnCmd(text);
    }

    onGetItem(item) {
        if(item && item.by && item.parent) {
            if(_.find(this.db.submitted || [],s => s === item.parent)){
                co(HnApi.fetchItem(item.parent)).then(parent => {
                    logger.debug(`agent: fetch parent item ${parent.id} done`);
                    var itemStr = SlackText.toSlack(parent);
                    var ui = new SlackBuilder(itemStr)
                        .br()
                        .a(`@${item.by}`, `https://news.ycombinator.com/user?id=${item.by}`)
                        .text(" reply: ")
                        .comment(SlackText.hn2slack(item.text));
                    logger.debug(`agent: build the slack text ${ui.build()}`);
                    this.push(ui.i().build());
                });
            }
        }
    }
    onGetChanges(changes) {
        logger.info(`agent: notified the changes`, changes);
        var items = changes.items || [];
        var profiles = changes.profiles || [];
        if(!this.db.id) return ;
        if(_.find(profiles, id => id === this.db.id)){
            //reload the profile
            this.reloadProfile(this.db.id);
        }
        var changedItemsInSubmitted = _.filter(items, itemid => _.find(this.db.submitted, s => s === itemid));
        _.each(changedItemsInSubmitted, itemid => {
            // notify how the item changes
            logger.debug(`agent: submitted item ${itemid} is changed, need notify user`);
            this.livings = this.livings || [];
            co(HnApi.fetchItem(itemid)).then(item => {
                var living;
                if(living = _.find(this.livings, l => itemid === l.id)){ //already in living list
                    logger.info(`agent: item ${itemid} changes and push into user and living list`);
                    //diff and send the changes
                    var msg = this.diffChange(living, item);
                    if(msg)
                        this.push(msg);
                    this.livings = _.filter(this.livings, l => l.id !== item.id).concat([item]);
                }else{
                    logger.info(`agent: item ${itemid} changes and push into living list`);
                    this.livings.push(item);
                }
            }).catch(err => {
                logger.error(`agent: fail to notify user item changes ${itemid}`, err);
            })
        });
    }
    diffChange(old, item) {
        var sb = new SlackBuilder();
        if(item.score !== old.score) {
            sb.text(`points ${item.score}`).b(`(+${item.score - old.score})`);
        }
        if(item.descendants !== old.descendants) {
            sb.text(`comments ${item.descendants}`).b(`(+${item.descendants - old.descendants})`);
        }
        if(sb.isEmpty()) {
            return ;
        }
        sb.text(" on ")
        sb.a(item.title, `https://news.ycombinator.com/item?id=${item.id}`); 
        return sb.i().build();
    }
    reloadProfile(hnId) {
        return co(HnApi.fetchHnUser(hnId)).then(profile => {
                // logger.debug(`HN:agent recv profile ${JSON.stringify(profile)}`);
                if(!profile){
                    this.push(new SlackBuilder(`*fail* HN id ${hnId} not exist`).i().build());
                    return ;
                }
                //ok, user exists, let's watch it
                this.db.submitted = profile.submitted.length > CONST.MAX_SUBMITTED_COUNT ? 
                    profile.submitted.slice(0,CONST.MAX_SUBMITTED_COUNT) :
                    profile.submitted;
                co(this.loadLiving(this.db.submitted));
                this.db.about = profile.about;
                this.db.karma = profile.karma;
                this.db.id = hnId;
        })
    }
    *loadLiving(items) {
        items = _.chain(items).sortBy().reverse().value(); //dasc sort
        logger.debug(`agent: start to load items for living list`, items);
        var livings = this.livings || [];
        for(var i = 0; i < items.length; i ++){
            var itemid = items[i];
            if(_.find(livings, l => l.id === itemid)) continue ; //already load
            var item = yield HnApi.fetchItem(itemid);
            if(!HnApi.changable(item)) break;
            logger.debug(`agent: find the living submitted item ${itemid}, save into living list`);
            this.livings.push(item);
        }
    }


    onSlack(event) {
        var cid = event.cid;
        var text = event.text;
        var cmd = Agent.parseHnCmd(text);
        if(!cmd) return ;
        switch(cmd.type) {
            case "SET":
                // set the agent id
                logger.debug(`agent: start to bind the hn id ${cmd.id}...`)
                // load the profiles
                this.livings = [];
                this.reloadProfile(cmd.id).then(() => {
                    var sb = new SlackBuilder("done! bind to ")
                            .a(this.db.id, `https://news.ycombinator.com/user?id=${this.db.id}`)
                            .text(" karma")
                            .b(`${this.db.karma}`)
                            .b("(HNBot will notify replies, comments & points changes to you)").i();
                    if(this.db.about)
                        sb.comment(SlackText.hn2slack(this.db.about));
                    this.push(sb.build());
                    this.save();
                }).catch(err => {
                    logger.error(`agent: fail to fetch hn user info for id ${cmd.id}`, err);
                    this.push(new SlackBuilder(`*fail* : ${err.toString()}`).i().build());
                })
                break;
            case "UNSET":
                logger.debug(`agent: start to unbind the hn id...`);
                if(this.db.id){
                    var id = this.db.id;
                    this.db = {};
                    this.save();
                    this.push(new SlackBuilder(`bye bye `)
                        .a(id, `https://news.ycombinator.com/user?id=${id}`)
                        .i().build());
                }else{
                    this.push(new SlackBuilder(`not yet bind any HN id, use \`hn id <id>\` to bind it`).i().build());
                }
                break;
            case "PRINT":
                if(this.db.id){
                    this.push(SlackText.profile2slack({id: this.db.id, karma: this.db.karma, about: this.db.about}));
                }else{
                    this.push(new SlackBuilder(`not yet bind any HN id, use \`hn id <id>\` to bind it`).i().build());
                }
                break;
        }    
    }

    pushProfile() {
    }
}

var AGENT_PATTERNS = [
    {
        type: "SET",
        patterns: [/^hn id (\w+)/, /^agent id (\w+)/]
    },
    {
        type: "UNSET",
        patterns: [/^hn id$/, /^agent id$/]
    },
    {
        type:"PRINT",
        patterns: [/^hn/, /^agent/]
    }
]
Agent.parseHnCmd = function(text) {
    text = (text || "").trim();
    var cmd;
    _.find(AGENT_PATTERNS, sub => 
        _.find(sub.patterns, p => {
            var matches = text.match(p);
            if(matches) {
                return cmd = {type: sub.type, id: matches[1]};
            }
        })
    )
    return cmd;
}
Agent.help = function(verbose) {
    return `*AGENT* - bind HN id and receive replies
    \`hn id <id>\` - bind the HN id to this channel
    \`hn id\` - unbind HN id
    \`hn id \` - print HN id
    `;
}
module.exports = Agent;