
var fad = require("fad");
var BcnFsRoot = require("bcn-fs-root").BcnFsRoot;
var sqlite3 = require("sqlite3");
var path = require("path");
var fs = require("fs");

function Index(folderCtx) {
	var ctx = fad.create([
		function openDb(cb) {
			folderCtx.get(function (bcnDir) {
				var indexDbName = path.join(bcnDir, "index.db");
				var sqliteDb = new sqlite3.Database(indexDbName, function (err) {
					if (err) {
						cb(err);
					} else {
						cb(null, sqliteDb);
					}
				});
			});
		},
		function db(openDb, cb) {
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
	this._folderCtx = folderCtx;
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
				self._folderCtx.get(function (folder) {
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

	self._ctx.get(function (db, err) {
		if (err) {
			done(err);
			return;
		}

		done(null);
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