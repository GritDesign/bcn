
/**
 * Module dependencies.
 */

var express = require("express");
var http = require("http");
var path = require("path");
var downloadProxy = require("../download-proxy.js");
var tilde = require('tilde-expansion');

var app = express();
var bodyParser = require("body-parser");
var morgan  = require("morgan");
var errorhandler = require("errorhandler");

exports.run = function (args) {
    var public  = path.join(__dirname, 'public');
    var cmsDir = args["cms-dir"] || ".";

    tilde(cmsDir, function(cmsDir) {
	cmsDir = path.resolve(cmsDir);

	var bcn = require("../bcn.js").bcn(cmsDir);
	var bcnAdmin = require("../admin/admin.js").admin(cmsDir);
	var webroot = path.join(cmsDir, "webroot");

	app.set('port', process.env.PORT || 3000);

	app.use(bodyParser.urlencoded({
	      extended: true
	}));
	app.use("/admin", bcnAdmin);
	app.use(require('less-middleware')(webroot));
	app.use(bcn.express());

	if (args.origin) {
	    var proxy = downloadProxy.proxy(args.origin, webroot);
	    app.use(proxy);
	}

	app.use(errorhandler());

	http.createServer(app).listen(app.get('port'), function(){
	  console.log("Express server listening on port " + app.get('port'));
	});
    });
};

