var request = require('superagent');
var moment = require('moment')

module.exports = {
    fetchItem: function*(itemid, r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            request.get(`https://hacker-news.firebaseio.com/v0/item/${itemid}.json?print=pretty`)
            .end((err,res) => {
                if(err) reject(err);
                else resolve(res.body);
            });
        });
    },
    search: function*(query, opt, r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            var api = `http://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story`;
            if(opt && opt.sort && opt.sort === "byDate") {
                api = `http://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story`;
            }
            request.get(api)
            .end((err,res) => {
                if(err) reject(err);
                else resolve(res.body);
            });
        });        
    },
    getHitType(hit) {
        if(hit.url) return "story";
        if(hit.comment_text) return "comment";
    },
    hit2Item(hit) {
        return {
            id: parseInt(hit.objectID),
            type: this.getHitType(hit),
            by: hit.author,
            title: hit.title,
            time: moment(hit.created_at).unix(),
            parent: parseInt(hit.parent_id),
            url: hit.url,
            text: hit.story_text || hit.comment_text || "",
            descendants: parseInt(hit.num_comments || "0"),
            score: hit.points,
        }
    },
    searchByDate: function*(from, to, r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            var api = to ? `http://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=created_at_i>${from},created_at<${to}`
                        : `http://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=created_at_i>${from}`;
            request.get(api)
            .end((err,res) => {
                if(err) reject(err);
                else resolve(res.body);
            });
        });                
    },
    fetchHnUser: function*(hnName, r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            const api = `https://hacker-news.firebaseio.com/v0/user/${hnName}.json?print=pretty`;
            request.get(api).end((err,res) => {
                if(err){
                    reject(err);
                }else if(!res.body){
                    reject(`hn id ${hnName} not exists`);
                }
                else{
                    resolve(res.body);
                }
            });
        });
    },
    fetchMaxId: function *(r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            const api = `https://hacker-news.firebaseio.com/v0/maxitem.json?print=pretty`;
            request.get(api).end((err,res) => {
                var max ;
                if(err){
                    reject(err);
                }else if(max = parseInt(res.body)){
                    resolve(max);
                }
                else{
                    reject("bad format");
                }
            });
        });       
    },
    fetchChanges : function *(r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            const api = `https://hacker-news.firebaseio.com/v0/updates.json?print=pretty`;
            request.get(api).end((err,res) => {
                var json ;
                if(err){
                    reject(err);
                }
                else{
                    resolve(res.body);
                }
            });
        });          
    },
    fetchNewStories: function *(r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            const api = `https://hacker-news.firebaseio.com/v0/newstories.json?print=pretty`;
            request.get(api).end((err,res) => {
                var json ;
                if(err){
                    reject(err);
                }
                else{
                    resolve(res.body);
                }
            });
        });  
    },
    fetchTopStories: function *(r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            const api = `https://hacker-news.firebaseio.com/v0/topstories.json?print=pretty`;
            request.get(api).end((err,res) => {
                var json ;
                if(err){
                    reject(err);
                }
                else{
                    resolve(res.body);
                }
            });
        });  
    },
    fetchAskStories: function *(r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            const api = `https://hacker-news.firebaseio.com/v0/askstories.json?print=pretty`;
            request.get(api).end((err,res) => {
                var json ;
                if(err){
                    reject(err);
                }
                else{
                    resolve(res.body);
                }
            });
        });  
    },
    fetchShowStories: function *(r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            const api = `https://hacker-news.firebaseio.com/v0/showstories.json?print=pretty`;
            request.get(api).end((err,res) => {
                var json ;
                if(err){
                    reject(err);
                }
                else{
                    resolve(res.body);
                }
            });
        });  
    },
    jobStories: function *(r) {
        request = r || request;
        return yield new Promise((resolve, reject) => {
            const api = `https://hacker-news.firebaseio.com/v0/jobstories.json?print=pretty`;
            request.get(api).end((err,res) => {
                var json ;
                if(err){
                    reject(err);
                }
                else{
                    resolve(res.body);
                }
            });
        });  
    },
    changable: function(item) {
        return item && item.time && item.time > ((new Date().getTime() / 1000) - (14 * 24 * 3600))
    }
}