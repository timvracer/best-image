"use strict";

var url = require("url");

/*
 * imageScore.js
 *
 * This module will score images retrieved from a document based on which image would likely make the best
 * fit to represent the document
 *
 */

var LOGR = require("./../lib/logr.js");
var stringSimilarity = require("string-similarity");

// helper function because I miss coffeescript
function exists(a) { return (a !== undefined && a !== null); }

function init(info, warn, error, debug) {
  LOGR.init(info, warn, error, debug);
}

var DEPS = {
  stringSimilarity: stringSimilarity,
  url: url
};

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
 * Your callback should be of the form:
 * function(imgArray, deps, sizeScore) {
	// imgArray = array of objects as described above
	// deps = dependencies (convienience) for libraries stringSimilarity, and url
	// doSizeScore = true if scoring for sizing
 *
 *    //.. do your processing
 *
 *    if (sizeScore) {
 *		sortBySizePreference(imgArray);
 *	  } else {
 *		imgArray.forEach(function(item) {
 *			item.score = myScore(item);	  // array is altered in place
 *		});
 *    }
 * }
 *
 */

var SCORE_CONFIG = {
  isMeta: 10.0,				// curated in a meta tag such as og:image
  isSVG: 0.5,					// is a data:image specification (vector)
  isJPG: 0.5,					// is a JPG file
  isGIF: 0.5,					// is a GIF file
  isPNG: 0.5,					// is a PNG file
  docTitleFactors: {
    imgTitle: 1,			// string similarity between image title if specified, and document title
    imgSrc: 1,				// string similarity between image url and document title
    imgFname: 1			// string similarity between image filename and document title
  },
  queryFactors: {
    imgTitle: 6,			// string similarity between image title if specified, and query
    imgSrc: 6,				// string similarity between image url and query
    imgFname: 6			// string similarity between image filename and query
  },
  goodWordMatch: 0.3,			// matched a good word
  badWordMatch: -2.0,			// matched a bad word
  badWordMatchFname: -2.0,	// matched a bad word in the filenmae
  size: {
    idealWidth: 200,
    idealHeight: 100,
    ratioWeight: 0.35,			// how much to negative factor differences in the aspect ratio
    smallerWeight: 7,		// how much negative factor if the image is smaller than ideal (surface area)
    largerWeight: 0.25		// how much negative factor if the image is larger than ideal (surface area)
  },
  goodWords: ["logo", "main"],

  badWords: ["spacer", "pixel", "email", "search", "button", "pageview", "phone", "call",
    "amazonlogo", "contact", "favicon", "blank", "question", "placeholder", "bbb", "sprite",
    "spinner", "reviews", "clear", "signup", "rss", "border"],

  badFilenames: ["spacer", "pixel", "amazon", "ebay", "btn", "bot", "up", "twitter",
    "facebook", "pinterest", "youtube", "gplus", "google", "favicon",
    "paypal", "mastercard", "visa", "phone", "email", "call", "border",
    "submit", "sprite", "spinner", "1x1", "clear", "signup", "rss", "arrow"]
};

var DEFAULT_CONFIG = cpobj(SCORE_CONFIG);

/*
 * setConfig
 *
 * pass in an object with any overrides for SCORE_CONFIG.  Any valid keys which
 * match SCORE_CONFIG will be used to override the base SCORE_CONFIG
 *
 */
function setConfig(config) {
  if (!config) {
    return false;
  }

  objKeyMatch(config, DEFAULT_CONFIG);

  SCORE_CONFIG = cpobj(config);
}

/*
 * objKeyMatch
 *
 * Given an object, and a reference Object, this will alter the given object as
 * necessary to ensure it has all the fields that are provided in the reference object.
 * if the source object is missing a field, it is added with the value from the
 * reference object.  This is executed recursively (deep)
 */
