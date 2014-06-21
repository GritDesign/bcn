
var fad = require("fad");
var BcnFsRoot = require("bcn-fs-root").BcnFsRoot;
var sqlite3 = require("sqlite3");
var path = require("path");
var fs = require("fs");
var util = require("util");
var EventEmitter = require("events").EventEmitter;
var BcnJoin = require("bcn-join").BcnJoin;

function Index(uncheckedFolder) {
	var ctx = fad.create([
		function folder(cb) {
			fs.stat(uncheckedFolder, function(err, stats) {
			    if (err) {
					cb(err);
					return;
				}

			    if (!stats.isDirectory()) {
					cb(new Error("path \"" + uncheckedFolder + "\" is not a directory!"));
					return;
				}

				cb(null, uncheckedFolder);
			});
	    },
	    function bcnDir(folder, cb) {
			var bcnPath = path.join(folder, ".bcn");	
			fs.stat(bcnPath, function(err, stats) {
				if (err) {
					if (err.code === "ENOENT") {
						fs.mkdir(bcnPath, function(err) {
							if (err) {
								cb(err);
							} else {
								cb(null, bcnPath);
							}
						});
					} else {
						cb(err);
					}
					return;
				}

				if (!stats.isDirectory()) {
					cb(new Error("path \"" + bcnPath + "\" is not a directory!"));
					return;
				}

				cb(null, bcnPath);
			});
	    },
		function openDb(bcnDir, cb) {
			var indexDbName = path.join(bcnDir, "index.db");
			var sqliteDb = new sqlite3.Database(indexDbName, function (err) {
				if (err) {
					cb(err);
				} else {
					cb(null, sqliteDb);
				}
			});
		},
		function db(openDb, cb) {
			openDb.exec("PRAGMA case_sensitive_like=ON;");
			openDb.get("select initialized, version from bcn_config", function (err, row) {
				if (err || !row.initialized) {
					// initialize db

					fs.readFile(path.join(__dirname, "sql", "init.sql"), function (err, sql) {
						if (err) {
							cb(err);
							return;
						}
						sql = sql.toString();

						openDb.exec(sql, function (err) {
							if (err) {
								cb(err);
								return;
							}

							cb(null, openDb);
						});
					});
				} else {
					cb(null, openDb);
				}
			});
		}
	]);

	this._ctx = ctx;
	this._initCallbacks = [];
	this._initializing = false;
	this._initialized = false;
	this._refreshCallbacks = [];
	this._refreshing = false;
	this._refreshed = false;
}

Index.prototype.get = function(filePath, cb) {
	var self = this;

	self._ctx.get(function (db, err) {
		if (err) {
			cb(err);
			return;
		}

		var dirname = path.dirname(filePath) + "/";
		var filename = path.basename(filePath);

		db.all("SELECT dirname, filename, json FROM bcn_file WHERE dirname = ? AND filename = ?;",
			dirname, filename, function (err, rows) {
				if (err) {
					cb(err);
					return;
				}

				if (!rows || !rows.length) {
					cb(null, null);
					return;
				}

				if (rows.length === 1) {
					cb(null, rows[0]);
				} else {
					cb(new Error("Get query returned multiple rows."));
				}
		});
	});
};

Index.prototype.selectType = function(typeName, cb) {
	var self = this;

	self._ctx.get(function (db, err) {
		if (err) {
			cb(err);
			return;
		}

		db.all("SELECT dirname, filename, json FROM bcn_file WHERE type = ? AND json_valid=1 ORDER BY dirname, filename;",
			typeName,
			function (err, rows) {
				if (err) {
					cb(err);
					return;
				}

				var result = rows.map(function (e) {
					return {key: path.join(e.dirname, e.filename), value: JSON.parse(e.json)};
				});

				cb(null, result);
		});
	});
};

Index.prototype.init = function (cb) {
	var self = this;

	// uses a transaction for better bulk insert performance
	// need to insure this method is only executing
	// once, due to just having a single db connection

	if (self._initialized) {
		cb(null);
		return;
	}

	self._initCallbacks.push(cb);
	if (self._initializing) {
		return;
	}

	self._initializing = true;

	self._ctx.get(function (db, err) {
		if (err) {
			done(err);
			return;
		}

		db.get("SELECT count(*) as count FROM bcn_file", function (err, row) {
			if (err) {
				done(err);
				return;
			}

			// if there is a count we are already initialized, try refresh
			if (row.count) {
				self._refresh(done);
				return;
			}

			// initial import, do this in a transaction
			db.exec("BEGIN");
			var insertFile = db.prepare("INSERT INTO bcn_file " +
			"(dirname, filename, mtime, size, ext, type, json, json_valid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", function (err) {
				self._ctx.get(function (folder) {
					var root = new BcnFsRoot(folder); 
					
				    //var select = root.select("**", {statsOnly: true});
				    var select = root.select("**");
				    select.on("data", function (key, stat) {
				    	var dirname = path.dirname(key) + "/";
				    	var filename = path.basename(key);
				    	var mtime = stat.mtime.getTime() / 1000;
				    	var size = stat.size;
				    	var ext = path.extname(key);
				    	var type = typeName(key);
				    	var json = "";
				    	var json_valid = 0;

				    	if (ext === ".json") {
				    		select.pause();
				    		fs.readFile(path.join(folder, key), function (err, jsonText) {
				    			if (err) {
				    				json_valid = 0;
				    			} else {
				    				try {
				    					var obj = JSON.parse(jsonText);
				    					json = JSON.stringify(obj);
				    					json_valid = 1;
				    				} catch (e) {
				    					json_valid = 0;
				    				}
				    			}

				    			insertFile.run(dirname, filename, mtime, size,
				    			ext, type, json, json_valid);

				    			select.resume();
				    		});
				    	} else {
				    		insertFile.run(dirname, filename, mtime, size,
				    			ext, type, json, json_valid);
				    	}
				    });

				    select.on("end", function () {
				    	db.exec("UPDATE bcn_config SET initialized=1;");
						db.exec("commit", function (err) {
							done(err);
						});
				    });
				});
			});
		});
	});

	function done(err) {
		var callbacks = self._initCallbacks;
		self._initCallbacks = [];
		self._initializing = false;
		self._initialized = true;

		callbacks.forEach(function (fn) {
			fn(err);
		});
	}
};

