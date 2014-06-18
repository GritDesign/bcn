
var path = require("path");
var render = require("bacon-templates").render;
var url = require("url");
var folderContext = require("./folder-context.js").folderContext;
var Index = require("./index.js").Index;
var EventEmitter = require("events").EventEmitter;
var util = require("util");
var TypeProxy = require("./type-proxy.js").TypeProxy;
var fs = require("fs");

function Bcn(contentFolder) {
	this._contentFolder = contentFolder;
	this._folderCtx = folderContext(contentFolder);
	this._index = new Index(this._folderCtx);
}

util.inherits(Bcn, EventEmitter);

Bcn.prototype.express = function express() {   
    var self = this;

    function express(req, res, next) {
		if (!req._parsedUrl) {
		    req._parsedUrl = url.parse(req.url);
		}

		var pathname = req._parsedUrl.pathname;
		if (pathname.match(/^admin(\/.*)$/)) {
		    next();
		    return;
	    }

		self._index.init(function (err) {
			if (err) {
				next(err);
			} else {
				handleStatic();
			}
		});

		function handleStatic() {
			var filePath = "webroot" + pathname;
			self._index.get(filePath, function (err, fileDef) {
				if (err) {
					next(err);
					return;
				}

				if (fileDef) {
					var fullPath = path.join(self._contentFolder, filePath);
					res.sendfile(fullPath);
					return;
				} else {
					handlePageUrl();
				}
			});
		}

		function handlePageUrl() {
			self._index.selectType("page", function (err, results) {
				for (var i=0; i<results.length; i++) {
					var result = results[i];
					if (result.value.url && result.value.url === pathname) {
						renderPage(result);
						return;
					}
				}
				next();
			});
		}

		function renderPage(page) {
			var proxy = new TypeProxy(self._index, page.key, page.value);
			var templatesPath = path.join(self._contentFolder, "templates");

			var renderOptions = {
				getTemplate: function (templateName, cb) {
					var templatePath = path.join("templates", templateName);

					self._index.get(templatePath, function (err, fileDef) {
						if (err) {
							next(err);
							return;
						}
						var templateFullPath = path.join(self._contentFolder, templatePath);
						fs.readFile(templateFullPath, function (err, buff) {
							if (err) {
								cb(err);
								return;
							}

							var str = buff.toString("utf8");
							if (err) {
								cb(new Error("could not find template " + templateName));
								return;
							}

							cb(null, str);
						});
					});

					
				},
				templateRoot: templatesPath
			};

			var options = {};
			proxy.get("template", function (err, value) {
				render(value, options, renderOptions, function (err, str) {
					if (err) {
						next(err);
					} else {
						res.send(str);
					}
				});
			});
		}
     };

    return express;
 }

 Bcn.prototype.register = function (mod, priority) {
	if (typeof priority == "undefined") {
		priority = 0;
	}

	bcn._modules.push({mod: mod,
		priority: priority,
		moduleIndex: bcn._modules.length
	});

	bcn._modules.sort(function (a, b) {
		if (a.priority > b.priority) {
			return -1;
		} else if (a.priority < b.priority) {
			return 1;
		} else {
			if (a.moduleIndex < b.moduleIndex) {
				return -1;
			} else if (a.moduleIndex > b.moduleIndex) {
				return 1;
			} else {
				return 0;
			}
		}
	});

	if (typeof module.init === "function") {
		mod.init(bcn);
	}
};

exports.bcn = function (contentFolder) {
	return new Bcn(contentFolder);
};
