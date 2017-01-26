require('./apps'); //load the hn apps
require('./pub'); //start the hn api pub serivice
var SlackBot = require('botd').SlackBot;
var Connector = require('botd').Connector;

var slack = new SlackBot("xoxb-130197041223-udyVxX3LnMfA29B7L5shJg7y", "hnbot");
var connector = new Connector(slack);
slack.connect(connector);
slack.startBot();
