BestImage
=========

![alt text](http://i68.tinypic.com/bjhcnt.jpg "Best Image")

An very specific-purpose library which will find the "best image" to represent a given web page by URL.  

**BestImage** has a simple interface for simply retrieving the "best image" given a URL, and a "query",
which is a string which represents the kind of information one might be seeking on this particular page.  
The quality of the result returned will be dependent on the construction of the destination web site.  If
the webmaster, for example, tries to highlight directly the relevant image using meta tags (og, twitter, etc.)
Then this will be preferred, otherwise a scoring algorithm is used based on characteristics learned on what
makes for a good image, including matching to the provided query, and title of the document.

**BestImage** also provides a way for you to do your own scoring by either modifying the scores provided by BestImage,
or by overriding them fully with your own scoring algorithm.  You can also use the API's to retrieve the full list
of images retrieved from the document by extracting them from the scoring list callback.


#API

##init

You may optionally call the init function to specify your own loggers. By default, warn and error route to console.log, and 
info and error route to no action.  Your logger should accept a string as a paramater, the string to be logged.

*Usage:*
```
BestImage.init(info, warn, error, debug);

```

###getBestImage

Returns the src tag (to be used in an <img> tag, or as a paramater to url() in a background-image css tag) of the best image
found on the given document URL.  Returns null and an error if not image was found.

Note, this is an asyncronous call, and can take a material amount of time depending on the speed of the site being crawled.

*Usage:*
```
BestImage.getBestImage(documentUrl, query, function(err, imgSrc) {});

```

###getBestImageAlt

Same as getBestImage, except it accepts another paramater, scoreFn, which is your own scoring function which is invoked
after bestImage does it's scoring.  Note, bestImage has not yet validated/checked for the loadability of the image.  After 
images are scored, only the top images (currently, set to 5 candidates) will be tested for loadability and size.  If either of
these fail, the images will be removed from contention.



About the Scoring Function (scoreFn) which can be passed to getBestAltImage

provide a callback to post-adjust the default scoring algorithm for an array of image objects.  If specified, this
callback by default will be called after bestImage has completed it's scoring.  The scores for all objects
will be between 0 and 1, with the highest scoring item always being at 1.  

The array of objects will be as follows:

```
 { src: image src tag from document
   title: optional title (alt text) for image
   class: class name of image tag
   isMeta: image was specified in meta tags (curated)
   docTitle: title of source document and/or query used to generate it
   score: <the calculated score>
 }
```
If you pass in replace=true, then the default scoring algorithm is bypassed, and all scores will be set
to 0.

Your callback should be of the form:

```
function(imgArray) {

    // do your processing
    imgArray.forEach(function(item)) {
    item.score = myScore(item);   // array is altered in place
    }
 }
 ```

*Usage:*
```
BestImage.getBestImageAlt(documentUrl, query, function(imgArray){}, function(err, imgSrc) {});

```

###getBestImageFromDocument

Same as getBestImage except it does not retrieve the document via HTTP, but rather uses the HTML document passed in.  the fullUrl paramater
is simply used for logging.

Returns the src tag (to be used in an <img> tag, or as a paramater to url() in a background-image css tag) of the best image
found on the given document.  Returns null and an error if not image was found.

Note, this is an asyncronous call, and can take a material amount of time depending on the speed of the site being crawled.

*Usage:*
```
BestImage.getBestImageFromDocument(htmlDocument, query, function(err, imgSrc) {});

```

## Installation

  npm install best-image

## Tests

Tests are located in best-image_test.js.  You will need mocha installed, and set the node environment to "test".  
Run the tests from the shell with

```
NODE_ENV='test' mocha test/best-image_test.js --reporter spec
```

## License

The MIT License (MIT)

Copyright (c) 2016, IAC Publishing Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.



