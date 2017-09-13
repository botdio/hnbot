require('./apps'); //load the hn apps
// require('./pub'); //start the hn api pub serivice

// add libs for HN Api
// var Shell = require('botd').Shell;
// Shell.addLibs("HnApi", `${__dirname}/libs/hn`);
// Shell.addLibs("format", `${__dirname}/libs/format`);

var SlackBot = require('botd').SlackBot;
var Connector = require('botd').Connector;

var slack = new SlackBot("xoxb-116523978963-lRDgKNEFXvh4GHsnjgkXV5DH", "hnbot");
var connector = new Connector(slack);
slack.startBot();
