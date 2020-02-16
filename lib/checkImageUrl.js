"use strict";

/*
 * checkImageUrl.js
 *
 * Checks to see if a given URL is a reasonably valid image based on a) it will actually load, and b) it has a meaningful
 * size.  the given callback is called either with an error, or with an object that contains the dimensions of the object
 * and an indication that it loaded successfully.  In some cases, the image size cannot be determined
 */

var callbackDataBus = new require("callback-data-bus");
var LOGR = require("./../lib/logr.js");
var url = require("url");
var sizeOf = require("image-size");
var http = require("http");
var https = require("https");
var imageType = require("image-type");

var IMAGE_CHECKER_TIMEOUT = 5000; // 5 second timeout when trying to validate images

function init(info, warn, error, debug) {
  LOGR.init(info, warn, error, debug);
}

/*
 * checkImageUrl
 *
 * Check to see if the image is valid (will load).  If it is valid, returns an object with the dimensions of the image
 * {width: <int>, height: <int>} if the filetype is supported.  If not, it will set loaded: true in the object if it
 * loads successfully
 *
 * Note, if your image URL is path-relative, then use resolveRelativeUrl to convert it to a fully qualified url based on the
 * source document and the relative url
 *
 * While this was create to test image files, if a non supported extension is used (e.g. "css") it will still work fine since
 * in these cases if file validation is enacted, it will only check for existence of the file (not the contents)
 */

function checkImageUrl(imgUrl, ciCallback) {
  // Kingston Duffie: if imgUrl is not a valid URL, skip it
  console.log("BestImage.checkImageUrl", imgUrl);
  try {
    new url.URL(imgUrl);
  } catch (err) {
    console.error("BestImage.checkImageUrl: invalid", imgUrl, err);
    return;
  }
  if (/^https?\:\/\/\w\S+\.\S+$/i.test(imgUrl)) {
    // check if data is cached by registering interest in the key, if data is available
    // the callback will be invoked with the cached data
    if (!callbackDataBus.registerFetch(imgUrl, ciCallback)) {
      // if no data is pending, fetch the data and submit it back to the dataBus
      // which will call the callback provided in the registration
      _checkImageUrl(imgUrl, function (err, data) {
        callbackDataBus.completeFetch(imgUrl, err, data, 10000);
      });
    }
  }
}

function _checkImageUrl(imgUrl, ciCallback) {

  LOGR.debug("Registred callback array for: " + imgUrl);

  LOGR.debug("Checking Image: " + imgUrl);
  // Note, if this is a data object (SVG image) then we accept it as it is
  if (imgUrl.indexOf("data:") === 0) {
    ciCallback(null, { loaded: true, width: 200, height: 100 });
    return;
  }

  // for testing, we don't actually get the image, we provide faux success
  if (process.env.NODE_ENV === "test") {
    if (imgUrl === "testnull.jpg") {
      ciCallback("Testing Error", null);
    } else {
      ciCallback(null, { loaded: true, width: 200, height: 100 });  // for testing, return a size
    }
    return;
  }

  getImageSize(imgUrl, function (err, dimensions) {
    // only valid image files will return valid dimensions
    if (err || !dimensions) {
      LOGR.debug("Not a valid image: " + imgUrl + " - " + err);
      ciCallback(err, null);
    } else {
      LOGR.debug("Image Passed Validation: " + imgUrl);
      LOGR.debug(dimensions);
      ciCallback(err, dimensions);
    }
  });
}


/*
 * extensionSupportedForSizing
 *
 * returns an object with the extension, and boolean flag indicating if it is supported
 */
function extensionSupportedForSizing(imgUrl) {

  var urlObj = url.parse(imgUrl);
  var ext;

  // if not a supported filetype by sizeOf library, then just check for existence
  // https://www.npmjs.com/package/image-size
  if (urlObj.pathname) {
    var supportedExtensions = ["gif", "jpg", "jpeg", "bmp", "png", "psd", "tiff", "webp", "svg"];
    ext = urlObj.pathname.slice(urlObj.pathname.lastIndexOf(".") + 1).toLowerCase();
    return ({ ext: ext, supported: supportedExtensions.indexOf(ext) >= 0 });
  }
  return { ext: "", supported: false };
}

/*
 * getImageSize
 *
 * gets the native size of the image provided in the URL
 * Does this WITHOUT actually reading the entire image, but rather reads "chunks" of the image
 * and tests on each read to see if the header is enough to provide image dimensions
 * Once it has enough and can return the size, it aborts the get.  
 *
 * While this was create to test image files, if a non supported extension is used (e.g. "css") it will still work fine since
 * in these cases if file validation is enacted, it will only check for existence of the file (not the contents)
 */

