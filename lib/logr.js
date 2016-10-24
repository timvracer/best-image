"use strict";

/*
 * logr.js
 *
 * simple logger manager for support modules for node.js
 *
 */ 
 
var nullFn = function(){};

// globals
var	info = nullFn,
	warn = nullFn,
	error = console.log,
	debug = nullFn;

function init(pinfo, pwarn, perror, pdebug) {

	info = pinfo || info;
	warn = pwarn || warn;
	error = perror || error;
	debug = pdebug || debug;
}

module.exports.init = init;
module.exports.warn = function(t) { warn(t); };
module.exports.info = function(t) { info(t); };
module.exports.error = function(t) { error(t); };
module.exports.debug = function(t) { debug(t); };
