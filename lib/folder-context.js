var fad = require("fad");
var fs = require("fs");
var path = require("path");

exports.folderContext = function folderContext (uncheckedFolder) {
    return fad.create(
	[
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
	    }
	]);
};
