var HnApi = require('../hn_api');
var request = require('superagent');

function Api(r){
    r = global.R || request;
    var api = {};
    api.version = function() {return "0.1"}
    api.usage = function() {return "Hacker News Api wrapper, find documents in: <https://github.com/HackerNews/API|HNApi> , <https://hn.algolia.com/api|HN Search Api>"}
    api.item = function *(id) { return yield HnApi.fetchItem(id, r)}
    api.user = function *(id) { return yield HnApi.fetchHnUser(id, r)}
    api.maxitem = function*() {return yield HnApi.fetchMaxId(r)}
    api.newstories = function*() {return yield HnApi.fetchNewStories(r)}
    api.topstories = function*() {return yield HnApi.fetchTopStories(r)}
    api.showstories = function*() {return yield HnApi.fetchShowStories(r)}
    api.askstories = function*() {return yield HnApi.fetchAskStories(r)}
    api.jobstories = function*() {return yield HnApi.fetchJobStories(r)}
    api.updates = function*() {return yield HnApi.fetchChanges(r)}
    api.search = function*(query, opt) { return yield HnApi.search(query, opt, r)}
    api.hit2item = function(hit) { return HnApi.hit2Item(hit) }
    api.between = function*(from, to) { return yield HnApi.searchByDate(from, to, r)}
    api.since = function*(from) { return yield HnApi.searchByDate(from, r)}
    return api;
}
module.exports = Api();