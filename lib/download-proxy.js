
var request = require("request");
var mkdirp = require("mkdirp");
var path = require("path");
var url = require("url");
var fs = require("fs");
var temp = require("temp");
var mkdirp = require("mkdirp");

exports.proxy = function(origin, webroot) {
	var parsedOrigin = url.parse(origin);

	webroot = path.resolve(webroot);

	return function(req, res, next) {
		var parsedUrl = url.parse(req.url);
		parsedUrl.host = parsedOrigin.host;
		parsedUrl.port = parsedOrigin.port;
		parsedUrl.protocol = parsedOrigin.protocol;

		var requestUrl = url.format(parsedUrl);

		var remoteFile = request(requestUrl);
    	req.pipe(remoteFile);

    	var tempPath = temp.path();

    	var localFile = fs.createWriteStream(tempPath);
    	remoteFile.pipe(localFile);
		//console.log(req.url);

		localFile.on("finish", function () {
			var localReader = fs.createReadStream(tempPath);
    		localReader.pipe(res);

    		res.on("finish", function () {
    			var filePath = path.join(webroot, parsedUrl.pathname);
    			var dirname = path.dirname(filePath);
    			mkdirp(dirname, function (err) {
    				if (err) {
    					cleanup(function() {
    						next(err);
    					});
    					return;
    				}
    				fs.rename(tempPath, filePath, function (err) {
    					if (err) {
    						cleanup();
    						return;
    					}
    					console.log("added: " + filePath);
    				});
    			});
    		});
		});

		remoteFile.on("error", function (err) {
			next();
			cleanup(function () {
				next();
			});
		});

		function cleanup(cb) {
			fs.unlink(tempPath, function () {
				if (cb) {
					cb();
				}
			});
		}
	};
};
