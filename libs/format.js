var SlackText = require('../slack_text');

function format(item){
    return SlackText.toSlack(item);
}
module.exports = format;