function objKeyMatch(obj, referenceObj) {

  for (var key in referenceObj) {
    if (typeof (referenceObj[key]) === "object") {
      if (exists(obj[key])) {
        objKeyMatch(obj[key], referenceObj[key]);
      } else {
        obj[key] = cpobj(referenceObj[key]);
      }
    } else {
      if (!exists(obj[key])) {
        obj[key] = referenceObj[key];
      }
    }
  }
}
/*
 * objDeepCopy
 */
function cpobj(obj) {
  return JSON.parse(JSON.stringify(obj));
}


function objDeepCopy(object) {

  var newObj;

  if (isArray(object)) {
    newObj = [];
  } else {
    newObj = {};
  }
  for (var key in object) {
    if (typeof (object[key]) === "object") {
      newObj[key] = objDeepCopy(object[key]);
    } else {
      if (isArray(object)) {
        newObj.push(object[key]);
      } else {
        newObj[key] = object[key];
      }
    }
  }
  return newObj;
}

function isArray(obj) {
  return obj.push !== undefined;
}

/*
 * findBestImages
 *
 * Look through all the provided image records, and find the best images for the given document and
 * title string, and return up to maxImages URL's in sorted order by score
 *
 * Takes an imgArray:
 * imgArray is an array of image objects as follows:
 *
 * {
	 src: image src tag from document
	 title: optional title (alt text) for image
	 class: class name of image tag
	 isMeta: image was specified in meta tags (curated)
	 docTitle: title of source document and/or query used to generate it
	}
 *
 * Returns an array of strings (url's)
 *
 */

function findBestImages(imgArray, scoreFn) {

  var ret;

  imgArray.forEach(function (obj) {
    obj.score = 0;
    if (isValidSrcTag(obj.src)) {
      obj.score = preferenceScore(obj);
    }
  });

  // sort	
  imgArray = imgArray.sort(function (a, b) {
    return (b.score - a.score);
  });


  // This will convert all scores to fall relatively between 0 and 1
  // the largest scoring item will ALWAYS be scored as 1 
  normalizeScores(imgArray);

  if (scoreFn) {
    // console.log("CALLING SCORE FUNCTION NOW");

    scoreFn(imgArray, DEPS, false);
    // resort the array (don't count on the caller to do this)
    imgArray = imgArray.sort(function (a, b) {
      return (b.score - a.score);
    });
    normalizeScores(imgArray);
  }

  ret = imgArray;

  LOGR.debug("RESULTING IMAGE ARRAY =============================");
  LOGR.debug(ret);

  return ret;
}

/*
 * callSizingFunction
 * used to call the alternative sizing function
 *
 */
function callSizingFunction(scoreFn, newArray) {
  //
  // TODO: if there is a user passed in scoring function, call it with sizeScore=true 
  //       to allow overriding of the size calclulations
  if (scoreFn) {
    scoreFn(newArray, DEPS, true);
  }

  // adjust scores with size
  return adjustScoresWithSize(newArray);
}

/*
 * normalizeScores
 *
 * Convert scores for this group of images to be between 0 and 1.  Scores are only relative to the
 * group provided (scores to not compare fairly across separate image groupings)
 */
function normalizeScores(arr) {
  var max = -999999;

  arr.forEach(function (item) {
    max = Math.max(max, item.score);
  });
  arr.forEach(function (item) {
    item.score = item.score / max;
  });
}

/*
 * adjustScoresWithSize
 *
 * Convert scores for this group of images to be between 0 and 1.  Scores are only relative to the
 * group provided (scores to not compare fairly across separate image groupings)
 */

function adjustScoresWithSize(newArray) {
  newArray.forEach(function (item) {
    item.score += item.sizeScore;
  });
  normalizeScores(newArray);
  newArray = newArray.sort(function (a, b) {
    return b.score - a.score;
  });
  return newArray;
}

/*
 * isValidSrcTag
 *
 * For whatever reason, some sites will put invalid src tags (empty, spaces, etc.), so we check for that
 * here.  
 */
function isValidSrcTag(src) {

  // non null
  if (!src) { return false; }
  // data tag ok
  if (src.indexOf("data:") === 0) { return true; }
  // has content
  if (src.trim().length > 0) { return true; }

  return false;
}


//=======================================================================================


