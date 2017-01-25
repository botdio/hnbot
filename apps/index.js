'use strict';
var logger = require('botd/logger');
var Checker = require('./checker');
var Agent = require('./agent');
var Follow = require('./follow');
var Common = require('botd/apps').common;
var _ = require("lodash");

Common.push(Checker);
Common.push(Agent);
Common.push(Follow);

logger.info(`hn apps: add hn apps into botd common apps ${_.join(_.map(Common, c => c.name), ",")}`);