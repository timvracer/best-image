
/*jslint node: true */
"use strict";
/*jshint multistr: true */

var assert = require("assert");
var cheerio = require("cheerio");

var request = require("request");
var sinon = require("sinon");

//
// This test will test each of these modules
//
var docImageParse = require("./../lib/docImageParse.js");
var checkImageUrl = require("./../lib/checkImageUrl.js");
var imageScore = require("./../lib/imageScore.js");
var bestImage = require("./../lib/best-image.js");


//bestImage.init(console.log, console.log, console.log, console.log);

//
// RUN TEST WITH THE FOLLOWING SHELL COMMAND
// NODE_ENV='test' mocha test/best-image_test.js --reporter spec
//
// NOTE, for testing we do not bother with actually retrieving web pages (we trust request has been tested)
// and instead feed documents directly into getBestImageFromDocument
//

function cpobj(obj) {
	return JSON.parse(JSON.stringify(obj));
}

var PAGE1 = "\
<head>\
	<title> Tire repair and bodywork </title>\
</head>\
<html>\
	<link href='/css/testfile.css' rel='stylesheet'>\
	<link href='/css/testfile.js' rel='somethingelse'>\
	<meta content='/ogimage.jpg' property='og:image'>\
	<meta content='/twitterimage.jpg' name='twitter:image'>\
	<img src='http://image1.jpg' class='repair'> </img>\
	<img src='http://image2.gif'></img>\
	<img src='http://image3.png'></img>\
	<img src='data:binaryencodeddatahere'></img>\
	<img src='http://tirerepair.gif'></img>\
	<img src=''></img>\
	<img src='http://image6.gif'></img>\
	<img src='http://image7.gif'></img>\
</html>";

var CSS_FILE = "\
html: {\
	background: white;\
}\
header: {\
	background-image: url('http://www.site.com/header_image_btn.gif');\
}\
middle: {\
	background: rgba(0,20,55, 0.3);\
}\
footer: {\
	background: url(http://www.site.com/footer_image_btn.png);\
}";

/* jshint -W110 */  // we ignore the mixed double/single quote warning, needed for this test
var CSS_FILE_DBQ = '\
html: {\
	background: white;\
}\
middle: {\
	background: rgba(0,20,55, 0.3);\
}\
header: {\
	background-image: url("http://www.site.com/header_image.gif");\
}\
footer: {\
	background: url(http://www.site.com/footer_image.png);\
}';
/* jshint +W110 */	
/*
 * docImageParse
 */
describe("Doc Image Parse Module (docImageparse)", function() {

	describe("image extraction functions", function() {
		before(function() {
			sinon.stub(request, "get").yields(null, {statusCode: 200}, CSS_FILE);
		});
		after(function(){
			request.get.restore();
		});

		var doc = cheerio.load(PAGE1);
		var title = "Test Page";

		doc.fullUrl = "http://www.site.com/index.html";

		var imgArray1 = docImageParse.getMetaImages(doc, PAGE1);
		it("should extract 2 meta images from the document", function() {
			assert.equal(2, imgArray1.length);
			assert.equal("/ogimage.jpg", imgArray1[0].attribs.src);
			assert.equal("/twitterimage.jpg", imgArray1[1].attribs.src);
		});
		var imgArray2 = docImageParse.extractImageTags(doc, PAGE1);
		it("should extract 8 image tags from the document", function() {
			assert.equal(8, imgArray2.length);
			assert.equal("http://image1.jpg", imgArray2[0].attribs.src);
			assert.equal("http://image2.gif", imgArray2[1].attribs.src);
			assert.equal("http://image3.png", imgArray2[2].attribs.src);
		});

		it("should extract background-image and background tags from the document", function(done) {
			docImageParse.getCSSImages(doc, PAGE1, function(err, imgArray) {
				assert.equal(2, imgArray.length);
				assert.equal("http://www.site.com/header_image_btn.gif", imgArray[0].attribs.src);
				assert.equal("http://www.site.com/footer_image_btn.png", imgArray[1].attribs.src);
				done();
			});
		});
	});
	
	describe("function getDocImageArray to extract best images from HTML", function() {

		before(function() {
			sinon.stub(request, "get").yields(null, {statusCode: 200}, CSS_FILE);
		});
		after(function(){
			request.get.restore();
		});

		it("should return all images in the doc including meta tag and css images", function(done) {
			docImageParse.getDocImageArray("http://www.site.com", PAGE1, "query", function(err, imgArray) {
				assert.equal(12, imgArray.length);
				done();
			});
		});
	});			
});