Index.prototype._refresh = function (cb) {
	var self = this;

	if (self._refreshed) {
		cb(null);
		return;
	}

	// uses a transaction for better bulk insert performance
	// need to insure this method is only executing
	// once, due to just having a single db connection

	self._refreshCallbacks.push(cb);
	if (self._refreshing) {
		return;
	}

	self._refreshing = true;

	self._ctx.get(function (db, err, folder) {
		if (err) {
			done(err);
			return;
		}

		var fileRoot = new BcnFsRoot(folder); 

		//var select = root.select("**", {statsOnly: true});
		var filesSelect = fileRoot.select("**");
		var indexSelect = self.selectFiles("**");

		var join = new BcnJoin({files: filesSelect, index: indexSelect});
		//var join = filesSelect;
		//var join = indexSelect;
		join.on("data", function (key, value) {
			//join.pause();

			if (!value.index && value.files) {
				console.log("add " + key + " to index");
			} else if (value.index && !value.files) {
				console.log("remove " + key + " from index");
			} else {
				if (value.index.size !== value.files.size ||
					value.index.mtime !== value.files.mtime.getTime() / 1000) {
					console.log("update " + key + " in index");
				} else {

				}
			}

			/*
			setImmediate(function () {
				join.resume();
			});
			*/
		});

		join.on("end", function () {
			done(null);
		});
	});

	function done(err) {
		var callbacks = self._refreshCallbacks;
		self._refreshCallbacks = [];
		self._refreshing = false;
		self._refreshed = true;

		callbacks.forEach(function (fn) {
			fn(err);
		});
	}
};

Index.prototype.selectFiles = function(query) {
	if (query.match(/['"]/)) {
		throw new Error("Invalid query " + query);
	}

	return new SelectWrapper(this._ctx, query);
};

function SelectWrapper(ctx, query) {
	var self = this;

	this._ctx = ctx;
	this._query = query;
	this._paused = false;
	this._buffer = [];
	setImmediate(function () {
		self._next();
	});
}

util.inherits(SelectWrapper, EventEmitter);

SelectWrapper.prototype.pause = function () {
	this._paused = true;
};

SelectWrapper.prototype.resume = function () {
	if (this._paused) {
		this._paused = false;
		this._next();
	}
};

var fileNameRegex = /\/([^*\/]+)$/;
var dirRegex = /^(.*\/)[^\/]+$/;
SelectWrapper.prototype._next = function () {
	var self = this;

	if (self._paused || self._done) {
		return;
	}

	if (!self._initialized) {
		self._ctx.get(function (db) {
			var type = typeName(self._query);
			var fileNameMatches = fileNameRegex.exec(self._query);
			var fileName = "";
			var dirMatch = "";
			var extName = "";
			if (fileNameMatches) {
				fileName = fileNameMatches[1];
			}
			var dirMatches = dirRegex.exec(self._query);
			if (dirMatches) {
				dirMatch = dirMatches[1];
			}

			// if ext does not have wildcard
			if (self._query.match(/\.[^\*\.\/]+$/)) {
				extName = path.extname(self._query);
			}

			var predicates = [];
			var params = [];
			if (fileName) {
				if (fileName.match(/\*/)) {
					var likeExpression = fileName.replace(/\*{1,2}/g, "%");
					predicates.push("filename LIKE ?");
					params.push(likeExpression);
				} else {
					predicates.push("filename = ?");
					params.push(fileName);
				}
			}

			if (dirMatch) {
				if (dirMatch.match(/\*/)) {
					var likeExpression = dirMatch.replace(/\*{1,2}/g, "%");
					predicates.push("dirname LIKE ?");
					params.push(likeExpression);
				} else {
					predicates.push("dirname = ?");
					params.push(dirMatch);
				}
			}

			if (type) {
				predicates.push("type = ?");
				params.push(type);
			}

			if (extName) {
				predicates.push("ext = ?");
				params.push(extName);
			}

			var dbQuery = "";
			dbQuery += "SELECT * from bcn_file";

			if (predicates.length) {
				dbQuery += " WHERE " + predicates.join(" AND ") + ";";
			} else {
				dbQuery += ";"
			}

			db.each(dbQuery, params, eachCb, completeCb);

			function eachCb(err, row) {
				if (err) {
					self.emit("error", err);
				} else {
					self._buffer.push(row);
					self._next();
				}
			}

			function completeCb() {
				self._complete = true;
				if (!self._buffer.length) {
					self._next();
				}
			}
		});

		self._initialized = true;
	} else {

		var next = self._buffer.shift();
		if (!next && self._complete) {
			self._done = true;
			setImmediate(function () {
				self.emit("end");
			});
			return;
		}

		var key = path.join(next.dirname, next.filename);
		self.emit("data", key, next);
		setImmediate(function () {
				self._next();
		});
	}
};

function typeName(fileName) {
	var typeRegex = /_?([a-zA-Z][a-zA-Z0-9-]+)\.json$/
	var matches = fileName.match(typeRegex);

	if (matches) {
		return matches[1];
	} else {
		return "";
	}
}

exports.Index = Index;