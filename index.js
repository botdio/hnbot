require('./apps'); //load the hn apps
require('./pub'); //start the hn api pub serivice
var SlackBot = require('botd/slack');
var Connector = require('botd/connector');

var slack = new SlackBot("xoxb-130197041223-WwFG8Ha5howdQVDiR1RCFcai", "hnbot");
var connector = new Connector(slack);
slack.connect(connector);
slack.startBot();
