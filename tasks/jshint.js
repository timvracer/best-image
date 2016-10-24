"use strict";

module.exports = function jshint(grunt) {
	// Load task
	grunt.loadNpmTasks("grunt-contrib-jshint");

	// Options
	return {
		node: {
			src: ["best-image.js",
					"lib/**/*.js",
					"test/**/*.js"],
			options: {
			    jshintrc: ".jshintrc"
			},
		}
	};
};