var callCount = 1;  // global for creating unique keys

function getImageSize(imgUrl, cb) {

  try {
    new url.URL(imgUrl);
  } catch (err) {
    console.error("BestImage.getImageSize: invalid", imgUrl, err);
    cb("Invalid image url: " + imgUrl, null);
    return;
  }

  var options = url.parse(imgUrl);
  var r, transport;
  var extObj = extensionSupportedForSizing(imgUrl);
  var existenceOnly = !extObj.supported;

  // key tracking is used to handle a bug in http, see comments below this function
  var thisKey = imgUrl + "[" + callCount++ + "]";
  enterKey(thisKey);

  if (options.protocol === "http:") {
    transport = http;
  } else if (options.protocol === "https:") {
    transport = https;
  } else {
    if (exitKey(thisKey, "Bad Protocol")) {
      cb("Bad Protocol", null);
      return;
    }
  }

  // make the call to retrieve the image/object
  console.log("BestImage.getImageSize", JSON.stringify(options));
  r = transport.get(options, function (response) {

    updateKey(thisKey, "transporting");
    var chunks = [];

    // DATA=========
    response.on("data", function (chunk) {
      chunks.push(chunk);
      var buffer = Buffer.concat(chunks);
      // if the size can be determined by this chunk, will trigger an "end" message
      // and we process in the "end" block below.  If size cannot be determined, continues to 
      // read chuncks until size is determinable, or EOF reached, all end up at "end"
      processData(response, thisKey, buffer);

      // END=========
    }).on("end", function () {
      var buffer = Buffer.concat(chunks);
      var options = {
        existenceOnly: existenceOnly,
        thisKey: thisKey,
        ext: extObj.ext
      };

      // try and get the size from the chunks, callback with results or error
      processFileEnd(response, buffer, options, cb);

      // ERROR=========
    }).on("error", function (e) {  // read error
      updateKey(thisKey, "on error: " + e);
      // ignore the "finished" case (not sure why sometimes that comes in as an error)
      if (e !== "finished") {
        if (exitKey(thisKey, "finished - could not open file? - on.error")) {
          cb("Could not open file", null);
        }
      }
    });
    //-----------------------------------------
    // error on establishing initial connection
  }).on("error", function (e) {
    if (e !== "finished") {
      LOGR.error("ERROR CALLING HTTP: " + imgUrl + "\n" + e);
      if (exitKey(thisKey, "error calling http - " + e)) {
        cb(e, null);
      }
    }
  });

  // this is a timeout to abort processing if things got stuck (see notes below on http bug)
  r.setTimeout(IMAGE_CHECKER_TIMEOUT, function () {
    // handle timeout here
    r.abort();
    if (exitKey(thisKey, "Timeout Reached... abort")) {
      cb("Timeout", null);
    }
  });

  updateKey(thisKey, "launched transport");
}

/*
 * processData
 *
 * process each chunk of the image file as it is read
 */
function processData(response, thisKey, buffer) {
  updateKey(thisKey, "got a chunk");
  // once enough data has been read, exit	
  try {
    updateKey(thisKey, "size calculated, ending file read");
    var check = sizeOf(buffer);  // throw exception?
    response.destroy("finished"); // this will trigger an "end" message
    return;
  } catch (e) {  // exception thrown, not enough data?
    updateKey(thisKey, "size calculate failed, continue reading");
    return;
  }
}

/*
 * processFileEnd
 *
 * based on bits in the buffer, try to determine the image size and handle exceptions
 */
function processFileEnd(response, buffer, opts, cb) {

  var ret = null;

  try {
    if (opts.existenceOnly) {
      // check to see if the buffer is a valid file type (jpg, png, gif, webp, tif, bmp, jxr, psd)
      var itype = imageType(buffer);
      if (itype) {
        ret = { loaded: true, height: null, width: null, msg: "existenceOnly", itype: itype };
      } else {
        // we were checking for existence only (not a supported type for imageSize library)
        // but we do want to verify that it is an image file, if not, we just bail
        exitKey(opts.thisKey, "could not verify the image type");
        cb("bad image type", null);
        return;
      }
    } else {
      ret = sizeOf(buffer);
    }
  } catch (e) {
    if (exitKey(opts.thisKey, "Error Calculating Image Size")) {
      ret = { loaded: true, height: 10, width: 10, err: "loadednocalc" };
      cb(null, ret);
    }
    return;
  }
  // last error case, sizeOf interpreted bits as an SVG file (or other type) when it was not
  if (ret.type && opts.ext && (ret.type !== opts.ext) && (ret.type !== "jpg")) {
    if (exitKey(opts.thisKey, "type mismatch")) {
      cb("type mismatch: " + ret.type, null);
    }
    return;
  }

  // callback with return object
  if (exitKey(opts.thisKey, "finished correctly")) {
    cb(null, ret);
  }
}


