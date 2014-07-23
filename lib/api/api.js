var express = require("express");
var path = require("path");
var fs = require("fs");

function api(bcn) {
	var router = express.Router();

	router.get(/^\/templates\/(.*)/, function (req, res, next) {
		var templateName = req.params[0];
		if (templateName.match(/\.\./)) {
			next(new Error("Invalid template path."));
			return;
		}
			
		if (!templateName) {
			next(new Error("Invalid template name"));
			return;
		}

		var templatePath = path.join("templates", templateName);
		bcn._index.get(templatePath, function (err, fileDef) {
			if (err) {
				next(err);
				return;
			}
			var templateFullPath = path.join(bcn._contentFolder, templatePath);
			fs.readFile(templateFullPath, function (err, buff) {
				if (err) {
					next(err);
					return;
				}

				var str = buff.toString("utf8");
				res.send(str);
			});
		});
	});

	return router;
}

exports.api = api;