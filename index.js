require('./apps'); //load the hn apps
require('./pub'); //start the hn api pub serivice
var SlackBot = require('botd/slack');
var Connector = require('botd/connector');

var slack = new SlackBot("xoxb-130197041223-zCUPlYyI3jG9OKeONFMMfKjK", "hnbot");
var connector = new Connector(slack);
slack.connect(connector);
slack.startBot();
