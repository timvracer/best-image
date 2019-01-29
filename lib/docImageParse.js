"use strict";

/*
 * docImageParse.js
 *
 * Parse the given HTML text for image tags, and return an array of found image tags (candidates)
 * 
 */

var request = require("request");
var async = require("async");
var cheerio = require("cheerio");
var cssParse = require("css");

var checkImageUrl = require("./checkImageUrl.js");
var LOGR = require("./../lib/logr.js");

function init(info, warn, error, debug) {
	LOGR.init(info, warn, error, debug);
}

/*
 * getDocImageArray
 *
 * given the body of a document, will parse it with cheerio, and return an array
 * of candidate images
 *
 */
function getDocImageArray(fullUrl, body, query, callback) {

	var title = "";
	var doc = cheerio.load(body);

	doc.fullUrl = fullUrl;

	var titleHtml = cheerio(body).find("title");


	if (titleHtml) {
		title = cheerio(titleHtml).text();
	}
	// get the images from the document
	return extractImages(doc, body, title, query, callback);
}

/*
 * extractImages
 *
 * Get the images specified in the META tags as well as all img tags, score them, sort them, and trim to size
 * and return an array of image URL's from the document
 *
 */
function extractImages(doc, html, title, query, callback) {

	var images = [];

	// get images marked with meta tags (gets only the first 2)
	images = getMetaImages(doc, html);
	images = images.concat(extractImageTags(doc, html));

	getCSSImages(doc, html, function (err, cssImages) {

		var retImages = [];

		images = images.concat(cssImages);

		var imgCheck = {};

		// flatten the document object with image attributes/metaData
		// we also have set isMeta, and docTitle as context for the caller
		// we remove duplicates at the same time
		images.forEach(function (obj, index) {
			if (!imgCheck[obj.attribs.src]) {
				obj.src = obj.attribs.src;
				obj.title = obj.attribs.title;
				obj.class = obj.attribs.class;
				obj.alt = obj.attribs.alt;
				obj.docTitle = title;
				obj.query = query;
				imgCheck[obj.src] = true;
				retImages.push(obj);
			}
		});

		callback(null, retImages);
	});
	//return images;
}

/*
 * getMetaImages
 *
 * Gets the Meta images from the document, only returns the top 2
 */
function getMetaImages(doc, html) {

	var images = [];
	var nextObj;
	var ret = [];
	var obj;

	images = doc("meta[property='og:image'], meta[name='twitter:image:src'], meta[name='twitter:image'], meta[name='twitter:image0']");
	if (images.length > 0 && images.first().attr("content")) {
		obj = {};
		obj.attribs = images.get(0).attribs;
		obj.attribs.src = obj.attribs.content;
		obj.isMeta = true;
		ret.push(obj);
		// add a second choice if there is one
		nextObj = images.get(1);
		if (nextObj) {
			if ("content" in nextObj.attribs) {
				obj = {};
				obj.attribs = nextObj.attribs;
				obj.attribs.src = obj.attribs.content;
				obj.isMeta = true;
				ret.push(obj);
			}
		}
	}
	return ret;
}

/*
 * extractImageTags
 *
 * gets the images in the document identified by <img> tags
 */
function extractImageTags(doc, html) {
	var imgArray = [];
	var images = [];

	images = cheerio(html).find("img");

	images.each(function () {
		var item = doc(this);
		var obj = {};
		var ret;

		obj.attribs = item.get(0).attribs;

		if (!obj.attribs.src && obj.attribs.srcset) {
			var sources = obj.attribs.srcset.split(",");
			obj.attribs.src = sources[0];
		}
		imgArray.push(obj);
	});

	return imgArray;
}

/*
 * getCSSImages
 *
 * WARNING: callback hell ahead
 */
function getCSSImages(doc, html, callback) {


	var cssLinks = [];
	var cssImages = [];

	cssLinks = cheerio(html).find("link[rel='stylesheet']");

	// we now have an array of stylesheet links, we need to parse them
	// each to find background images referenced
	async.each(cssLinks, function (cssObj, async_cb) {

		var href = cssObj.attribs.href;

		if (href) {
			// resolve the path relative url to the CSS file
			checkImageUrl.resolveRelativeUrl(doc.fullUrl, href, function (err, fullUrl) {

				// Ok, let's continue this nested async nightmare by reading in the CSS contents
				request.get(fullUrl, function (error, response, body) {

					if (error || response.statusCode !== 200) {
						LOGR.debug("Error loading CSS file: " + fullUrl + " - " + error);
						async_cb();
					} else {
						// find all the background image tags and add the URL's to the array

						try {
							// parse CSS file into an AST structure (see reworkcss)
							var ast = cssParse.parse(body);
							if (ast && ast.stylesheet && ast.stylesheet.rules) {
								ast.stylesheet.rules.forEach(function (rule) {
									// find background or background-image declarations
									if (rule.declarations) {
										rule.declarations.forEach(function (item) {
											if (item.property === "background-image" || item.property === "background") {
												// check for a 'url' property, if it exists, that is our image URL to test
												if (item.value.trim().indexOf("url") === 0) {
													var imgUrl = item.value.trim();

													imgUrl = /(?:\(['"]?)(.*?)(?:['"]?\))/.exec(imgUrl);
													if (imgUrl && imgUrl.length >= 2) {
														LOGR.debug("IMAGE URL = " + imgUrl[1]);
														var obj = { attribs: { src: imgUrl[1] } };
														cssImages.push(obj);
													} else {
														LOGR.debug("NO IMAGE FOUND");
													}
												}
											}
										});
									}
								});
							}
						} catch (e) {
							console.log("Parsing Error: " + e);
						}
						// serves as the callback for everything in the else clause 
						async_cb();
					}
				});
			});
		} else {
			async_cb();
		}
	}, function () {  // ASYNC collector function
		callback(null, cssImages);
	});

}



if (process.env.NODE_ENV === "test") {
	module.exports.extractImages = extractImages;
	module.exports.getMetaImages = getMetaImages;
	module.exports.extractImageTags = extractImageTags;
	module.exports.getCSSImages = getCSSImages;
}

module.exports.init = init;
module.exports.getDocImageArray = getDocImageArray;