/*
 * checkImageUrl
 */
describe("CheckImageUrl module", function() {
	describe("test helper function extensionSupportedForSizing ", function() {

		it("should return true for JPG", function() {
			assert.equal(true, checkImageUrl.extensionSupportedForSizing("http://www.site.com/index/asset.jpg").supported);
			assert.equal("jpg", checkImageUrl.extensionSupportedForSizing("http://www.site.com/index/asset.jpg").ext);
		});
		it("should return true for GIF and with no https", function() {
			assert.equal(true, checkImageUrl.extensionSupportedForSizing("https://www.site.com/asset.gif").supported);
			assert.equal("gif", checkImageUrl.extensionSupportedForSizing("https://www.site.com/asset.gif").ext);
		});
		it("should return true for PNG and with trailing url paramaters", function() {
			assert.equal(true, checkImageUrl.extensionSupportedForSizing("https://www.site.com/asset.png?stuff=5&more=hello there.blah").supported);
			assert.equal("png", checkImageUrl.extensionSupportedForSizing("https://www.site.com/asset.png?stuff=5&more=hello there.blah").ext);
		});
		it("should return false for AXF file", function() {
			assert.equal(false, checkImageUrl.extensionSupportedForSizing("https://www.site.com/asset.axf").supported);
			assert.equal("axf", checkImageUrl.extensionSupportedForSizing("https://www.site.com/asset.axf").ext);
		});
	});

	describe("test helper function cleanUpUrl", function() {

		var sourceUrl = "http://test.ask.com/sitepath";
		var sourceHost = "http://test.ask.com";

		it("should return back a fully qualified image url pathname", function() {
			var imgUrl = "http://test.ask.com/image.jpg";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, imgUrl);
			});
		});
		it("should add the host if preceded by a slash", function() {
			var imgUrl = "/imgpath/image.jpg?query=hello#hashtag";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, sourceHost + imgUrl);
			});
		});
		it("should add the host if preceded by a slash", function() {
			var imgUrl = "/imgpath/image.jpg";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, sourceHost + imgUrl);
			});
		});
		it("should add the host if preceded by a dot dot slash", function() {
			var imgUrl = "../imgpath/image.jpg";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, sourceHost + "/" + "imgpath/image.jpg");
			});
		});
		it("should add the protocol if preceded by a double slash", function() {
			var imgUrl = "//test.ask.com/imgpath/image.jpg?query=hello#hashtag";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, "http:" + imgUrl);
			});
		});
		it("should add the protocol if preceded by a double slash", function() {
			var imgUrl = "//test.ask.com/imgpath/image.jpg";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, "http:" + imgUrl);
			});
		});
		it("should add the host and the path if preceded by nothing", function() {
			var imgUrl = "imgpath/image.jpg?query=hello#hashtag";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, sourceHost + "/" + imgUrl);
			});
		});
		it("should add the host and the path if preceded by nothing", function() {
			var imgUrl = "imgpath/image.jpg?";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, sourceHost + "/" + imgUrl);
			});
		});
		it("should handle an empty string per url rules and return the base path", function() {
			var imgUrl = "";
			checkImageUrl.resolveRelativeUrl(sourceUrl, imgUrl, function(err, img) {
				assert.equal(img, sourceUrl);
			});
		});
	});	
});

/*
 * ImageScore
 */
