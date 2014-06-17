
var path = require("path");
var bacon = require("bacon-templates");
var url = require("url");
var folderContext = require("./folder-context.js").folderContext;
var Index = require("./index.js").Index;

exports.express = function express(contentFolder) {   
    var contentFolder = path.resolve(contentFolder); 
    var folderCtx = folderContext(contentFolder);
    var index = new Index(folderCtx);

    return function (req, res, next) {
		if (!req._parsedUrl) {
		    req._parsedUrl = url.parse(req.url);
		}

		var pathname = req._parsedUrl.pathname;
		if (pathname.match(/^admin(\/.*)$/)) {
		    next();
		    return;
	    }	

		index.init(function (err) {
			if (err) {
				next(err);
			} else {
				next();
			}
		});
    }; 
};