/*
 * preferenceScore
 *
 * Scores all image results based on various characteristics and names.  Also does a string similarity test with the
 * given "docTitle" string.  The object passed in primarily is expected to have "src" and optional "title" and "class" attributes 
 * obj should also contain a "docTitle" property which is the query, or document title
 *
 */

function preferenceScore(obj) {

  var imgUrl = obj.src,
    score = 0.0,
    isSVG = false,
    temp;

  obj.titleScore = obj.queryScore = 0;

  if (imgUrl.indexOf("data:image") >= 0) {
    isSVG = true;
  } else {
    if (obj.docTitle) {
      score += getTitleScore(obj, obj.docTitle, SCORE_CONFIG.docTitleFactors);
      obj.titleScore = score;
    }
    if (obj.query) {
      score += getTitleScore(obj, obj.query, SCORE_CONFIG.queryFactors);
      obj.queryScore = score - obj.titleScore;
    }
  }

  if (obj.isMeta) {
    score += SCORE_CONFIG.isMeta;
  }

  temp = score;
  if (!isSVG) {
    score += checkGoodWords(obj.src);
  }
  score += checkGoodWords(obj.class);
  score += checkGoodWords(obj.title);
  obj.goodWords = score - temp;

  temp = score;
  if (!isSVG) {
    score += checkBadWords(obj.src);
  }
  obj.badWords = score - temp;

  temp = score;
  score += checkFilenameBadWords(obj);
  obj.badFnameWords = score - temp;

  score += getExtensionScore(imgUrl);

  return score;
}

/*
 * getExtensionScore
 *
 */

function getExtensionScore(imgUrl) {

  // Scores based on file type if applicable
  if (imgUrl.indexOf("data:image") === 0) {
    return SCORE_CONFIG.isSVG;
  }
  if (hasExtension(imgUrl, ["ashx", "jpg", "jpeg"])) {
    return SCORE_CONFIG.isJPG;
  }
  if (hasExtension(imgUrl, ["gif"])) {
    return SCORE_CONFIG.isGIF;
  }
  if (hasExtension(imgUrl, ["png"])) {
    return SCORE_CONFIG.isPNG;
  }
  return 0;
}

/*
 * getTitleScore
 *
 * returns a score based on the given title, if any, for the image as it compares
 * to the document title provided in the image object
 */
function getTitleScore(obj, title, factors) {

  var fname = "";
  var prePath = "";
  var pathname = DEPS.url.parse(obj.src).pathname;

  if (pathname) {
    fname = pathname.slice(pathname.lastIndexOf("/"));
    prePath = pathname.slice(0, pathname.lastIndexOf("/"));
  }

  var addScore = 0;

  // if there is a title, compare to it, otherwise compare to the prePath
  if (obj.title) {
    // if the image has a title, compare it to the document titile
    addScore = factors.imgTitle * DEPS.stringSimilarity.compareTwoStrings(obj.title, title);
  } else if (obj.alt) {
    addScore = factors.imgTitle * DEPS.stringSimilarity.compareTwoStrings(obj.alt, title);
  } else {
    // otherwise, compare the url itself to the document title
    addScore = factors.imgSrc * DEPS.stringSimilarity.compareTwoStrings(prePath, title);
  }

  // tack on value for matches in the filename portion of the url
  addScore += factors.imgFname * DEPS.stringSimilarity.compareTwoStrings(fname, title);

  return addScore;
}

/*
 * checkUrlGoodWords
 *
 * Looks for positive words in the URL that indicate it may make a good main image
 */
function checkGoodWords(text) {

  // If contains a goodWord, bump the score
  if (!text) { return 0; }

  if (SCORE_CONFIG.goodWords.some(function (word) {
    return (text.toLowerCase().indexOf(word) >= 0);
  })) {
    return SCORE_CONFIG.goodWordMatch;
  }
  return 0;
}

/*
 * checkUrlBadWords
 *
 * Looks for negative words in the URL that would indicate this is a BAD match for
 * a main image
 */
