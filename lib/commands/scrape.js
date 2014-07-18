var request = require("request");
var cheerio = require("cheerio");
var async = require("async");
var fs = require("fs");
var mkdirp = require("mkdirp");
var path = require("path");
var url = require("url");
var slug = require("slug");
var beautifyHtml = require('js-beautify').html;

exports.run = function (argv) {

if (argv._.length !== 1) {
    console.log("usage: bcn scrape <cms folder>");
    process.exit();
}

var cmsDir = path.resolve(argv._[0]);

fs.stat(cmsDir, function(err, stat) {
    if (err) {
	console.log("cms folder " + cmsDir + " does not exist.");
	process.exit();
    }

    getScrapeConfig();
});

function getScrapeConfig() {
    var scrapeConfigPath = path.join(cmsDir, "scrape.js");
    var config = require(scrapeConfigPath);

    scrape(config);
}

function getBasePath(prefix, theUrl, postfix) {
    var parsedUrl = url.parse(theUrl);
    if (parsedUrl.path[parsedUrl.path.length - 1] === "/") {
	parsedUrl.path += "index";
    }

    var bits = parsedUrl.path.split("/");
    var newBits = prefix.split("/");
    for (var i=0; i<bits.length; i++) {
	var bit = bits[i];
	if (i === bits.length - 1) { // last bit
	    bit = path.basename(bit, path.extname(bit));
	    newBits.push(slug(bit) + postfix);
	} else if (bit) {
	    newBits.push(slug(bit));
	}
    }

    return newBits.join("/");
}

function getPagePath(theUrl) {
    return getBasePath("content/pages", theUrl, "_page.json");
}
/*
    var parsedUrl = url.parse(theUrl);
    if (parsedUrl.path[parsedUrl.path.length - 1] === "/") {
	parsedUrl.path += "index";
    }
    var bits = parsedUrl.path.split("/");
    var newBits = ["content", "pages"];
    for (var i=0; i<bits.length; i++) {
	var bit = bits[i];
	if (i === bits.length - 1) { // last part is the page
	    newBits.push(slug(bit) + "_page.json");
	} else if (bit) {
	    newBits.push(slug(bit));
	}
    }

    return newBits.join("/");
}
*/
function getTemplatePath(theUrl) {
        return getBasePath("pages", theUrl, ".html");
}
/*
function getTemplatePath(theUrl) {
    var parsedUrl = url.parse(theUrl);
    if (parsedUrl.path[parsedUrl.path.length - 1] === "/") {
	parsedUrl.path += "index";
    }
    var bits = parsedUrl.path.split("/");
    var newBits = ["pages"];
    for (var i=0; i<bits.length; i++) {
	var bit = bits[i];
	if (i === bits.length - 1) { // last part is the page
	    newBits.push(slug(bit) + ".html");
	} else if (bit) {
	    newBits.push(slug(bit));
	}
    }

    return newBits.join("/");
}
*/

var validExtentions = {
    "": true,
    ".html": true,
    ".htm": true,
    ".php": true,
    ".aspx": true,
    ".asp": true,
    ".cfm": true,
    ".do": true,
    ".shtml": true
};

function noFollow(pathName) {
    var ext = path.extname(pathName); 
    return !validExtentions[ext.toLowerCase()];
} 

function scrape(config) {
    var urls = [];
    var scrapedUrls = {};
    var allTemplates = {};
    var allData = {};

    var count = argv.limit;

    var parsedOrigin = url.parse(config.origin);
    urls.push(url.format(parsedOrigin));
    nextUrl();

    function nextUrl() {
	var theUrl = urls.pop();
	var limitReached = argv.limit && count === 0;
	if (!theUrl || limitReached) {
	    done();
	    return;
	}

	count--;

	console.log("getting " + theUrl);
	request(theUrl, function (err, res, body) {
	    if (err) {
		throw err;
	    }

	    scrapedUrls[theUrl] = true;

	    var $ = cheerio.load(body);
	    $("a[href]").each(function() {
		var $this = $(this);

		var absoluteUrl = url.resolve(theUrl, $this.attr("href"));
		var parsedUrl = url.parse(absoluteUrl);
		if (parsedUrl.hostname !== parsedOrigin.hostname && config.hostAliases) {
		    config.hostAliases.forEach(function(alias) {
			if (parsedUrl.hostname === alias) {
			    parsedUrl.hostname = parsedOrigin.hostname;
			}
		    });
		}

		if (parsedUrl.hostname === parsedOrigin.hostname) {
		    delete parsedUrl.host; // force use of hostname property
		    delete parsedUrl.hash;  
		    var newUrl =  url.format(parsedUrl);
		    if (!scrapedUrls[newUrl] &&
			(parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
			!noFollow(newUrl)) {
			urls.push(newUrl);
			scrapedUrls[newUrl] = true;
		    }
		}
	    });

	    var pagePath = getPagePath(theUrl);
	    var templatePath = getTemplatePath(theUrl);
	    var theParsedUrl = url.parse(theUrl);

	    allData[pagePath] = {
		url: theParsedUrl.path,
		template: templatePath
	    };

	    var currentTemplates = {}
	    currentTemplates["layout.html"] = body;
	    extractTemplates("layout.html", currentTemplates, pagePath, templatePath);

	    var templateNames = Object.keys(currentTemplates);
	    templateNames.forEach(function (templateName) {
		if (!allTemplates[templateName]) {
		    allTemplates[templateName] = currentTemplates[templateName]; 
		    return;
		}

		if (allTemplates[templateName] !== currentTemplates[templateName]) {
		    var diff = getDiff(allTemplates[templateName], currentTemplates[templateName]);
		    console.log("WARNING: not all information extracted from " + templateName + "\n" + diff);
		}
	    });

	    setTimeout(function () {
		nextUrl();
	    }, 500);
	});
    }

    function done() {
	    var templateNames = Object.keys(allTemplates);
	    var dataPaths = Object.keys(allData);

	    async.mapSeries(templateNames, saveTemplate, function (err) {
		if (err) {
		    throw err;
		}

		async.mapSeries(dataPaths, saveData, function (err) {
		    if (err) {
			throw err;
		    }

		    console.log("saved " + templateNames.length + " templates and " + dataPaths.length + " data files");
		}); 
	    }); 
    }


    function saveTemplate(templateName, cb) {
	var dirname = path.join(cmsDir, "templates", path.dirname(templateName));
	mkdirp(dirname, function(err) {
	    if (err) {
		cb(err);
		return;
	    }

	    var fileName = path.join(cmsDir, "templates", templateName);
	    fs.writeFile(fileName, allTemplates[templateName], cb);
	});
    }

    function saveData(dataPath, cb) {
	var dirname = path.join(cmsDir, path.dirname(dataPath));
	mkdirp(dirname, function(err) {
	    if (err) {
		cb(err);
		return;
	    }

	    var fileName = path.join(cmsDir, dataPath);
	    fs.writeFile(fileName, JSON.stringify(allData[dataPath], null, 4), cb);
	});
    }

    function extractTemplates(templateName, collect, pagePath, templatePath) {
	var newTemplates = [];
	if (!templateName || !collect) {
	    throw new Error("invalid arguments");
	}

	if (typeof(collect[templateName]) !== "string") {
	    throw new Error("parts must be string, typeof collect[" + JSON.stringify(templateName) + "] !== string");
	}

	var $ = cheerio.load(collect[templateName]);

	config.templates.forEach(function (template) {
	    var $t = $(template.selector);
	    if (typeof collect[template.name] === "undefined" && $t.length) {
		newTemplates.push(template.name);
		collect[template.name] = beautifyHtml($("<div/>").append($t.clone()).html());
		$t.replaceWith("{{tmpl \"" + template.name + "\"}}");
	    }
	});

	config.variables.forEach(function (variable) {
	    var $v = $(variable.selector);
	    if ($v.length) {
		if (variable.contentAttribute) {
		    allData[pagePath][variable.name] = $v.attr(variable.contentAttribute);
		    $v.attr(variable.contentAttribute, "${" + variable.name + "}");
		} else if (variable.isHtml) {
		    allData[pagePath][variable.name] = $v.html(); 
		    $v.html("{{html " + variable.name + "}}");
		} else {
		    allData[pagePath][variable.name] = $v.text(); 
		    $v.text("${" + variable.name + "}");
		}
	    }
	});

	if (templateName == "layout.html") {
	    var $body = $(config.pageBody);
	    collect[templatePath] = "{{layout \"layout.html\"}}\n" + beautifyHtml($("<div/>").append($body.clone()).html());
	    $body.replaceWith("{{html body}}");
	}

	var templateText = $("<div/>").append($.root().clone()).html();
	templateText = templateText.replace(/{{tmpl &quot;([^&]+)&quot;}}/g, "{{tmpl \"$1\"}}");
	collect[templateName] = templateText;

	newTemplates.forEach(function (templateName) {
	    extractTemplates(templateName, collect, pagePath, templatePath);
	});
    }
}

function getDiff(a, b) {
    if (typeof a !== "string" || typeof b !== "string") {
	throw new Error("Invalid arguments, can only diff strings");
    }

    for (var i=0; i<a.length; i++) {
	if (a[i] !== b[i]) {
	    break;
	}
    }

    var da = a.substr(i-10, 30);
    var db = b.substr(i-10, 30);

    return JSON.stringify(da) + " !== " + JSON.stringify(db);
}

};


