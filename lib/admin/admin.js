
var express = require("express");
var path = require("path");
var bcn = require("../bcn.js")
	.bcn(path.join(__dirname, "cms"));

exports.admin = function(cmsRoot) {
	var router = express.Router();

	var contentBcn = require("../bcn.js")
		.bcn(cmsRoot); 

	function $cms(search, cb) {
	  	if (search && search[0] === "/") {
	  		search = search.slice(1);
	  	}

	  	if (search.match(/\*/)) {
	  		cb(null, contentBcn.select(search));
	  	} else {
	  		contentBcn.get(search, cb);
	  	}
	};

	function getType(typeName, currentType, cb) {
		if (typeName === "string") {
			cb(null);
			return;
		}

		if (currentType && currentType.innerTypes) {
			for (var i=0; i<currentType.innerTypes.length; i++) {
				var innerType = currentType.innerTypes[i];

				if (innerType.name === typeName) {
					cb(null, innerType);
					return;
				}
			}
		}

		contentBcn.get("content/types/" + typeName + "_type.json", function (err, typeObj) {
			cb(err, fieldJSON(typeObj));
		});
	};

	var jsonRegex = /^\/content\/.*\.json$/;

	router.use(function(req, res, next) {
	  res.locals["$cms"] = $cms;

	  if (jsonRegex.exec(req.url)) {

	  	var type = typeName(req.url);

	  	contentBcn.get("content/types/" + type + "_type.json", function (err, typeObj) {
	  		$cms(req.url, function(err, obj) {
	  			res.locals["$type"] = fieldJSON(typeObj);
	  			res.locals["$obj"] = fieldJSON(obj);
	  			res.locals["getType"] = getType;


	  			bcn.render(req, res, next, {
					key: "types/" + req.params.type + "_type.json",
					template: "type-edit.html",
					value: {
						url: req.url
					}
				});
	  		});
	  		
	  	});
	  } else {
	  	next();
	  }
	});

	router.use(bcn.express());

	return router;
};

function fieldJSON(f) {
	if (!f) {
		return;
	}

	try {
		return JSON.parse(f.json);
	} catch (e) {
		return;
	}
}

function typeName(fileName) {
	var typeRegex = /_?([a-zA-Z][a-zA-Z0-9-]+)\.json$/
	var matches = fileName.match(typeRegex);

	if (matches) {
		return matches[1];
	} else {
		return "";
	}
}