describe("ImageScore module", function() {

	describe("test helper function hasExtension", function() {

		it("return TRUE if file extension matches what is provided", function() {
			assert.equal(true, imageScore.hasExtension("file.jpg", ["jpg", "gif"]));
		});
		it("should return FALSE if the specified extension does not match", function() {
			assert.equal(false, imageScore.hasExtension("file.jpg", ["png", "gif"]));
		});
	});
	describe("helper function deDupeImageArray removes dup items in array", function() {

		var arr = [{src:"test"}, {src:"hello"}, {src:"fred"}, {src:"test"}, {src:"hello"}, {src:"test"}];
		var arrR = [{src:"test"}, {src:"hello"}, {src:"fred"}];

		it("should remove duplicate items from an array", function() {
			assert.equal(JSON.stringify(arrR), JSON.stringify(bestImage.deDupeImageArray(arr)));
		});
	});
	describe("test helper function isValidSrcTag", function() {

		it("should return FALSE if tag is null", function() {
			assert.equal(false, imageScore.isValidSrcTag(null));
		});
		it("should return FALSE if tag is empty", function() {
			assert.equal(false, imageScore.isValidSrcTag(""));
		});
		it("should return FALSE if tag is spaces", function() {
			assert.equal(false, imageScore.isValidSrcTag("  "));
		});
		it("should return TRUE if a data tag", function() {
			assert.equal(true, imageScore.isValidSrcTag("data:datagoeshere"));
		});
		it("should return TRUE if a valid string", function() {
			assert.equal(true, imageScore.isValidSrcTag("/could/be/anything/really"));
		});
	});
	describe("helper function normalizeScores", function() {

		it("should adjust array scores to fall between 0 and 1", function() {
			var arr = [{score: 0}, {score: 0.2}, {score: 2.5}, {score: 1.3}, {score:0.6}];

			imageScore.normalizeScores(arr);
			arr.forEach(function(item) {
				assert.equal(true, item.score >= 0 && item.score <= 1);
			});
		});
		it("should handle a single image with a negative score", function() {
			var arr = [{score: -0.003}];

			imageScore.normalizeScores(arr);
			arr.forEach(function(item) {
				assert.equal(true, item.score===1);
			});
		});


	});

	describe("helper function getTitleScore", function() {
		var factors = {imgTitle: 15, imgSrc: 15, imgFname: 10};
		var img1 = {src: "http://www.site.com/images/tirerepair.gif"};
		var img2 = {src: "http://www.site.com/images/image.gif"};

		it("should score the image with a related title/url higher", function() {
			var score1 = imageScore.getTitleScore(img1, "How to repair your tire", factors);
			var score2 = imageScore.getTitleScore(img2, "How to repair your tire", factors);
			assert(true, score1 > score2);
		});	
		it("should score the image with a related title/url higher - vary titles", function() {
			var score1 = imageScore.getTitleScore(img1, "How to repair your tire", factors);
			var score2 = imageScore.getTitleScore(img1, "Query makes no sense", factors);
			assert(true, score1 > score2);
		});	

	});

	describe("helper function preferenceScore (spot check)", function() {

		var baselineImgUrl = "http://www.ask.com/assets/images/tire-repair";
		var baseObject = {
			docTitle: "",
			attribs: {
				src: baselineImgUrl,
				class: null
			}
		};
		var config = {
			isPNG: 0.3,
			isGIF: 0.4,
			isJPG: 0.5
		};

		imageScore.setConfig(config);
		it("should favor JPG over GIF", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.src = baselineImgUrl + ".jpg";
			obj2.src = baselineImgUrl + ".gif";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
		it("should favor GIF over PNG", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.src = baselineImgUrl + ".gif";
			obj2.src = baselineImgUrl + ".png";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
		it("should avoid image filenames with block words", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.src = baselineImgUrl + "image.gif";
			obj2.src = baselineImgUrl + "/spacer.gif";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
		it("should avoid urls with block words", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.src = baselineImgUrl + "image.gif";
			obj2.src = baselineImgUrl + "/email/emailicon.gif";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
		it("should favor an image that has similarity to the given docTitle", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.docTitle = "How to repair your tire";
			obj1.src = baselineImgUrl + "tirerepair.gif";
			obj2.src = baselineImgUrl + "image.gif";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
		it("should favor an image that has a title which is similar to the given docTitle", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.docTitle = "How to repair your tire";
			obj1.title = "Image of tire being repaired";
			obj1.src = baselineImgUrl + "image.gif";
			obj2.src = baselineImgUrl + "image.gif";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
		it("should favor an image that has good words in the URL", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.src = baselineImgUrl + "page-logo.gif";
			obj2.src = baselineImgUrl + "image.gif";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
		it("should favor an image that has good words in the image title", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.title = "Logo image";
			obj1.src = baselineImgUrl + "image.gif";
			obj2.src = baselineImgUrl + "image.gif";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
		it("should favor an image that has good words in the image class", function() {
			var obj1 = cpobj(baseObject);
			var obj2 = cpobj(baseObject);
			obj1.class = "Logo image";
			obj1.src = baselineImgUrl + "image.gif";
			obj2.src = baselineImgUrl + "image.gif";
			var obj1Score = imageScore.preferenceScore(obj1);
			var obj2Score = imageScore.preferenceScore(obj2);
			assert.equal(true, obj1Score > obj2Score);
		});
	});

	describe("consolidateAndSizeRank for scoring subsets of image arrays with size information", function() {

		var newArray;
		var imgArray=[
			{
				src: "http://site.com/image1.jpg",
				score: 0.5,
				dimensions: {width: 300, height: 200}
			},
			null,
			{
				src: "http://site.com/image2.jpg",
				score: 0.5,
			},
			null,
			{
				src: "http://site.com/image3.jpg",
				score: 0.5,
				dimensions: {width: 1, height: 1}
			},
			{
				src: "http://site.com/image4.jpg",
				score: 0.5,
				dimensions: {width: 400, height: 200}
			},
			{
				src: "http://site.com/image4.jpg",
				score: 0.5,
				dimensions: {width: 40, height: 20}
			},
			{
				src: "http://site.com/image5.jpg",
				score: 0.5,
				dimensions: {width: 0, height: 0}
			},
			{
				src: "http://site.com/image6.jpg",
				score: 0.5,
				dimensions: {width: 1024, height: 768}
			}
		];
		newArray = imageScore.consolidateAndSizeRank(imgArray);

		it("should return a smaller considated array with nulls removed", function() {
			assert.equal(newArray.length, 7);
		});
	});

	describe("function findBestImages will return the best images from the given array", function() {

		var imgArray = [
			{	content: "/ogimage.jpg",
				property: "og:image",
				src: "/ogimage.jpg" ,
				docTitle: "query ",
				isMeta: true
			},
			{  
				content: "/twitterimage.jpg",
				name: "twitter:image", 
				docTitle: "query ",
				src: "/twitterimage.jpg",
				isMeta: true 
			},
			{ src: "http://image1.jpg", docTitle: "query " },
			{ src: "http://image2.gif", docTitle: "query " },
			{ src: "http://image3.png", docTitle: "query " },
			{ src: "data:binaryencodeddatahere", docTitle: "query "},
			{ src: "http://image4.gif", docTitle: "query " },
			{ src: "http://image5.gif", docTitle: "query " },
			{ src: "http://image6.gif", docTitle: "query " },
			{ src: "http://image7.gif", docTitle: "query " }
		];

		it("should return the meta images as the top 2 images", function() {
			var images = imageScore.findBestImages(imgArray, null);
			assert.equal("/ogimage.jpg", images[0].src);
			assert.equal("/twitterimage.jpg", images[1].src);
		});
		describe("should return the raw sorted array with scores if pass maxImages as zero", function() {
			var images = imageScore.findBestImages(imgArray, null);
			it("should return all the images in the array given", function() {
				assert.equal(10, images.length);
			});

			it("should return all images in sorted order", function() {
				var highScore = images[0].score;
				for (var i = 1; i < images.length; i++) {
					assert.equal(true, images[i].score <= highScore);
					highScore = images[i].score;
				}
			});	
		});
		describe("function findValidImage to return a single image from array", function() {
	
			var fullUrl = "http://www.site.com/index.html";
			bestImage.findValidImage(fullUrl, imgArray, null, function(err, bestImg) {
				assert.equal("http://image1.jpg", bestImg);
			});
		});

	});
});

/*
 * bestImage
 */
describe("bestImage module", function() {

	before(function() {
		sinon.stub(request, "get").yields(null, {statusCode: 200}, CSS_FILE);
	});
	after(function(){
		request.get.restore();
	});

	describe("Update Size Score", function () {
		var fullArray = [{src:"img1"}, {src:"img2"}, {src:"img3"}, {src:"img4"}];
		var newArray = [{src:"img2", sizeScore: 1.0}, {src:"img3"}, {src:"img1", sizeScore: 0.3}];

		it("should update the fullArray with scores in the newArray", function() {
			bestImage.updateSizeScores(fullArray, newArray);
			assert.equal(fullArray[0].sizeScore, 0.3);
			assert.equal(fullArray[1].sizeScore, 1.0);
			assert.equal(fullArray[2].sizeScore, undefined);
			assert.equal(fullArray[3].sizeScore, undefined);
		});
	});

	describe("Alternative user specified scoring", function() {

		var DEPS = {};
		var scoreFn = function(imgArray, DEPS, sizeScore) {
			if (sizeScore) {
				imgArray.forEach(function(item) {
					item.sizeScore = 100;
				});
			} else {
				imgArray.forEach(function(item) {
					if (item.isMeta) {
						item.score = 0;
					}	
				});
			}	
		};


		it("should call the alternative scoring algorithm and adjust scores", function(done) {
			docImageParse.getDocImageArray("http://www.site.com", PAGE1, "query", function(err, imgObjArray) {

				var imgArray = imageScore.findBestImages(imgObjArray, scoreFn);
				// deDupe the array
				imgArray = bestImage.deDupeImageArray(imgArray);

				assert.equal("http://tirerepair.gif", imgArray[1].src);
				assert.equal("http://image1.jpg", imgArray[0].src);
				done();
			});
		});
	});
		
});


