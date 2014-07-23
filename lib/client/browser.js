
var render = require("bacon-templates").render;
var path = require("path");
var cheerio = require("cheerio");

BCN = {
	"render": renderTemplate
};

var cachedRequests = {};
var templateModules = {};

function cachedGet(p, cb) {
	function handler() {
		if (xhr.readyState === 4 /* complete */) {
			if (xhr.status === 200) {
				cachedRequests[p] = xhr.responseText;
				cb(null, cachedRequests[p]);
				return;
			} else {
				cb(new Error("Could not load " + p));
				return;
			}
		}
	}

	var xhr = new XMLHttpRequest();
	xhr.open("GET", p, true);
	xhr.onreadystatechange = handler;
	xhr.send();
}

function renderTemplate(templateName, key, data, cb) {
	var renderOptions = {
		getTemplate: function (templateName, cb) {
			if (!templateName) {
				cb(new Error("Invalid template name"));
				return;
			}

			cachedGet("/api/templates/" + templateName, cb);
		},
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

	var getter = {
		"get": function (key, cb) {

			console.log(key);
			cb();
			return;

			/*
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

			*/

			/*
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
			*/
		}
	};

	console.log("rendering");
	render(templateName, getter, renderOptions, function (err, str) {
		cb(err, str);
	});
};