/*===============================================================================================================================
 * This is a HACK that is required due to documented inconsistent behavior from http.get.  the issue is that if I either
 * abort the process, or response.delete(), the resulting messages are inconsistent, leading to errors with callbacks (either
 * calling the callback twice, or not calling it at all).  I put a safeguard in place that assures that no calback will be called
 * more than once, and also used this key tracking system to identify the issue
 *
 * https://github.com/nodejs/node/issues/4233
 */

// global store for keys currently being processed
var keyStore = {};
// start processing for this key, throws an exception if the key already exists
function enterKey(key) {
  if (key in keyStore) {
    throw "duplicate key in keystore: " + key;
  }
  keyStore[key] = "enter";
}
// update this key for debugging purposes
function updateKey(key, status) {
  if (key in keyStore) {
    keyStore[key] = status;
  } else {
    throw "updating a non existent key:" + key;
  }
}
// exit the key, a ONE time operation (usually now you call your callback).  Returns FALSE if
// the key is NOT FOUND, meaning this was already called (and likely a callback already invoked)
function exitKey(key, status) {
  if (key in keyStore) {
    delete keyStore[key];
    return true;
  } else {
    return false; // indicates that key does not exist
    //throw "exiting a non-existent key thread: " + key;
  }
}

// debugging tool to see current state of keyStore, should always resolve to an empty object
//setInterval(function() {console.log(keyStore);}, 5000);
//===============================================================================================================================


/*
 * resolveRelativeUrl
 *
 * given a source document, and a relative url, will resolve the url to a fully qualified url
 * Note: will do a quick existence check to test for a special case where mod-rewrite will
 * change pathnames based on user agent (emperical observation)
 *
 * If you pass callback as null or undefined, this will operate syncronously and return
 * the modified URL, however it will not do the check for mod rewrite rules
 *
 */
function resolveRelativeUrl(sourceUrl, imageUrl, callback) {

  var imgUrlData = url.parse(imageUrl);
  var urlData = url.parse(sourceUrl);
  var newImg = imageUrl.trim();

  newImg = url.resolve(sourceUrl, imageUrl);
  LOGR.debug("CLEANURL: " + newImg + " - " + sourceUrl);

  // Don't understand, but a site whose base url is http://www.northstarperformance.com/sgstuds.php
  // and image url is "image.jpg" (no preceding slash).  URL resolves it to http://www.northstarperformance.com/sgstuds.php/image.jpg
  // which fails, although that is the prescription provided by URL resolution rules
  // I am still researching, but this says if the image does not load, try and
  // resolve it as if it had a preceding slash
  if (newImg && callback && process.env.NODE_ENV !== "test") {
    checkImageUrl(newImg, function (err, dimensions) {
      if (err) {
        newImg = urlData.protocol + "//" + urlData.hostname + "/" + imgUrlData.pathname;
        LOGR.debug("URL LOOKUP FAILED, changing to:" + newImg);
      }
      callback(null, newImg);
    });
    return;
  }

  if (callback) {
    callback(null, newImg);
  } else {
    return newImg;
  }
}

/*
 * resolveInitialSlash
 *
 * resolve when the src starts with an initial slash
 */
function resolvePathRelative(urlData, imgUrlData) {
  if (imgUrlData.pathname.charAt(1) === "/") {
    return (urlData.protocol + "//" + imgUrlData.path.slice(2) + (imgUrlData.hash || ""));
  } else {
    if (imgUrlData.path.slice(0, 3) === "../") {
      imgUrlData.path = "/" + imgUrlData.pathname;
    }
    return (urlData.protocol + "//" + urlData.hostname + imgUrlData.path + (imgUrlData.hash || ""));
  }
}

module.exports.init = init;
module.exports.checkImageUrl = checkImageUrl;
module.exports.extensionSupportedForSizing = extensionSupportedForSizing;
module.exports.resolveRelativeUrl = resolveRelativeUrl;
