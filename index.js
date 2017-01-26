require('./apps'); //load the hn apps
// require('./pub'); //start the hn api pub serivice

// add libs for HN Api
var Shell = require('botd').Shell;
Shell.addLibs("HnApi", `${__dirname}/libs/hn`);

var SlackBot = require('botd').SlackBot;
var Connector = require('botd').Connector;

var slack = new SlackBot("xoxb-130197041223-4I9OcvhjeNBjnnA7z7Q2Igc6", "hnbot");
var connector = new Connector(slack);
slack.connect(connector);
slack.startBot();
