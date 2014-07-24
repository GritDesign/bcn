var path = require("path");
var render = require("bacon-templates").render;
var url = require("url");
var Index = require("./index.js").Index;
var EventEmitter = require("events").EventEmitter;
var util = require("util");
var TypeProxy = require("./type-proxy.js").TypeProxy;
var fs = require("fs");
var cheerio = require("cheerio");
var vm = require("vm");
var fad = require("fad");
var async = require("async");
var BcnFilter = require("bcn-filter").BcnFilter;
var express = require("express");

var cache = {};

function Bcn(contentFolder) {
	this._contentFolder = contentFolder;
	this._index = new Index(contentFolder);
	this._modules = [];
}

util.inherits(Bcn, EventEmitter);

Bcn.prototype.express = function express() { 
    var self = this;

    var router = require("express").Router();
    var api = require("./api/api.js").api(this);

    router.use("/api", api);

    function express(req, res, next) {
		if (!req._parsedUrl) {
		    req._parsedUrl = url.parse(req.url);
		}

		var pathname = req._parsedUrl.pathname;
		if (pathname.match(/^admin(\/.*)$/)) {
		    next();
		    return;
	    }

	    if (pathname.match(/^api\/(.*)$/)) {
	    	api(req, res, next);
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
						self.render(req, res, next, result);
						return;
					}
				}
				next();
			});
		}
    };

    router.use(express);

    return router;
 }

 Bcn.prototype.getRoot = function () {
 	var self = this;

 	var root = {
		get: function (path, cb) {
			self._index.get(path, function (err, data) {
				if (err) {
					cb(err);
					return;
				}

				if (data && data.json) {
					var json;
					try {
						json = JSON.parse(data.json);
					} catch (e) {
						cb(new Error("Error parsing " + path +
						 "\n" + e.message));
					}
					
					cb(null, json);
				} else {
					cb(null);
				}
			});
		}
	};

	return root;
 }

 Bcn.prototype.render = function (req, res, next, options) {
 	var self = this;
	// options has, key, value, template

	// determine the mount point
	var prefix = "";

	var ctx = fad.create({
		urls: req.url,
		JSON: JSON,
		Object: Object
	});

	if (req.originalUrl !== req.url) {
		var lastSlash = req.originalUrl.lastIndexOf(req.url);
		if (!lastSlash) {
			lastSlash = req.originalUrl.length;
		}

 		prefix = req.originalUrl.substr(0, lastSlash);
	}

	var templateModules = {};
	var templateModulesUsed = [];
	var root = self.getRoot();

	var proxy = new TypeProxy(root, options.key, options.value);
	var templatesPath = path.join(self._contentFolder, "templates");

	var renderOptions = {
		getTemplate: function (templateName, cb) {
			if (!templateName) {
				cb(new Error("Invalid template name"));
				return;
			}

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

					var templateCodeFullPath = templateFullPath.replace(/\.html$/, ".js");
					fs.readFile(templateCodeFullPath, function (err, jsBuff) {
						if (err) {
							done();
							return;
						}

						var jsString = jsBuff.toString("utf8");
						var ctx = {
							console: console,
							Math: Math
						};
						try {
							vm.runInNewContext(jsString, ctx, templateCodeFullPath);
						} catch (e) {
							cb(new Error("Error in template code file " + templateCodeFullPath + "\n" + e.message, templateCodeFullPath));
							return;
						}
						templateModules[templateName] = ctx;

						done();
					});

					function done() {
						var str = buff.toString("utf8");
						if (err) {
							cb(new Error("could not find template " + templateName));
							return;
						}

						cb(null, str);
					}
				});
			});
		},
		templateRoot: templatesPath,
		templateOutputFilter: function (templateName, html, resolve, cb) {
			var $;
			var hasRenderCb = false;

			function onRenderCb(err) {
				if (err) {
					cb(err);
					return;
				}
				setImmediate(function () {
					cb(null, $.html());
				});
			}

			function resolveValue(key, cb) {
				if (key === "$" ) {
					cb(null, $);
					return;
				}

				if (key === "cb") {
					hasRenderCb = true;
					cb(null, onRenderCb);
					return;
				}

				resolve(key, cb);
			}

			var mod = templateModules[templateName];
			if (mod) {
				templateModulesUsed.push(mod);
				if (typeof mod.onRender == "function") {
					$ = cheerio.load(html, {normalizeWhitespace: false});

					var sig = signature(mod.onRender);

					async.map(sig.args, resolveValue, function(err, args) {
						if (err) {
							cb(err);
							functionReturned = true;
							return;
						}

						try {
							mod.onRender.apply(html, args);
						} catch (e) {
							cb(e);
							return;
						}

						html = $.html();

						if (!hasRenderCb) {
							setImmediate(function () {
								cb(null, html);
							});
						}
					});

					return;
				} 
			}

			return html;
			
		}
	};

	function load(key, cb) {
		root.get(key, function (err, value) {
			if (err) {
				cb(err);
				return;
			}

			if (util.isArray(value)) {
				cb(null, value);
			} else {
				var proxy = new TypeProxy(root, key, value);
				cb(null, proxy);
			}
		});
	};

	function resolve(obj, cb) {
		if (typeof obj.resolve === "function") {
			obj.resolve(cb);
		} else {
			cb(null, undefined);
		}
	}

	function getType(obj, cb) {
		if (obj instanceof TypeProxy) {
			obj._getType(cb);
			return;
		}

		cb(null, typeof obj);
	}

	var getter = {
		"get": function (key, cb) {
			if (key === "load") {
				cb(null, load);
				return;
			}

			if (key === "resolve") {
				cb(null, resolve);
				return;
			}

			if (key === "typeOf") {
				cb(null, getType);
				return;
			}

			if (key === "$top") {
				//proxy.resolve(cb);
				cb(null, proxy);
				return;
			}
			
			if (typeof res.locals[key] !== "undefined") {
				cb(null, res.locals[key]);
				return;
			}

			proxy.get(key, function (err, value) {
				if (err) {
					cb(err);
					return;
				}

				if (typeof value === "undefined") {
					if (key === "global") {
						cb(null, ctx);
						return;
					}

					ctx.get(key, cb);
					return;
				}

				cb(null, value);
			});
		}
	};

	if (typeof options.template !== "undefined") {
		gotTemplate(null, options.template);
	} else {
		proxy.get("template", gotTemplate);
	}

	function gotTemplate(err, value) {
		if (err) {
			next(err);
			return;
		}

		render(value, getter, renderOptions, function (err, str) {
			if (err) {
				next(err);
			} else {
				// add prefix to absolute hrefs and src urls in the template
				if (prefix !== "/" || templateModulesUsed.length > 0) {
					var $ = cheerio.load(str, {normalizeWhitespace: false});
					
					var done = false;
					templateModulesUsed.forEach(function (mod) {
						if (!done && typeof mod.onPageRender == "function") {
							try {
								mod.onPageRender($);
							} catch (e) {
								done = true;
								next(e);
								return;
							}
						}
					});

					if (done) {
						return;
					}

					$("*[href]").each(function () {
						var $this = $(this);
						var href = $this.attr("href");
						if (href.match(/^\//)) {
							$this.attr("href", href.replace(/^\//, prefix + "/"));
						}
					});

					$("*[src]").each(function () {
						var $this = $(this);
						var src = $this.attr("src");
						if (src.match(/^\//)) {
							$this.attr("src", src.replace(/^\//, prefix + "/"));
						}
					});

					str = $.html();
				}
				res.send(str);
			}
		});
	}
 }

 Bcn.prototype.register = function (mod, priority) {
	if (typeof priority == "undefined") {
		priority = 0;
	}

	this._modules.push({mod: mod,
		priority: priority,
		moduleIndex: bcn._modules.length
	});

	this._modules.sort(function (a, b) {
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

Bcn.prototype.select = function select(query) {
	var self = this;
	var root = self.getRoot();

	var fileSelect = self._index.selectFiles(query);
	return new BcnFilter(fileSelect, function (key, value) {
	    // type defaults begin with underscore and are not selectable 
	    if (path.basename(key).match(/^_/)) { 
	        return null;
	    }
		if (value.json_valid) {
			try {
				var result = JSON.parse(value.json);
				return [key, new TypeProxy(root, key, result)];
			} catch (e) {
				return null;
			}
		} else {
			return null;
		}
	});
};

Bcn.prototype.get = function get(path, cb) {
	return this._index.get(path, cb);
};

/*
function parameter name extraction from stackoverflow:
http://stackoverflow.com/questions/1007981/
how-to-get-function-parameter-names-values-dynamically-from-javascript
*/
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var NAME_MATCH = /function\s+([^\(\s]+)/;

function signature(func) {
	var stripped = func.toString().replace(STRIP_COMMENTS, "");
	var args = stripped
		.slice(stripped.indexOf("(") + 1, stripped.indexOf(")"))
		.match(/([^\s,]+)/g);

	if (!args) {
		args = [];
	}

	var nameMatches = NAME_MATCH.exec(stripped);
	var name = nameMatches ? nameMatches[1] : null;

	return {
		name: name,
		args: args
	};
}

exports.bcn = function (contentFolder, ctx) {
	if (!cache[contentFolder]) {
		cache[contentFolder] = new Bcn(contentFolder, ctx);
	}

	return cache[contentFolder];
};
