var _ = require('lodash');
var he = require('he');
var moment = require('moment');
var SlackBuilder = require('slack_builder');

//order is important!
const REPLACES = [
    {from: "<p>", to: "\n"},
    {from: "<br/>", to: "\n"},
    {from: "<i>", to: "_ "},
    {from: "</i>", to: "_ "},
    {from: "<b>", to: " *"},
    {from: "</b>", to: "* "},
    {from: ">", to: "\""}
    ];
function readable (time) {
    var now = moment().utc().unix();
    const oneMinute = 60;
    const oneHour = oneMinute * 60;
    const oneDay = 24 * oneHour;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;
    const oneYear = 365 * oneDay;

    if(now - time < oneMinute) {
      return `${Math.floor((now-time))} seconds ago`;
    }
    if(now - time < oneHour){
      return `${Math.floor((now-time)/oneMinute)} minutes ago`;
    }
    if(now - time < oneDay) {
      return `${Math.floor((now-time)/oneHour)} hours ago`;
    }
    if(now - time < oneWeek) {
      return `${Math.floor((now-time)/oneDay)} day ago`;
    }

    return moment(time * 1000).format("YYYY-MM-DD");
}

module.exports = {
    with: function(txt, w) {
        return `${w}${txt}${w}`;
    },
    toSlack: function(item) {
        switch(item.type){
            case "story":
            case "poll":
                var link = `https://news.ycombinator.com/item?id=${item.id}`
                var sb = new SlackBuilder()
                    .a(item.title, item.url)
                    .br().a(`${item.score} points`, link)
                    .text(" by").a(item.by, `https://news.ycombinator.com/user?id=${item.by}`)
                    .a(` ${readable(item.time)}`, link);
                if(item.descendants) {
                    sb.text(" |").a(` ${item.descendants} comments`, link);    
                }
                if(item.extra) {
                    _.each(item.extra, (v, k) => sb.text(` | ${k} ${v}`));
                }
                return sb.build();
            default:
                return "";
        }
    },
    profile2slack: function(profile) {
        return new SlackBuilder()
                    .a(profile.id, `https://news.ycombinator.com/user?id=${profile.id}`)
                    .text(" karma")
                    .b(`${profile.karma}`)
                    .i()
                    .comment(this.hn2slack(profile.about))
                    .build();
    },
    toTitle: function(item) {
        switch(item.type){
            case "story":
            case "poll":
                return `*${item.title}*`;
            case "comment":
            case "job":
            case "pollopt":
                return `*${item.text}*`
            default:
                return `on: unknown type ${text.type}`;
        }
    },
    toComment: function(item) {
         switch(item.type){
            case "story":
            case "poll":
                return `\n*@${item.by}* said:\n> ${item.title}`;
            case "comment":
            case "job":
            case "pollopt":
                return `\n*@${item.by}* said:\n> ${this.hn2slack(item.text).replace("\n","\n> ")}`;
            default:
                return `Unknown type ${text.type}`;
        }       
    },
    toMore: function(item) {
        return `\nFind detail in https://news.ycombinator.com/item?id=${item.id}`
    },
    toItemSingleDesc: function(item) {
        var link = `https://news.ycombinator.com/item?id=${item.id}`
        var str = new SlackBuilder().text("by")
                    .a(item.by, `https://news.ycombinator.com/user?id=${item.by}`)
                    .a(` ${readable(item.time)}`, link)
                    .text(" | ")
                    .a(`${item.score}`, link )
                    .text(" points | ")
                    .a(`${item.descendants}`, link)
                    .text(" comments ")
                    .build();
        return str;
    },
    toItemAttachment: function(item){
        var attachment = {
            fallback: item.title,
            color: "#ff6600",
            title: item.title,
            title_link: item.url,
            text: this.toItemSingleDesc(item),
        }
        return attachment;
    },
    toProfileAttachment: function(profile) {
         var attachment = {
            color: "#ff6600",
            title: `@${profile.id} | karma ${profile.karma} | created ${readable(profile.created)}`,
            title_link: `https://news.ycombinator.com/user?id=${profile.id}`,
            text: this.hn2slack(profile.about),
        }
        return attachment;       
    },
    toAgentAttachment: function(agent) {
         var attachment = {
            color: "#ff6600",
            title: `@${agent.hnName} | karma ${agent.karma} | created ${readable(agent.created)}`,
            title_link: `https://news.ycombinator.com/user?id=${agent.hnName}`,
            text: this.hn2slack(agent.about),
        }
        return attachment;       
    },
    toKeywordAttachment: function(kw) {
         var attachment = {
            color: "#ff6600",
            title: `keyword: "${kw}"`,
            title_link: `https://hn.algolia.com/?query=${encodeURIComponent(kw)}&sort=byPopularity&prefix=false&page=0&dateRange=all&type=story`,
        }
        return attachment; 
    },
    hn2slack: function(txt){
        if(!txt) return txt;
        txt = he.decode(txt);
        txt = _.reduce(REPLACES, (g,r) => g.replace(r.from, r.to), txt).trim();
        // txt = txt.indexOf(">") == 0  ?  "> " + txt.substring(1) : txt;
        return txt;
    },
    toPostHNAttachment: function(url) {
        const NOT_SUBMIT = "Not Submitted in HN";
        var submiturl = `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(url)}`;
        var title = NOT_SUBMIT;
        var attachment = {
            fallback: title,
            color: "warn",
            title: "Post to HN",
            title_link: submiturl,
            text: url,
            footer: "HN Bot",
            footer_icon: "https://hackernewsfilter.com/img/logo.png"
        }
        return attachment;   
    }
}