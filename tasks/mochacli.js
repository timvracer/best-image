"use strict";

module.exports = function mochacli(grunt) {
	// Load task
    grunt.loadNpmTasks("grunt-mocha-cli");
    
	// Options
	return {
		node: {
			src: ["test/best-image_test.js"],
			options: {
				reporter: "spec"
			},
		}
	};
};
