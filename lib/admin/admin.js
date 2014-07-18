
var express = require("express");
var path = require("path");
var bcn = require("../bcn.js")
	.bcn(path.join(__dirname, "cms"));


exports.admin = function(cmsRoot) {
	var router = express.Router();

	router.use(bcn.express());

	return router;
};
