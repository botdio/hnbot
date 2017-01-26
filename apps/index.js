'use strict';
var logger = require('botd/logger');
var Checker = require('./checker');
var Agent = require('./agent');
var Follow = require('./follow');
var Apps = require('botd').Apps;
var _ = require("lodash");

Apps.push(Checker);
Apps.push(Agent);
Apps.push(Follow);

logger.info(`hn apps: add hn apps into botd apps ${_.join(_.map(Apps, c => c.name), ",")}`);