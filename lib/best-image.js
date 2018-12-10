"use strict";

/*
 * BestImage.js
 *
 * This module handles image fetching for sites by trying to find the best image from the target site to show
 * to represent the page.  In some cases, the site provider will specify an image directly via a meta tag, but many
 * sites do not.  This module will inspect all the images on the page that use <img> tags.  The "crawl" is a simple
 * retrieve of the HTML doc, and no link/script tags are crawled (thus, background images specified in CSS are not retrieved)
 * 
 * BestImage takes the page url, and an optional "query" which represents keywords that might best match the subject 
 * of the page or the image you specifically hope to retrieve.  
 *
 * BestImage utilizes a scoring algorithm to try and eliminate undesirable images, and favor images that might be the
 * best match based on image title, image filename, and image size.
 *
 * You may introduce your own scoring 
 *
 */

var request = require("request");
var url = require("url");
var async = require("async");
var LOGR = require("./logr.js");
var checkImageUrl = require("./checkImageUrl.js");
var imageScore = require("./imageScore.js");
var docImageParse = require("./docImageParse.js");
var _ = require("underscore");

// Currently the code will scrape the document, and return the top MAX_CANDIDATE_IMAGES scored images in an array
// which are further scrutinized by actually reading the image. 

var MAX_CANDIDATE_IMAGES = 5;
var MIN_IMAGE_WIDTH = 40;

/*
 * init ---------------------------------------------------------------------
 * during platform init, get the platform logger and environment (called from index.js)
 */
function init(info, warn, error, debug) {
  LOGR.init(info, warn, error, debug);
  checkImageUrl.init(info, warn, error, debug);
  imageScore.init(info, warn, error, debug);
  docImageParse.init(info, warn, error, debug);
}

/*
 *
 * About the Scoring Function (scoreFn) which can be passed to getBestAltImage
 *
 * provide a callback to post-adjust the default scoring algorithm for an array of image objects.  If specified, this
 * callback by default will be called after bestImage has completed it's scoring.  The scores for all objects
 * will be between 0 and 1, with the highest scoring item always being at 1.  
 *
 * The array of objects will be as follows:
 * {
   src: image src tag from document
   title: optional title (alt text) for image
   class: class name of image tag
   isMeta: image was specified in meta tags (curated)
   docTitle: title of source document and/or query used to generate it
   dimensions: when sorting the image set based on size/dimensions (sizeScore=true) this will contain the dimensions if available
   score: <the calculated score>
 * }
 *
 *
 * Your callback should be of the form:  (will be called twice, once with sizeScore false, and then with true during post processing)
 * function(imgArray, sizeScore) {
 *
 *    //.. do your processing
 *
 *    if (sizeScore) {
 *    sortBySizePreference(imgArray);
 *    } else {
 *    imgArray.forEach(function(item)) {
 *      item.score = myScore(item);    // array is altered in place
 *    }
 *    }
 * }
 *
 */ 


/*
 * DEBUGGING SUPPORT - for best-image-browser, or other tools to look at details of the scoring process
 */
var DEBUG_DETAILS = {};
function getBestImageDebug(hostUrl, query, callback, scoreFn) {
  //
  // This function will return all details regarding the processing for
  // the best image for debugging and tuning the scoring function
  //
  initDebug(hostUrl);
  addDebugDetails(hostUrl, "hostUrl", hostUrl);
  addDebugDetails(hostUrl, "query", query);

  return getBestAltImage(hostUrl, query, scoreFn, function(err, data) {
    callFinalCallback(hostUrl, callback, err, data);
  });
}

//--------------------------------------------------------------------------
function initDebug(hostUrl) {
  DEBUG_DETAILS[hostUrl] = {};
}
function debugRecord(hostUrl) {
  return DEBUG_DETAILS[hostUrl];
}

function addDebugDetails(hostUrl, key, value) {
  if (debugRecord(hostUrl)) {
    DEBUG_DETAILS[hostUrl][key] = value;
  }
}
function callFinalCallback(hostUrl, callback, err, data) {

  var retObj = data;
  if (debugRecord(hostUrl)) {
    retObj = {  bestImageUrl: data,
          debugInfo: debugRecord(hostUrl)
         };
  }

  callback(err, retObj);
  return;
}
/**************** End DEBUGGING SUPPORT ****************************************/

/*
 * setConfig
 *
 * pass in an object with any overrides for SCORE_CONFIG.  Any valid keys which
 * match SCORE_CONFIG will be used to override the base SCORE_CONFIG
 *
 */
function setConfig (config) {
  return imageScore.setConfig(config);
}

/*
 * getBestImage / getBestAltImage
 *
 * Given a url, loads the html document and retreives the best image for display
 *
 * TODO: allow for retrieval of array of "top images", not just the best
 */ 

// for compatability, maintain old signature
function getBestImage(fullUrl, query, callback) {
  return getBestAltImage(fullUrl, query, null, callback);
}

// full function
function getBestAltImage (fullUrl, query, scoreFn, callback) {

  if (!query) {
    query = ""; // assign an empty string if not specified
  }

  LOGR.debug("GET IMAGES FOR " + fullUrl + ":" + query);

  // load the destination page
  request.get(fullUrl, function (error, response, body) {

    // bail out if there was an error
    if (error || (response.statusCode && response.statusCode !== 200)) {
      LOGR.error("Failed to load document: " + error + " url= [" + fullUrl + "]");
      if (response) {
        LOGR.error("Status Code: " + response.statusCode);
      }
      callback("Failed to load document:" + error, null);
      return;
    }
    //
    // create a parseable doc to find the main image
    // body is the raw html
    LOGR.debug("******LOADED HTML DOCUMENT" + fullUrl);
    getBestImageFromDocument(fullUrl, query, body, scoreFn, callback);
  });
}  

