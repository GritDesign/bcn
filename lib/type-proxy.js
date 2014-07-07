
function TypeProxy(root, path, data) {
	this._root = root;
	this._defaults = defaultsForPath(path);

	if (typeof data !== "undefined") {
		for (var i=0; i<this._defaults.length; i++) {
			if (this._defaults[i].path === path) {
				this._defaults[i].data = data;
				this._defaults[i].loaded = true;
				break;
			}
		}
	}
}

TypeProxy.prototype.get = function(key, cb) {
	var defaultIndex = 0;
	var self = this;

	function nextDefault() {
		var def = self._defaults[defaultIndex];
		defaultIndex++;

		if (!def) {
			cb(null, undefined);
			return;
		}

		if (def.loaded) {
			checkData();
		} else {
			self._root.get(def.path, function(err, data) {
				if (err) {
					cb(err);
					return;
				}

				def.loaded = true;
				def.data = data;

				checkData();
			});
		}

		function checkData() {
			if (HOP(def.data, key)) {
				var value = def.data[key];

				if (value.ref && value.type) {
					var iteratorObject = {
						"iterator": function() {
							return new SelectWrapper(self._root, self._root.select(value.ref));
						}
					};

		            cb(null, iteratorObject);
		        } else {
		            cb(null, value);
		        }
			} else {
				nextDefault();
			}
		}
	}

	nextDefault();
}

TypeProxy.prototype.resolve = function (cb) {
	var defaultIndex = 0;
	var self = this;
	var obj = undefined;

	function nextDefault() {
		var def = self._defaults[defaultIndex];
		defaultIndex++;

		if (!def) {
			cb(null, obj);
			return;
		}

		if (def.loaded) {
			copyData();
		} else {
			self._root.get(def.path, function(err, data) {
				if (err) {
					cb(err);
					return;
				}

				def.loaded = true;
				def.data = data;

				copyData();
			});
		}

		function copyData() {
			if (!obj) {
				obj = {};
			}

			for (var key in def.data) {
				if (HOP(def.data, key) && !HOP(obj, key)) {
					obj[key] = def.data[key];
				}
			}
			
			nextDefault();
		}
	}

	nextDefault();
}

TypeProxy.prototype.get.async = true;
TypeProxy.prototype.resolve.async = true;

/* SelectWrapper helper class, creates type proxies for iterator data */

function SelectWrapper(root, iterator) {
	this._root = root;
	this._iterator = iterator;
}

SelectWrapper.prototype.on = function(e, cb) {
	var self = this;

	if (e === "data") {
		this._iterator.on("data", function(key, value) {
			cb(new TypeProxy(self._root, key, value));
		});
	} else if (e === "end") {
		this._iterator.on("end", cb);
	}
}

SelectWrapper.prototype.pause = function() {
	this._iterator.pause();
}

SelectWrapper.prototype.resume = function() {
	this._iterator.resume();
}

/* helper functions */

function defaultsForPath(path) {
    var defaults = [{
        path:path,
        loaded: false,
        data: null
    }];

    var type = getTypeName(path);
    if (!type) {
        return defaults;
    }

    var dir = dirName(path);
    var parts = dir.split("/");

    while (parts.length > 0) {
        defaults.push({
            path:parts.join("/") + ("/_" + type + ".json"),
            loaded:false,
            data: null
        });
        parts.pop();
    }

    return defaults;
}

function getTypeName(path) {
    var typeRegex = /_?([a-zA-Z][a-zA-Z0-9-]+)\.json$/
    var matches = typeRegex.exec(path);

    if (matches) {
       return matches[1];
    } else {
       return null;
    }
}

function dirName(path) {
    path = path.replace(/\/$/, "");

    var matches = path.match(/^(.+)(\/[^\/]+\/?)$/);
    if (matches && matches[1]) {
        return matches[1];
    } else {
        return "";
    }
}

function HOP(obj, prop) {
	if (!obj) {
		return false;
	} else {
    	return Object.prototype.hasOwnProperty.call(obj, prop);
	}
}

exports.TypeProxy = TypeProxy;