function checkBadWords(text) {
  // If contains a bad word, debit the score
  if (SCORE_CONFIG.badWords.some(function (word) {
    return text.toLowerCase().indexOf(word) >= 0;
  })) {
    return SCORE_CONFIG.badWordMatch;
  }
  return 0;
}

/*
 * checkFilenameBadWords
 *
 * Looks for negative words specifically in the filename portion of the URL to look for
 * key indicators of images that will make a bad fit for the main image
 */
function checkFilenameBadWords(obj) {
  var imgUrl = obj.src;

  // If the trailing filename has a bad filename word, debit significantly
  if (SCORE_CONFIG.badFilenames.some(function (word) {
    var fn = imgUrl.slice(imgUrl.lastIndexOf("/"));
    return fn.toLowerCase().indexOf(word) >= 0;
  })) {
    return SCORE_CONFIG.badWordMatchFname;
  }
  return 0;
}

/*
 * hasExtension
 *
 * Determines if a filename has a particular extension
 *
 */
function hasExtension(file, extArray) {

  if (extArray.some(function (ext) {
    if (ext.charAt(0) !== ".") {
      ext = "." + ext;
    }
    var loc = file.lastIndexOf(ext);
    return (loc + ext.length === file.length);
  })) {
    return true;
  }
  return false;
}

/*
 * consolidateAndSizeRank
 *
 */
function consolidateAndSizeRank(imgArray) {

  // console.log("SIZE SCORE");
  // console.log(SCORE_CONFIG.size);

  // consolidate, remove nulls
  var newArray = [];
  imgArray.forEach(function (item) {
    if (item) {
      newArray.push(item);
    }
  });
  // rank by size
  newArray.forEach(function (imgObj) {
    imgObj.sizeScore = sizeScore(imgObj);
  });
  return newArray;
}

/*
 * sizeScore
 *
 */
// return a value that indicates the "goodness" of the image size
function sizeScore(imgObj) {

  if (!imgObj.dimensions || !imgObj.dimensions.width || !imgObj.dimensions.height) { return 0; }

  var x = imgObj.dimensions.width;
  var y = imgObj.dimensions.height;
  var idealRatio = SCORE_CONFIG.size.idealWidth / SCORE_CONFIG.size.idealHeight;

  var ratio = x / (y + 0.001);
  var rdiff = Math.abs(idealRatio - ratio) * SCORE_CONFIG.size.ratioWeight;

  var surfaceArea = x * y;
  var sdiff = (surfaceArea - (SCORE_CONFIG.size.idealWidth * SCORE_CONFIG.size.idealHeight));

  imgObj.sdiffRaw = sdiff;
  imgObj.surfaceArea = surfaceArea;

  if (sdiff > 0) {
    sdiff = Math.log(Math.abs(sdiff)) * 0.01 * SCORE_CONFIG.size.largerWeight;
  } else if (sdiff < 0) {
    sdiff = Math.log(Math.abs(sdiff)) * 0.01 * SCORE_CONFIG.size.smallerWeight;
  }

  imgObj.rdiff = rdiff;
  imgObj.sdiff = sdiff;
  imgObj.idealRatio = idealRatio;
  imgObj.preSizeScore = imgObj.score;

  return (1 - (rdiff + sdiff));
}



if (process.env.NODE_ENV === "test") {
  module.exports.preferenceScore = preferenceScore;
  module.exports.hasExtension = hasExtension;
  module.exports.isValidSrcTag = isValidSrcTag;
  module.exports.sizeScore = sizeScore;
  module.exports.getTitleScore = getTitleScore;
  module.exports.objKeyMatch = objKeyMatch;
  module.exports.objDeepCopy = objDeepCopy;
}
module.exports.callSizingFunction = callSizingFunction;
module.exports.setConfig = setConfig;
module.exports.findBestImages = findBestImages;
module.exports.consolidateAndSizeRank = consolidateAndSizeRank;
module.exports.normalizeScores = normalizeScores;
module.exports.adjustScoresWithSize = adjustScoresWithSize;

module.exports.init = init;