/*
 * getBestImageFromDocument
 *
 * given the body of a document, will parse it with cheerio, and find the best image
 * can be used directly for testing
 *
 */ 
function getBestImageFromDocument(fullUrl, query, body, scoreFn, callback) {

  var checkUrl = false;

  docImageParse.getDocImageArray(fullUrl, body, query, function(err, imgArray) {


    addDebugDetails(fullUrl, "rawImageArray", imgArray);
    // clean, score, and sort and return array of image url's

    var maxImages = debugRecord(fullUrl) ? 0 : MAX_CANDIDATE_IMAGES;

    // fully resolve pathnames so scoring is correct
    imgArray.forEach(function(item) {
      if (item.attribs["data-src"] && !item.src) {
        item.src = item.attribs["data-src"];
      }
      if (item.src) {
        item.src = checkImageUrl.resolveRelativeUrl(fullUrl, item.src);
      } else {
        item.src = "";
      }  
    });
    imgArray = imageScore.findBestImages(imgArray, scoreFn, null); // null callback makes this SYNC

    // deDupe the array
    imgArray = deDupeImageArray(imgArray);

    // for debug, store results
    if (debugRecord(fullUrl)) {
      addDebugDetails(fullUrl, "scoredImageArray", imgArray);
    }

    LOGR.debug("IMAGES EXTRACTED=======");
    LOGR.debug(imgArray);

    async.eachOf(imgArray, function(img, index, cb_async) {

      checkImageUrl.resolveRelativeUrl(fullUrl, img.src, function(err, newImg) {
        // no error case, if so, newImg will be appropriately null
        imgArray[index].src = newImg;
        LOGR.debug("Transformed " + img.src + " to " + newImg);
        cb_async();  
      });

    }, function (err) {
      // we have an adjusted imageArray now, return to caller

      if (imgArray && imgArray.length > 0) {
        // NOW, return an image that will load correctly and is sized correctly (if not img1, then img2)
        findValidImage(fullUrl, imgArray, scoreFn, function(err, bestImage) {
          callback(err, bestImage);
        });
      } else {
        callback("No images found", null);
      }  
    });
  });

}

/*
 * findValidImage
 *
 * Goes through the array FIND_BLOCK_SIZE items at a time and tries to load each image in the array
 * and sets to null any items which do not load correctly.  returns the first
 * valid image in the sorted array.  This is a "recursive" function (calls itself) with
 * each successive segment of the array.  Calls the callback when a valid image is
 * found, or when it runs out of items to check
 */ 
var FIND_BLOCK_SIZE = 10;

function findValidImage(fullUrl, fullImgArray, scoreFn, cback) {

  var imgArray;
  var start = 0;
  var end = fullImgArray.length;

  if (fullImgArray.length===0) {
    cback("No valid image found", null);
    return;
  }

  end = Math.min(start + FIND_BLOCK_SIZE, end);
  imgArray = fullImgArray.slice(start, end);

  // run through all images in array and NULL out invalid ones
  async.eachOf(imgArray, function(img, index, async_cb) {

    checkImageUrl.checkImageUrl(img.src, function(err, dimensions) {
      img.dimensions = dimensions;
      if (err) { // || (dimensions && dimensions.width && dimensions.width < MIN_IMAGE_WIDTH)) {
        imgArray[index] = null;
      }
      async_cb();
    });

  }, function(err) {

    var newArray = imageScore.consolidateAndSizeRank(imgArray);

    newArray = imageScore.callSizingFunction(scoreFn, newArray);

    // put size scores back into the full array for debugging
    updateSizeScores(fullImgArray, newArray);

    // if there is one valid image left, return it, otherwise get the next chunk
    if (newArray.length > 0) {
      // for debug, store results
      if (debugRecord(fullUrl)) {
        addDebugDetails(fullUrl, "SizeScoredImageArray", newArray);
      }
      cback(null, newArray[0].src);
    } else {
      findValidImage(fullImgArray.slice(end), scoreFn, cback);
    }  
  });
}

/*
 * updateSizeScores
 *
 */ 
function updateSizeScores (fullArray, newArray) {
  newArray.forEach(function(item) {
    var obj = _.find(fullArray, function(obj) { return obj.src === item.src; });
    if (obj) {
      obj.sizeScore = item.sizeScore;
    }  
  });
}

/*
 * deDupeArray
 *
 */ 
function deDupeImageArray(imgArray) {
  var obj = {};
  var arr = [];

  if (imgArray) {
    imgArray.forEach( function(img) {
      obj[img.src] = img;
    });
    for (var key in obj) {
      arr.push(obj[key]);
    }
  }  
  return arr;
}


if (process.env.NODE_ENV === "test") {
  module.exports.findValidImage = findValidImage;
  module.exports.deDupeImageArray = deDupeImageArray;
  module.exports.updateSizeScores = updateSizeScores;
}

module.exports.setConfig = setConfig;
module.exports.init = init;
module.exports.getBestImage = getBestImage;
module.exports.getBestImageDebug = getBestImageDebug;
module.exports.getBestAltImage = getBestAltImage;
module.exports.getBestImageFromDocument = getBestImageFromDocument;

