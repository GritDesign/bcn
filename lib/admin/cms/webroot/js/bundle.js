(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

var render = require("bacon-templates").render;

BCN = {
	"render": renderTemplate
};

function renderTemplate(templateName, path, data, cb) {
		
};

},{"bacon-templates":2}],2:[function(require,module,exports){
"use strict";

var parse = require("./parse-js.js").parse;
var render = require("../lib/template-renderer.js").render;
var path = require("path");
var fs = require("fs");

function parseTemplate(str, keepTokens) {
	var ast;
	try {
		// parse(string, exigent_mode, keep_tokens, template_mode)
		ast = parse(str, false, keepTokens, true);
	} catch (e) {
		throw e;
	}
	return ast;
}

function express(templatePath, options, fn) {
	var viewsPath = options.settings.views;
	var relativePath = templatePath.substr(viewsPath.length + 1);

	var renderOptions = {
		getTemplate: function (templateName, cb) {
			var templatePath = path.join(viewsPath, templateName);
			fs.readFile(templatePath, function (err, buff) {
				if (err) {
					cb(err);
					return;
				}
				var str = buff.toString("utf8");

				if (err) {
					cb(new Error("could not find template " +
						templateName));
					return;
				}

				cb(null, str);
			});
		},
		templateRoot: viewsPath
	};

	render(relativePath, options, renderOptions, fn);
}

exports.render = render;
exports.parseTemplate = parseTemplate;
exports.express = express;

},{"../lib/template-renderer.js":4,"./parse-js.js":3,"fs":5,"path":8}],3:[function(require,module,exports){
"use strict";

/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.

  This version is suitable for Node.js.  With minimal changes (the
  exports stuff) it should work on any JS platform.

  This file contains the tokenizer/parser.  It is a port to JavaScript
  of parse-js [1], a JavaScript parser library written in Common Lisp
  by Marijn Haverbeke.  Thank you Marijn!

  [1] http://marijn.haverbeke.nl/parse-js/

  Exported functions:

    - tokenizer(code) -- returns a function.  Call the returned
      function to fetch the next token.

    - parse(code) -- returns an AST of the given JavaScript code.

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2010 (c) Mihai Bazon <mihai.bazon@gmail.com>
    Based on parse-js (http://marijn.haverbeke.nl/parse-js/).

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

/* -----[ Tokenizer (constants) ]----- */

var KEYWORDS = arrayToHash([
	"break",
	"case",
	"catch",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"finally",
	"for",
	"function",
	"if",
	"in",
	"instanceof",
	"new",
	"return",
	"switch",
	"throw",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with"
]);

var RESERVED_WORDS = arrayToHash([
	"abstract",
	"boolean",
	"byte",
	"char",
	"class",
	"double",
	"enum",
	"export",
	"extends",
	"final",
	"float",
	"goto",
	"implements",
	"import",
	"int",
	"interface",
	"long",
	"native",
	"package",
	"private",
	"protected",
	"public",
	"short",
	"static",
	"super",
	"synchronized",
	"throws",
	"transient",
	"volatile"
]);

var KEYWORDS_BEFORE_EXPRESSION = arrayToHash([
	"return",
	"new",
	"delete",
	"throw",
	"else",
	"case"
]);

var KEYWORDS_ATOM = arrayToHash([
	"false",
	"null",
	"true",
	"undefined"
]);

var OPERATOR_CHARS = arrayToHash(characters("+-*&%=<>!?|~^"));

var RE_HEX_NUMBER = /^0x[0-9a-f]+$/i;
var RE_OCT_NUMBER = /^0[0-7]+$/;
var RE_DEC_NUMBER = /^\d*\.?\d*(?:e[+-]?\d*(?:\d\.?|\.?\d)\d*)?$/i;

var OPERATORS = arrayToHash([
	"in",
	"instanceof",
	"typeof",
	"new",
	"void",
	"delete",
	"++",
	"--",
	"+",
	"-",
	"!",
	"~",
	"&",
	"|",
	"^",
	"*",
	"/",
	"%",
	">>",
	"<<",
	">>>",
	"<",
	">",
	"<=",
	">=",
	"==",
	"===",
	"!=",
	"!==",
	"?",
	"=",
	"+=",
	"-=",
	"/=",
	"*=",
	"%=",
	">>=",
	"<<=",
	">>>=",
	"|=",
	"^=",
	"&=",
	"&&",
	"||"
]);

var TEMPLATE_START_COMMANDS = arrayToHash([
	"each",
	"if",
	"else",
	"tmpl",
	"verbatim",
	"html",
	"layout",
	"var",
	"!"
]);

var TEMPLATE_END_COMMANDS = arrayToHash([
	"each",
	"if",
	"verbatim"
]);

var WHITESPACE_CHARS = arrayToHash(characters(
	[
		" \u00a0\n\r\t\f\u000b\u200b\u180e\u2000\u2001\u2002\u2003\u2004",
		"\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000"
	].join("")
));

var PUNC_BEFORE_EXPRESSION = arrayToHash(characters("[{(,.;:"));

var PUNC_CHARS = arrayToHash(characters("[]{}(),;:"));

/* -----[ Tokenizer ]----- */

// regexps adapted from http://xregexp.com/plugins/#unicode
var UNICODE = {
	letter: new RegExp([
		"[\\u0041-\\u005A\\u0061-\\u007A\\u00AA\\u00B5\\u00BA\\u00C",
		"0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u0",
		"2E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u0",
		"37A-\\u037D\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u",
		"03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u0523\\u0531-\\u0556",
		"\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u062",
		"1-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E",
		"6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072",
		"F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07F",
		"A\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0971\\u097",
		"2\\u097B-\\u097F\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09",
		"A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09",
		"DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A",
		"0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A",
		"35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A",
		"74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u",
		"0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0",
		"AE1\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u",
		"0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0",
		"B5F-\\u0B61\\u0B71\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u",
		"0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0",
		"BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0C05-\\u0C0C\\u",
		"0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C33\\u0C35-\\u0C39",
		"\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-",
		"\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CB",
		"D\\u0CDE\\u0CE0\\u0CE1\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D1",
		"2-\\u0D28\\u0D2A-\\u0D39\\u0D3D\\u0D60\\u0D61\\u0D7A-\\u0D",
		"7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0",
		"DC0-\\u0DC6\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E46\\u",
		"0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0",
		"E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0",
		"EAB\\u0EAD-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0",
		"EC6\\u0EDC\\u0EDD\\u0F00\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0",
		"F88-\\u0F8B\\u1000-\\u102A\\u103F\\u1050-\\u1055\\u105A-\\",
		"u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\",
		"u108E\\u10A0-\\u10C5\\u10D0-\\u10FA\\u10FC\\u1100-\\u1159",
		"\\u115F-\\u11A2\\u11A8-\\u11F9\\u1200-\\u1248\\u124A-\\u12",
		"4D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u1",
		"28A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\",
		"u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-",
		"\\u1315\\u1318-\\u135A\\u1380-\\u138F\\u13A0-\\u13F4\\u140",
		"1-\\u166C\\u166F-\\u1676\\u1681-\\u169A\\u16A0-\\u16EA\\u1",
		"700-\\u170C\\u170E-\\u1711\\u1720-\\u1731\\u1740-\\u1751\\",
		"u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17D7\\u17DC",
		"\\u1820-\\u1877\\u1880-\\u18A8\\u18AA\\u1900-\\u191C\\u195",
		"0-\\u196D\\u1970-\\u1974\\u1980-\\u19A9\\u19C1-\\u19C7\\u1",
		"A00-\\u1A16\\u1B05-\\u1B33\\u1B45-\\u1B4B\\u1B83-\\u1BA0\\",
		"u1BAE\\u1BAF\\u1C00-\\u1C23\\u1C4D-\\u1C4F\\u1C5A-\\u1C7D",
		"\\u1D00-\\u1DBF\\u1E00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F",
		"45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F",
		"5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u",
		"1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-",
		"\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2071\\u207F\\u2090",
		"-\\u2094\\u2102\\u2107\\u210A-\\u2113\\u2115\\u2119-\\u211",
		"D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u212F-\\u2139\\u213",
		"C-\\u213F\\u2145-\\u2149\\u214E\\u2183\\u2184\\u2C00-\\u2C",
		"2E\\u2C30-\\u2C5E\\u2C60-\\u2C6F\\u2C71-\\u2C7D\\u2C80-\\u",
		"2CE4\\u2D00-\\u2D25\\u2D30-\\u2D65\\u2D6F\\u2D80-\\u2D96\\",
		"u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE",
		"\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2D",
		"DE\\u2E2F\\u3005\\u3006\\u3031-\\u3035\\u303B\\u303C\\u304",
		"1-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u3",
		"105-\\u312D\\u3131-\\u318E\\u31A0-\\u31B7\\u31F0-\\u31FF\\",
		"u3400\\u4DB5\\u4E00\\u9FC3\\uA000-\\uA48C\\uA500-\\uA60C\\",
		"uA610-\\uA61F\\uA62A\\uA62B\\uA640-\\uA65F\\uA662-\\uA66E",
		"\\uA67F-\\uA697\\uA717-\\uA71F\\uA722-\\uA788\\uA78B\\uA78",
		"C\\uA7FB-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA",
		"822\\uA840-\\uA873\\uA882-\\uA8B3\\uA90A-\\uA925\\uA930-\\",
		"uA946\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAC00",
		"\\uD7A3\\uF900-\\uFA2D\\uFA30-\\uFA6A\\uFA70-\\uFAD9\\uFB0",
		"0-\\uFB06\\uFB13-\\uFB17\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uF",
		"B36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB",
		"46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\u",
		"FDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF21-\\uFF3A",
		"\\uFF41-\\uFF5A\\uFF66-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFF",
		"CF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC]"
	].join("")),
	nonSpacingMark: new RegExp([
		"[\\u0300-\\u036F\\u0483-\\u0487\\u0591-\\u05BD\\u05BF\\u05",
		"C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610-\\u061A\\u064B-\\u06",
		"5E\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06",
		"EA-\\u06ED\\u0711\\u0730-\\u074A\\u07A6-\\u07B0\\u07EB-\\u",
		"07F3\\u0816-\\u0819\\u081B-\\u0823\\u0825-\\u0827\\u0829-",
		"\\u082D\\u0900-\\u0902\\u093C\\u0941-\\u0948\\u094D\\u0951",
		"-\\u0955\\u0962\\u0963\\u0981\\u09BC\\u09C1-\\u09C4\\u09CD",
		"\\u09E2\\u09E3\\u0A01\\u0A02\\u0A3C\\u0A41\\u0A42\\u0A47\\",
		"u0A48\\u0A4B-\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81\\u",
		"0A82\\u0ABC\\u0AC1-\\u0AC5\\u0AC7\\u0AC8\\u0ACD\\u0AE2\\u0",
		"AE3\\u0B01\\u0B3C\\u0B3F\\u0B41-\\u0B44\\u0B4D\\u0B56\\u0B",
		"62\\u0B63\\u0B82\\u0BC0\\u0BCD\\u0C3E-\\u0C40\\u0C46-\\u0C",
		"48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0CBC\\u0CB",
		"F\\u0CC6\\u0CCC\\u0CCD\\u0CE2\\u0CE3\\u0D41-\\u0D44\\u0D4D",
		"\\u0D62\\u0D63\\u0DCA\\u0DD2-\\u0DD4\\u0DD6\\u0E31\\u0E34-",
		"\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC",
		"\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F71-",
		"\\u0F7E\\u0F80-\\u0F84\\u0F86\\u0F87\\u0F90-\\u0F97\\u0F99",
		"-\\u0FBC\\u0FC6\\u102D-\\u1030\\u1032-\\u1037\\u1039\\u103",
		"A\\u103D\\u103E\\u1058\\u1059\\u105E-\\u1060\\u1071-\\u107",
		"4\\u1082\\u1085\\u1086\\u108D\\u109D\\u135F\\u1712-\\u1714",
		"\\u1732-\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B7-\\u17BD",
		"\\u17C6\\u17C9-\\u17D3\\u17DD\\u180B-\\u180D\\u18A9\\u1920",
		"-\\u1922\\u1927\\u1928\\u1932\\u1939-\\u193B\\u1A17\\u1A18",
		"\\u1A56\\u1A58-\\u1A5E\\u1A60\\u1A62\\u1A65-\\u1A6C\\u1A73",
		"-\\u1A7C\\u1A7F\\u1B00-\\u1B03\\u1B34\\u1B36-\\u1B3A\\u1B3",
		"C\\u1B42\\u1B6B-\\u1B73\\u1B80\\u1B81\\u1BA2-\\u1BA5\\u1BA",
		"8\\u1BA9\\u1C2C-\\u1C33\\u1C36\\u1C37\\u1CD0-\\u1CD2\\u1CD",
		"4-\\u1CE0\\u1CE2-\\u1CE8\\u1CED\\u1DC0-\\u1DE6\\u1DFD-\\u1",
		"DFF\\u20D0-\\u20DC\\u20E1\\u20E5-\\u20F0\\u2CEF-\\u2CF1\\u",
		"2DE0-\\u2DFF\\u302A-\\u302F\\u3099\\u309A\\uA66F\\uA67C\\u",
		"A67D\\uA6F0\\uA6F1\\uA802\\uA806\\uA80B\\uA825\\uA826\\uA8",
		"C4\\uA8E0-\\uA8F1\\uA926-\\uA92D\\uA947-\\uA951\\uA980-\\u",
		"A982\\uA9B3\\uA9B6-\\uA9B9\\uA9BC\\uAA29-\\uAA2E\\uAA31\\u",
		"AA32\\uAA35\\uAA36\\uAA43\\uAA4C\\uAAB0\\uAAB2-\\uAAB4\\uA",
		"AB7\\uAAB8\\uAABE\\uAABF\\uAAC1\\uABE5\\uABE8\\uABED\\uFB1",
		"E\\uFE00-\\uFE0F\\uFE20-\\uFE26]"
	].join("")),
	spaceCombiningMark: new RegExp([
		"[\\u0903\\u093E-\\u0940\\u0949-\\u094C\\u094E\\u0982\\u098",
		"3\\u09BE-\\u09C0\\u09C7\\u09C8\\u09CB\\u09CC\\u09D7\\u0A03",
		"\\u0A3E-\\u0A40\\u0A83\\u0ABE-\\u0AC0\\u0AC9\\u0ACB\\u0ACC",
		"\\u0B02\\u0B03\\u0B3E\\u0B40\\u0B47\\u0B48\\u0B4B\\u0B4C\\",
		"u0B57\\u0BBE\\u0BBF\\u0BC1\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\",
		"u0BCC\\u0BD7\\u0C01-\\u0C03\\u0C41-\\u0C44\\u0C82\\u0C83\\",
		"u0CBE\\u0CC0-\\u0CC4\\u0CC7\\u0CC8\\u0CCA\\u0CCB\\u0CD5\\u",
		"0CD6\\u0D02\\u0D03\\u0D3E-\\u0D40\\u0D46-\\u0D48\\u0D4A-\\",
		"u0D4C\\u0D57\\u0D82\\u0D83\\u0DCF-\\u0DD1\\u0DD8-\\u0DDF\\",
		"u0DF2\\u0DF3\\u0F3E\\u0F3F\\u0F7F\\u102B\\u102C\\u1031\\u1",
		"038\\u103B\\u103C\\u1056\\u1057\\u1062-\\u1064\\u1067-\\u1",
		"06D\\u1083\\u1084\\u1087-\\u108C\\u108F\\u109A-\\u109C\\u1",
		"7B6\\u17BE-\\u17C5\\u17C7\\u17C8\\u1923-\\u1926\\u1929-\\u",
		"192B\\u1930\\u1931\\u1933-\\u1938\\u19B0-\\u19C0\\u19C8\\u",
		"19C9\\u1A19-\\u1A1B\\u1A55\\u1A57\\u1A61\\u1A63\\u1A64\\u1",
		"A6D-\\u1A72\\u1B04\\u1B35\\u1B3B\\u1B3D-\\u1B41\\u1B43\\u1",
		"B44\\u1B82\\u1BA1\\u1BA6\\u1BA7\\u1BAA\\u1C24-\\u1C2B\\u1C",
		"34\\u1C35\\u1CE1\\u1CF2\\uA823\\uA824\\uA827\\uA880\\uA881",
		"\\uA8B4-\\uA8C3\\uA952\\uA953\\uA983\\uA9B4\\uA9B5\\uA9BA",
		"\\uA9BB\\uA9BD-\\uA9C0\\uAA2F\\uAA30\\uAA33\\uAA34\\uAA4D",
		"\\uAA7B\\uABE3\\uABE4\\uABE6\\uABE7\\uABE9\\uABEA\\uABEC]"
	].join("")),
	connectorPunctuation: new RegExp(
		"[\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F]"
	)
};

function isLetter(ch) {
	return UNICODE.letter.test(ch);
}

function isDigit(ch) {
	ch = ch.charCodeAt(0);
	return ch >= 48 && ch <= 57;
}

function isAlphanumericChar(ch) {
	return isDigit(ch) || isLetter(ch);
}

function isUnicodeCombiningMark(ch) {
	return UNICODE.nonSpacingMark.test(ch) ||
		UNICODE.spaceCombiningMark.test(ch);
}

function isUnicodeConnectorPunctuation(ch) {
	return UNICODE.connectorPunctuation.test(ch);
}

function isIdentifierStart(ch) {
	return ch === "$" || ch === "_" || isLetter(ch);
}

function isIdentifierChar(ch) {
	return isIdentifierStart(ch) ||
		isUnicodeCombiningMark(ch) ||
		isDigit(ch) ||
		isUnicodeConnectorPunctuation(ch) ||
		ch === "\u200c" || /* zero-width non-joiner <ZWNJ> */
		ch === "\u200d"
	/* zero-width joiner <ZWJ>
            (in my ECMA-262 PDF, this is also 200c) */
	;
}

function parseJsNumber(num) {
	if (RE_HEX_NUMBER.test(num)) {
		return parseInt(num.substr(2), 16);
	} else if (RE_OCT_NUMBER.test(num)) {
		return parseInt(num.substr(1), 8);
	} else if (RE_DEC_NUMBER.test(num)) {
		return parseFloat(num);
	}
}

function ParseError(message, line, col, pos) {
	this.message = message;
	this.line = line + 1;
	this.col = col + 1;
	this.pos = pos + 1;
	this.stack = new Error().stack;
}

ParseError.prototype.toString = function () {
	return this.message +
		" (line: " + this.line +
		", col: " + this.col +
		", pos: " + this.pos +
		")" + "\n\n" + this.stack;
};

function throwParseError(message, line, col, pos) {
	throw new ParseError(message, line, col, pos);
}

function isToken(token, type, val) {
	return token.type === type && (val === undefined ||
		token.value === val);
}

var EX_EOF = {};

var TMPL_MODE_NONE = 0,
	TMPL_MODE_HTML = 1,
	TMPL_MODE_COMMAND = 2,
	TMPL_MODE_VARIABLE = 3;

function tokenizer($TEXT, hasTemplateMode) {

	var S = {
		text: $TEXT.replace(/\r\n?|[\n\u2028\u2029]/g, "\n")
			.replace(/^\uFEFF/, ""),
		pos: 0,
		tokpos: 0,
		line: 0,
		tokline: 0,
		col: 0,
		tokcol: 0,
		newlineBefore: false,
		regexAllowed: false,
		curlyCount: 0,
		templateMode: hasTemplateMode ? TMPL_MODE_HTML : TMPL_MODE_NONE,
		commentsBefore: []
	};

	function peek() {
		return S.text.charAt(S.pos);
	}

	function next(signalEof, inString) {
		var ch = S.text.charAt(S.pos++);
		if (signalEof && !ch) {
			throw EX_EOF;
		}
		if (ch === "\n") {
			S.newlineBefore = S.newlineBefore || !inString;
			++S.line;
			S.col = 0;
		} else {
			++S.col;
		}
		return ch;
	}

	function find(what, signalEof) {
		var pos = S.text.indexOf(what, S.pos);
		if (signalEof && pos === -1) {
			throw EX_EOF;
		}
		return pos;
	}

	function startToken() {
		S.tokline = S.line;
		S.tokcol = S.col;
		S.tokpos = S.pos;
	}

	function token(type, value, isComment) {
		S.regexAllowed = ((type === "operator" && !HOP(UNARY_POSTFIX,
				value)) ||
			(type === "keyword" && HOP(KEYWORDS_BEFORE_EXPRESSION,
				value)) ||
			(type === "punc" && HOP(PUNC_BEFORE_EXPRESSION, value)));
		var ret = {
			type: type,
			value: value,
			line: S.tokline,
			col: S.tokcol,
			pos: S.tokpos,
			endpos: S.pos,
			nlb: S.newlineBefore
		};
		if (!isComment) {
			ret.commentsBefore = S.commentsBefore;
			S.commentsBefore = [];
		}
		S.newlineBefore = false;
		return ret;
	}

	function skipWhitespace() {
		while (HOP(WHITESPACE_CHARS, peek())) {
			next();
		}
	}

	function readWhile(pred) {
		var ret = "",
			ch = peek(),
			i = 0;
		while (ch && pred(ch, i++)) {
			ret += next();
			ch = peek();
		}
		return ret;
	}

	function parseError(err) {
		throwParseError(err, S.tokline, S.tokcol, S.tokpos);
	}

	function readNum(prefix) {
		var hasE = false,
			afterE = false,
			hasX = false,
			hasDot = prefix === ".";

		var num = readWhile(function (ch, i) {
			if (ch === "x" || ch === "X") {
				if (hasX) {
					return false;
				}
				hasX = true;
				return true;
			}
			if (!hasX && (ch === "E" || ch === "e")) {
				if (hasE) {
					return false;
				}
				hasE = true;
				afterE = true;
				return true;
			}
			if (ch === "-") {
				if (afterE || (i === 0 && !prefix)) {
					return true;
				}
				return false;
			}
			if (ch === "+") {
				return afterE;
			}
			afterE = false;
			if (ch === ".") {
				if (!hasDot && !hasX) {
					hasDot = true;
					return true;
				}
				return false;
			}
			return isAlphanumericChar(ch);
		});
		if (prefix) {
			num = prefix + num;
		}
		var valid = parseJsNumber(num);
		if (!isNaN(valid)) {
			return token("num", valid);
		} else {
			parseError("Invalid syntax: " + num);
		}
	}

	function readEscapedChar(inString) {
		var ch = next(true, inString);
		switch (ch) {
		case "n":
			return "\n";
		case "r":
			return "\r";
		case "t":
			return "\t";
		case "b":
			return "\b";
		case "v":
			return "\u000b";
		case "f":
			return "\f";
		case "0":
			return "\0";
		case "x":
			return String.fromCharCode(hexBytes(2));
		case "u":
			return String.fromCharCode(hexBytes(4));
		case "\n":
			return "";
		default:
			return ch;
		}
	}

	function hexBytes(n) {
		var num = 0;
		for (; n > 0; --n) {
			var digit = parseInt(next(true), 16);
			if (isNaN(digit)) {
				parseError("Invalid hex-character pattern in string");
			}
			num = (num * 16) + digit;
		}
		return num;
	}

	function readString() {
		return withEofError("Unterminated string constant", function () {
			var quote = next(),
				ret = "",
				octalLen,
				first,
				ch;

			function whileOctal(ch) {
				if (ch >= "0" && ch <= "7") {
					if (!first) {
						first = ch;
						return ++octalLen;
					} else if (first <= "3" && octalLen <= 2) {
						return ++octalLen;
					} else if (first >= "4" && octalLen <= 1) {
						return ++octalLen;
					}
				}
				return false;
			}

			for (;;) {
				ch = next(true);
				if (ch === "\\") {
					// read OctalEscapeSequence 
					// (XXX: deprecated if "strict mode")
					// https://github.com/mishoo/UglifyJS/issues/178
					octalLen = 0;
					first = null;
					ch = readWhile(whileOctal);
					if (octalLen > 0) {
						ch = String.fromCharCode(parseInt(ch, 8));
					} else {
						ch = readEscapedChar(true);
					}
				} else if (ch === quote) {
					break;
				}
				ret += ch;
			}
			return token("string", ret);
		});
	}

	function readLineComment() {
		next();
		var i = find("\n"),
			ret;
		if (i === -1) {
			ret = S.text.substr(S.pos);
			S.pos = S.text.length;
		} else {
			ret = S.text.substring(S.pos, i);
			S.pos = i;
		}
		return token("comment1", ret, true);
	}

	function readMultilineComment() {
		next();
		return withEofError("Unterminated multiline comment",
			function () {
				var i = find("*/", true),
					text = S.text.substring(S.pos, i);
				S.pos = i + 2;
				S.line += text.split("\n").length - 1;
				S.newlineBefore = text.indexOf("\n") >= 0;

				return token("comment2", text, true);
			});
	}

	function readMultilineTemplateComment() {
		next();
		return withEofError("Unterminated multiline comment",
			function () {
				var i = find("}}", true),
					text = S.text.substring(S.pos, i);
				S.pos = i + 2;
				S.line += text.split("\n").length - 1;
				S.newlineBefore = text.indexOf("\n") >= 0;

				return token("comment2", text, true);
			});
	}

	function readName() {
		var backslash = false,
			name = "",
			ch, escaped = false,
			hex;
		while ((ch = peek()) !== null) {
			if (!backslash) {
				if (ch === "\\") {
					escaped = true;
					backslash = true;
					next();
				} else if (isIdentifierChar(ch)) {
					name += next();
				} else {
					break;
				}
			} else {
				if (ch !== "u") {
					parseError(
						"Expecting UnicodeEscapeSequence -- uXXXX");
				}
				ch = readEscapedChar();
				if (!isIdentifierChar(ch)) {
					parseError("Unicode char: " +
						ch.charCodeAt(0) +
						" is not valid in identifier");
				}
				name += ch;
				backslash = false;
			}
		}
		if (HOP(KEYWORDS, name) && escaped) {
			hex = name.charCodeAt(0).toString(16).toUpperCase();
			name = "\\u" + "0000".substr(hex.length) + hex + name.slice(
				1);
		}
		return name;
	}

	function readRegexp(regexp) {
		return withEofError("Unterminated regular expression",
			function () {
				var prevBackslash = false,
					ch, inClass = false;
				while ((ch = next(true))) {
					if (prevBackslash) {
						regexp += "\\" + ch;
						prevBackslash = false;
					} else if (ch === "[") {
						inClass = true;
						regexp += ch;
					} else if (ch === "]" && inClass) {
						inClass = false;
						regexp += ch;
					} else if (ch === "/" && !inClass) {
						break;
					} else if (ch === "\\") {
						prevBackslash = true;
					} else {
						regexp += ch;
					}
				}

				var mods = readName();
				return token("regexp", [regexp, mods]);
			});
	}

	function readOperator(prefix) {
		function grow(op) {
			if (!peek()) {
				return op;
			}
			var bigger = op + peek();
			if (HOP(OPERATORS, bigger)) {
				next();
				return grow(bigger);
			} else {
				return op;
			}
		}
		return token("operator", grow(prefix || next()));
	}


	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################

	var commandRegex = /^{{(\/)?([a-z!]+)([ }\(])/;

	function peekTemplateCommand() {
		var end = S.pos + 20;
		if (end > S.text.length) {
			end = S.text.length;
		}
		var lookahead = S.text.substring(S.pos, end);
		var matches = commandRegex.exec(lookahead);
		if (matches) {
			var isEnd = matches[1] || "";
			var command = matches[2];
			var validCommands =
				isEnd ? TEMPLATE_END_COMMANDS :
				TEMPLATE_START_COMMANDS;
			if (HOP(validCommands, command)) {
				return [isEnd, command];
			}
		}
		return null;
	}

	function peekTemplateVariable() {
		return S.text.charAt(S.pos) === "$" && S.text.charAt(S.pos +
			1) === "{";
	}

	function readTpunc() {
		var ch = peek();
		if (ch === "$") {
			next();
			next();
			S.templateMode = TMPL_MODE_VARIABLE;
			S.curlyCount = 0;
			return token("tpunc", "${");
		} else if (ch === "{") {
			var templateCommand = peekTemplateCommand();
			var isEndTag = templateCommand[0];
			if (templateCommand) {
				if (!isEndTag && templateCommand[1] === "verbatim") {
					return readVerbatim();
				} else if (!isEndTag && templateCommand[1] === "!") {
					S.commentsBefore.push(
						readMultilineTemplateComment());
					return nextToken();
				} else {
					S.templateMode = TMPL_MODE_COMMAND;
					S.curlyCount = 0;

					next();
					next();
					if (isEndTag) { // also eat up "/" for end commands
						next();
						return token("tpunc", "{{/");
					} else {
						return token("tpunc", "{{");
					}
				}

			}
		}

		parseError("Error parsing template");
	}

	function readVerbatim() {
		next();
		return withEofError("Unterminated {{verbatim}}", function () {
			var i = find("{{/verbatim}}", true),
				text = S.text.substring(S.pos + 11, i);
			S.pos = i + 13;
			S.line += text.split("\n").length - 1;
			S.newlineBefore = text.indexOf("\n") >= 0;

			return token("html", text);
		});
	}

	function readTemplate() {
		var ret = "";

		for (;;) {
			var p = peek();
			if (p === "$" && peekTemplateVariable() ||
				p === "{" && peekTemplateCommand()) {
				if (ret === "") {
					return readTpunc();
				} else {
					break;
				}
			}

			var ch = next();
			if (!ch) {
				break;
			}
			ret += ch;
		}

		return token("html", ret);
	}


	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################


	function handleSlash() {
		next();
		var regexAllowed = S.regexAllowed;
		switch (peek()) {
		case "/":
			S.commentsBefore.push(readLineComment());
			S.regexAllowed = regexAllowed;
			return nextToken();
		case "*":
			S.commentsBefore.push(readMultilineComment());
			S.regexAllowed = regexAllowed;
			return nextToken();
		}
		return S.regexAllowed ? readRegexp("") : readOperator("/");
	}

	function handleDot() {
		next();
		return isDigit(peek()) ? readNum(".") : token("punc", ".");
	}

	function readWord() {
		var word = readName();
		return !HOP(KEYWORDS, word) ? token("name", word) :
			HOP(OPERATORS, word) ? token("operator", word) :
			HOP(KEYWORDS_ATOM, word) ? token("atom", word) :
			token("keyword", word);
	}

	function withEofError(eofError, cont) {
		try {
			return cont();
		} catch (ex) {
			if (ex === EX_EOF) {
				parseError(eofError);
			} else {
				throw ex;
			}
		}
	}

	function nextToken(forceRegexp) {
		if (forceRegexp !== undefined) {
			return readRegexp(forceRegexp);
		}

		if (S.templateMode !== TMPL_MODE_HTML) {
			skipWhitespace();
		}

		startToken();
		var ch = peek();
		if (!ch) {
			return token("eof");
		}

		// template mode
		if (S.templateMode === TMPL_MODE_COMMAND ||
			S.templateMode === TMPL_MODE_VARIABLE) {
			if (ch === "{") {
				S.curlyCount++;
			} else if (ch === "}") {
				if (S.curlyCount === 0) {
					if (S.templateMode === TMPL_MODE_COMMAND) {
						if (peek() !== "}") {
							parseError(
								"Expected closing '}}' here got '}" +
								ch + "'");
						}
						next();
						next();
						S.templateMode = TMPL_MODE_HTML;
						return token("tpunc", "}}");
					} else {
						next();
						S.templateMode = TMPL_MODE_HTML;
						return token("tpunc", "}");
					}
				}
				S.curlyCount--;
			}
		}
		// end template mode

		if (S.templateMode === TMPL_MODE_HTML) {
			return readTemplate();
		}
		if (isDigit(ch)) {
			return readNum();
		}
		if (ch === "\"" || ch === "'") {
			return readString();
		}
		if (HOP(PUNC_CHARS, ch)) {
			return token("punc", next());
		}
		if (ch === ".") {
			return handleDot();
		}
		if (ch === "/") {
			return handleSlash();
		}
		if (HOP(OPERATOR_CHARS, ch)) {
			return readOperator();
		}
		if (ch === "\\" || isIdentifierStart(ch)) {
			return readWord();
		}

		parseError("Unexpected character '" + ch + "'");
	}

	nextToken.context = function (nc) {
		if (nc) {
			S = nc;
		}
		return S;
	};

	return nextToken;
}

/* -----[ Parser (constants) ]----- */

var UNARY_PREFIX = arrayToHash([
	"typeof",
	"void",
	"delete",
	"--",
	"++",
	"!",
	"~",
	"-",
	"+"
]);

var UNARY_POSTFIX = arrayToHash(["--", "++"]);

var ASSIGNMENT = (function (a, ret, i) {
	while (i < a.length) {
		ret[a[i]] = a[i].substr(0, a[i].length - 1);
		i++;
	}
	return ret;
})(
	["+=", "-=", "/=", "*=", "%=", ">>=", "<<=", ">>>=", "|=", "^=",
		"&="
	], {
		"=": true
	},
	0
);

var PRECEDENCE = (function (a, ret) {
	for (var i = 0, n = 1; i < a.length; ++i, ++n) {
		var b = a[i];
		for (var j = 0; j < b.length; ++j) {
			ret[b[j]] = n;
		}
	}
	return ret;
})(
	[
		["||"],
		["&&"],
		["|"],
		["^"],
		["&"],
		["==", "===", "!=", "!=="],
		["<", ">", "<=", ">=", "in", "instanceof"],
		[">>", "<<", ">>>"],
		["+", "-"],
		["*", "/", "%"]
	], {}
);

var STATEMENTS_WITH_LABELS = arrayToHash(["for", "do", "while",
	"switch"
]);

var ATOMIC_START_TOKEN = arrayToHash(
	["atom", "num", "string", "regexp", "name"]);

/* -----[ Parser ]----- */

function NodeWithToken(str, start, end) {
	this.name = str;
	this.start = start;
	this.end = end;
}

NodeWithToken.prototype.toString = function () {
	return this.name;
};

function parse($TEXT, exigentMode, embedTokens, hasTemplateMode) {

	var S = {
		input: typeof $TEXT === "string" ? tokenizer($TEXT,
			hasTemplateMode) : $TEXT,
		token: null,
		prev: null,
		peeked: null,
		inFunction: 0,
		inLoop: 0,
		labels: []
	};

	S.token = next();

	function is(type, value) {
		return isToken(S.token, type, value);
	}

	function peek() {
		return S.peeked || (S.peeked = S.input());
	}

	function next() {
		S.prev = S.token;
		if (S.peeked) {
			S.token = S.peeked;
			S.peeked = null;
		} else {
			S.token = S.input();
		}
		return S.token;
	}

	function prev() {
		return S.prev;
	}

	function croak(msg, line, col, pos) {
		var ctx = S.input.context();
		throwParseError(msg,
			line !== null ? line : ctx.tokline,
			col !== null ? col : ctx.tokcol,
			pos !== null ? pos : ctx.tokpos);
	}

	function tokenError(token, msg) {
		croak(msg, token.line, token.col);
	}

	function unexpected(token) {
		if (token === undefined) {
			token = S.token;
		}
		tokenError(token, "Unexpected token: " + token.type +
			" (" + token.value + ")");
	}

	function expectToken(type, val) {
		if (is(type, val)) {
			return next();
		}
		tokenError(S.token, "Unexpected token " + S.token.type +
			", expected " + type);
	}

	function expect(punc) {
		return expectToken("punc", punc);
	}

	function canInsertSemicolon() {
		return !exigentMode && (
			S.token.nlb || is("eof") || is("punc", "}")
		);
	}

	function semicolon() {
		if (is("punc", ";")) {
			next();
		} else if (!canInsertSemicolon()) {
			unexpected();
		}
	}

	function as() {
		return slice(arguments);
	}

	function parenthesised() {
		expect("(");
		var ex = expression();
		expect(")");
		return ex;
	}

	function addTokens(str, start, end) {
		return str instanceof NodeWithToken ? str :
			new NodeWithToken(str, start, end);
	}

	function maybeEmbedTokens(parser) {
		if (embedTokens) {
			return function () {
				var start = S.token;
				var ast = parser.apply(this, arguments);
				ast[0] = addTokens(ast[0], start, prev());
				return ast;
			};
		} else {
			return parser;
		}
	}

	var statement = maybeEmbedTokens(function () {
		if (is("operator", "/") || is("operator", "/=")) {
			S.peeked = null;
			S.token = S.input(S.token.value.substr(1)); // force regexp
		}
		switch (S.token.type) {
		case "num":
		case "string":
		case "regexp":
		case "operator":
		case "atom":
			return simpleStatement();

		case "name":
			return isToken(peek(), "punc", ":") ?
				labeledStatement(prog1(S.token.value, next, next)) :
				simpleStatement();

		case "punc":
			switch (S.token.value) {
			case "{":
				return as("block", block$());
			case "[":
			case "(":
				return simpleStatement();
			case ";":
				next();
				return as("block");
			default:
				unexpected();
			}
			break;
		case "keyword":
			switch (prog1(S.token.value, next)) {
			case "break":
				return breakCont("break");

			case "continue":
				return breakCont("continue");

			case "debugger":
				semicolon();
				return as("debugger");

			case "do":
				return (function (body) {
					expectToken("keyword", "while");
					return as("do", prog1(parenthesised,
							semicolon),
						body);
				})(inLoop(statement));

			case "for":
				return for$();

			case "function":
				return function$(true);

			case "if":
				return if$();

			case "return":
				if (S.inFunction === 0) {
					croak("'return' outside of function");
				}
				return as("return",
					is("punc", ";") ? (next(), null) :
					canInsertSemicolon() ? null :
					prog1(expression, semicolon));

			case "switch":
				return as("switch", parenthesised(), switchBlock$());

			case "throw":
				if (S.token.nlb) {
					croak("Illegal newline after 'throw'");
				}
				return as("throw", prog1(expression, semicolon));

			case "try":
				return try$();

			case "var":
				return prog1(var$, semicolon);

			case "const":
				return prog1(const$, semicolon);

			case "while":
				return as("while", parenthesised(), inLoop(
					statement));

			case "with":
				return as("with", parenthesised(), statement());

			default:
				unexpected();
			}
		}
	});

	function labeledStatement(label) {
		S.labels.push(label);
		var start = S.token,
			stat = statement();
		if (exigentMode && !HOP(STATEMENTS_WITH_LABELS, stat[0])) {
			unexpected(start);
		}
		S.labels.pop();
		return as("label", label, stat);
	}

	function simpleStatement() {
		return as("stat", prog1(expression, semicolon));
	}

	function breakCont(type) {
		var name;
		if (!canInsertSemicolon()) {
			name = is("name") ? S.token.value : null;
		}
		if (name !== null) {
			next();
			if (!member(name, S.labels)) {
				croak("Label " + name +
					" without matching loop or statement");
			}
		} else if (S.inLoop === 0) {
			croak(type + " not inside a loop or switch");
		}
		semicolon();
		return as(type, name);
	}

	function for$() {
		expect("(");
		var init = null;
		if (!is("punc", ";")) {
			init = is("keyword", "var") ? (next(), var$(true)) :
				expression(true, true);
			if (is("operator", "in")) {
				if (init[0] === "var" && init[1].length > 1) {
					croak("Only one variable declaration allowed " +
						"in for..in loop");
				}
				return forIn(init);
			}
		}
		return regularFor(init);
	}

	function regularFor(init) {
		expect(";");
		var test = is("punc", ";") ? null : expression();
		expect(";");
		var step = is("punc", ")") ? null : expression();
		expect(")");
		return as("for", init, test, step, inLoop(statement));
	}

	function forIn(init) {
		var lhs = init[0] === "var" ? as("name", init[1][0]) : init;
		next();
		var obj = expression();
		expect(")");
		return as("for-in", init, lhs, obj, inLoop(statement));
	}

	var function$ = function (inStatement) {
		var name = is("name") ? prog1(S.token.value, next) : null;
		if (inStatement && !name) {
			unexpected();
		}
		expect("(");
		return as(inStatement ? "defun" : "function",
			name,
			// arguments
			(function (first, a) {
				while (!is("punc", ")")) {
					if (first) {
						first = false;
					} else {
						expect(",");
					}
					if (!is("name")) {
						unexpected();
					}
					a.push(S.token.value);
					next();
				}
				next();
				return a;
			})(true, []),
			// body
			(function () {
				++S.inFunction;
				var loop = S.inLoop;
				S.inLoop = 0;
				var a = block$();
				--S.inFunction;
				S.inLoop = loop;
				return a;
			})());
	};

	function if$() {
		var cond = parenthesised(),
			body = statement(),
			belse;
		if (is("keyword", "else")) {
			next();
			belse = statement();
		}
		return as("if", cond, body, belse);
	}

	function block$() {
		expect("{");
		var a = [];
		while (!is("punc", "}")) {
			if (is("eof")) {
				unexpected();
			}
			a.push(statement());
		}
		next();
		return a;
	}

	var switchBlock$ = curry(inLoop, function () {
		expect("{");
		var a = [],
			cur = null;
		while (!is("punc", "}")) {
			if (is("eof")) {
				unexpected();
			}
			if (is("keyword", "case")) {
				next();
				cur = [];
				a.push([expression(), cur]);
				expect(":");
			} else if (is("keyword", "default")) {
				next();
				expect(":");
				cur = [];
				a.push([null, cur]);
			} else {
				if (!cur) {
					unexpected();
				}
				cur.push(statement());
			}
		}
		next();
		return a;
	});

	function try$() {
		var body = block$(),
			bcatch, bfinally;
		if (is("keyword", "catch")) {
			next();
			expect("(");
			if (!is("name")) {
				croak("Name expected");
			}
			var name = S.token.value;
			next();
			expect(")");
			bcatch = [name, block$()];
		}
		if (is("keyword", "finally")) {
			next();
			bfinally = block$();
		}
		if (!bcatch && !bfinally) {
			croak("Missing catch/finally blocks");
		}
		return as("try", body, bcatch, bfinally);
	}

	function vardefs(noIn) {
		var a = [];
		for (;;) {
			if (!is("name")) {
				unexpected();
			}
			var name = S.token.value;
			next();
			if (is("operator", "=")) {
				next();
				a.push([name, expression(false, noIn)]);
			} else {
				a.push([name]);
			}
			if (!is("punc", ",")) {
				break;
			}
			next();
		}
		return a;
	}

	function var$(noIn) {
		return as("var", vardefs(noIn));
	}

	function const$() {
		return as("const", vardefs());
	}

	function new$() {
		var newexp = exprAtom(false),
			args;
		if (is("punc", "(")) {
			next();
			args = exprList(")");
		} else {
			args = [];
		}
		return subscripts(as("new", newexp, args), true);
	}

	var exprAtom = maybeEmbedTokens(function (allowCalls) {
		if (is("operator", "new")) {
			next();
			return new$();
		}
		if (is("punc")) {
			switch (S.token.value) {
			case "(":
				next();
				return subscripts(prog1(expression,
					curry(expect, ")")), allowCalls);
			case "[":
				next();
				return subscripts(array$(), allowCalls);
			case "{":
				next();
				return subscripts(object$(), allowCalls);
			}
			unexpected();
		}
		if (is("keyword", "function")) {
			next();
			return subscripts(function$(false), allowCalls);
		}
		if (HOP(ATOMIC_START_TOKEN, S.token.type)) {
			var atom = S.token.type === "regexp" ?
				as("regexp", S.token.value[0], S.token.value[1]) :
				as(S.token.type, S.token.value);
			return subscripts(prog1(atom, next), allowCalls);
		}
		unexpected();
	});

	function exprList(closing, allowTrailingComma, allowEmpty) {
		var first = true,
			a = [];
		while (!is("punc", closing)) {
			if (first) {
				first = false;
			} else {
				expect(",");
			}
			if (allowTrailingComma && is("punc", closing)) {
				break;
			}
			if (is("punc", ",") && allowEmpty) {
				a.push(["atom", "undefined"]);
			} else {
				a.push(expression(false));
			}
		}
		next();
		return a;
	}

	function array$() {
		return as("array", exprList("]", !exigentMode, true));
	}

	function object$() {
		var first = true,
			a = [];
		while (!is("punc", "}")) {
			if (first) {
				first = false;
			} else {
				expect(",");
			}
			if (!exigentMode && is("punc", "}")) {
				// allow trailing comma
				break;
			}
			var type = S.token.type;
			var name = asPropertyName();
			if (type === "name" && (name === "get" || name === "set") && !
				is(
					"punc", ":")) {
				a.push([asName(), function$(false), name]);
			} else {
				expect(":");
				a.push([name, expression(false)]);
			}
		}
		next();
		return as("object", a);
	}

	function asPropertyName() {
		switch (S.token.type) {
		case "num":
		case "string":
			return prog1(S.token.value, next);
		}
		return asName();
	}

	function asName() {
		switch (S.token.type) {
		case "name":
		case "operator":
		case "keyword":
		case "atom":
			return prog1(S.token.value, next);
		default:
			unexpected();
		}
	}

	function subscripts(expr, allowCalls) {
		if (is("punc", ".")) {
			next();
			return subscripts(as("dot", expr, asName()), allowCalls);
		}
		if (is("punc", "[")) {
			next();
			return subscripts(as("sub", expr,
					prog1(expression, curry(expect, "]"))),
				allowCalls);
		}
		if (allowCalls && is("punc", "(")) {
			next();
			return subscripts(as("call", expr, exprList(")")), true);
		}
		return expr;
	}

	function maybeUnary(allowCalls) {
		if (is("operator") && HOP(UNARY_PREFIX, S.token.value)) {
			return makeUnary("unary-prefix",
				prog1(S.token.value, next),
				maybeUnary(allowCalls));
		}
		var val = exprAtom(allowCalls);
		while (is("operator") && HOP(UNARY_POSTFIX, S.token.value) && !
			S.token.nlb) {
			val = makeUnary("unary-postfix", S.token.value, val);
			next();
		}
		return val;
	}

	function makeUnary(tag, op, expr) {
		if ((op === "++" || op === "--") && !isAssignable(expr)) {
			croak("Invalid use of " + op + " operator");
		}
		return as(tag, op, expr);
	}

	function exprOp(left, minPrec, noIn) {
		var op = is("operator") ? S.token.value : null;
		if (op && op === "in" && noIn) {
			op = null;
		}
		var prec = op !== null ? PRECEDENCE[op] : null;
		if (prec !== null && prec > minPrec) {
			next();
			var right = exprOp(maybeUnary(true), prec, noIn);
			return exprOp(as("binary", op, left, right), minPrec,
				noIn);
		}
		return left;
	}

	function exprOps(noIn) {
		return exprOp(maybeUnary(true), 0, noIn);
	}

	function maybeConditional(noIn) {
		var expr = exprOps(noIn);
		if (is("operator", "?")) {
			next();
			var yes = expression(false);
			expect(":");
			return as("conditional", expr, yes, expression(false,
				noIn));
		}
		return expr;
	}

	function isAssignable(expr) {
		if (!exigentMode) {
			return true;
		}
		switch (expr[0] + "") {
		case "dot":
		case "sub":
		case "new":
		case "call":
			return true;
		case "name":
			return expr[1] !== "this";
		}
	}

	function maybeAssign(noIn) {
		var left = maybeConditional(noIn),
			val = S.token.value;
		if (is("operator") && HOP(ASSIGNMENT, val)) {
			if (isAssignable(left)) {
				next();
				return as("assign", ASSIGNMENT[val], left,
					maybeAssign(noIn));
			}
			croak("Invalid assignment");
		}
		return left;
	}

	var expression = maybeEmbedTokens(function (commas, noIn) {
		if (arguments.length === 0) {
			commas = true;
		}
		var expr = maybeAssign(noIn);
		if (commas && is("punc", ",")) {
			next();
			return as("seq", expr, expression(true, noIn));
		}
		return expr;
	});

	function inLoop(cont) {
		try {
			++S.inLoop;
			return cont();
		} finally {
			--S.inLoop;
		}
	}

	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************

	var chunk = maybeEmbedTokens(function () {
		var expr;

		if (is("html")) {
			var html = S.token.value;
			next();
			return as("html", html);
		}
		if (is("tpunc", "${")) {
			next();
			expr = expression(false);
			expectToken("tpunc", "}");
			return as("tmpl-echo", expr);
		}
		if (is("tpunc", "{{")) {
			next();

			var expr1 = null;
			var expr2 = null;
			if (is("name", "each")) {
				next();

				if (is("punc", "(")) {
					next();
					expr1 = exprList(")", false, false);
				}

				// collection expression had parenthesis?
				if (is("tpunc", "}}")) {
					if (expr1 && expr1.length === 1) {
						expr2 = expr1[0];
						expr1 = null;
						next();
					} else {
						croak(
							"parse error, collection value expected"
						);
					}
				} else {
					expr2 = expression(false);
					expectToken("tpunc", "}}");
				}


				var a = [];
				while (!is("tpunc", "{{/")) {
					if (is("eof")) {
						unexpected();
					}
					a.push(chunk());
				}
				next();
				if (!is("name", "each")) {
					croak("Unmatched template tags. " +
						"expected closing {{/each}} here");
				}
				next();
				expectToken("tpunc", "}}");

				return as("tmpl-each", expr1, expr2, a);
			}

			if (is("name", "tmpl")) {
				next();
				expr1 = null;
				if (is("punc", "(")) {
					next();
					expr1 = exprList(")", false, false);
				}

				expr2 = expression();
				expectToken("tpunc", "}}");

				return as("tmpl", expr1, expr2);
			}

			if (is("keyword", "var")) {
				next();
				var var$defs = vardefs(true);
				expectToken("tpunc", "}}");
				return as("tmpl-var", var$defs);
			}

			if (is("keyword", "if")) {
				// ["if", <main>, <else ifs>, <else>] =>
				// ["if", [<expr>, <body>], [[<expr2>, [body2],...], elseBody]

				next();
				expr = expression(false);
				expectToken("tpunc", "}}");

				var body = [];

				var current = body;
				var elseIfs = [];
				var elseBody = null;

				while (!is("tpunc", "{{/")) {
					if (is("eof")) {
						unexpected();
					}

					if (is("tpunc", "{{")) {
						if (isToken(peek(), "keyword", "else")) {
							next();
							if (isToken(peek(), "tpunc", "}}")) {
								if (elseBody) {
									croak(
										"too many default {{else}} blocks"
									);
								}
								next();
								next();
								current = elseBody = [];
							} else {

								next();
								if (elseBody) {
									croak(
										"can't have {{else (...)}} with " +
										"condition after default {{else}}"
									);
								}
								var elseIfExpr = expression(false);

								var elseIfBody = [];
								var elseIf = [elseIfExpr,
									elseIfBody
								];
								current = elseIfBody;
								elseIfs.push(elseIf);
								expectToken("tpunc", "}}");
							}
						}
					}

					current.push(chunk());
				}
				next();

				if (!is("keyword", "if")) {
					croak("Unmatched template tags. " +
						"expected closing {{/if}} here");
				}
				next();
				expectToken("tpunc", "}}");

				return as("tmpl-if", [expr, body], elseIfs,
					elseBody);
			}

			if (is("name", "html")) {
				next();
				expr = expression(false);
				expectToken("tpunc", "}}");
				return as("tmpl-html", expr);
			}

			if (is("name", "layout")) {
				next();
				expr = expression(false);
				expectToken("tpunc", "}}");
				return as("tmpl-layout", expr);
			}
		}

		unexpected();

	});

	if (hasTemplateMode) {
		return as("template", (function (a) {
			while (!is("eof")) {
				a.push(chunk());
			}

			return a;
		})([]));

	} else {
		return as("toplevel", (function (a) {
			while (!is("eof")) {
				a.push(statement());
			}
			return a;
		})([]));
	}

}

/* -----[ Utilities ]----- */

function curry(f) {
	var args = slice(arguments, 1);
	return function () {
		return f.apply(this, args.concat(slice(arguments)));
	};
}

function prog1(ret) {
	if (ret instanceof Function) {
		ret = ret();
	}
	for (var i = 1, n = arguments.length; --n > 0; ++i) {
		arguments[i]();
	}
	return ret;
}

function arrayToHash(a) {
	var ret = {};
	for (var i = 0; i < a.length; ++i) {
		ret[a[i]] = true;
	}
	return ret;
}

function slice(a, start) {
	return Array.prototype.slice.call(a, start || 0);
}

function characters(str) {
	return str.split("");
}

function member(name, array) {
	for (var i = array.length; --i >= 0;) {
		if (array[i] === name) {
			return true;
		}
	}

	return false;
}

function HOP(obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
}

/* -----[ Exports ]----- */

exports.tokenizer = tokenizer;
exports.parse = parse;
exports.slice = slice;
exports.curry = curry;
exports.member = member;
exports.arrayToHash = arrayToHash;
exports.PRECEDENCE = PRECEDENCE;
exports.KEYWORDS_ATOM = KEYWORDS_ATOM;
exports.RESERVED_WORDS = RESERVED_WORDS;
exports.KEYWORDS = KEYWORDS;
exports.ATOMIC_START_TOKEN = ATOMIC_START_TOKEN;
exports.OPERATORS = OPERATORS;
exports.isAlphanumericChar = isAlphanumericChar;

},{}],4:[function(require,module,exports){
(function (process,global){
"use strict";

var util = require("util");
var events = require("events");
var parse = require("./parse-js.js").parse;

var nextTick = global.setImmediate || process.nextTick;

function name(item) {
	if (typeof item[0] === "string") {
		return item[0];
	} else {
		return item[0].name;
	}
}

function saveToken(context, element) {
	if (typeof element[0] === "string") {
		return;
	}

	var frame = context.stack[context.stack.length - 1];
	if (frame) {
		frame.lastToken = element[0];
	}
}

function render(templateName, data, options, cb) {
	var savedStack = new Error().stack;

	var output = "";
	var context = {
		getTemplate: options.getTemplate,
		templateOutputFilter: options.templateOutputFilter,
		templateRoot: options.templateRoot || "",
		templateCache: options.templateCache || {},
		write: function (string) {
			output += string;
		},
		end: function () {
			cb(null, output);
		},
		error: function (message) {
			var frameMessages = [];

			var lastTemplate;

			context.stack.forEach(function (frame, index) {
				var templateName = frame.templateName ||
					lastTemplate || "(unknown)";

				var token = null;

				if (index === context.stack.length - 1) {
					token = frame.lastToken;
				} else {
					token = frame.lastTmplToken || frame.layoutToken;
					if (!token) {
						return;
					}
				}

				var hasToken = (token && token.start);
				var line = hasToken ? token.start.line + 1 : "?";
				var col = hasToken ? token.start.col + 1 : "?";
				frameMessages.push("    at " + templateName +
					" (" + context.templateRoot + "/" +
					templateName + ":" + line + ":" + col + ")");

				lastTemplate = frame.templateName || lastTemplate;
			});

			var stackMessage = frameMessages.reverse().join("\n");
			stackMessage += "\n" + savedStack.split("\n").slice(1).join(
				"\n");

			var stackString = message + "\n" + stackMessage;
			var err = new Error(message);

			err.stack = stackString;

			return err;
		},
		stack: [{
			templateName: templateName,
			data: data,
			vars: {}
		}],
		"getParsedTemplate": function (templateName, cb) {
			var template = context.templateCache[templateName];

			if (template) {
				cb(null, template);
				return;
			} else {
				context.getTemplate(templateName, function (err, str) {
					if (err) {
						cb(context.error("cannot load template " +
							templateName + ". " + err.message
						));
						return;
					}

					try {
						template = parse(str, false, true, true);
					} catch (err) {
						var frame = context.stack[context.stack.length -
							1];
						frame.lastToken = {
							start: {
								line: err.line - 1,
								col: err.col - 1,
								pos: err.pos - 1
							}
						};

						cb(context.error("template parse error: " +
							err.message));
						return;
					}

					context.templateCache[templateName] =
						template;
					cb(null, template);
				});
			}
		}
	};

	context.getParsedTemplate(templateName, function (err, template) {
		if (err) {
			cb(err);
			return;
		}

		renderTemplate(template, context, function (err) {
			if (err) {
				cb(err);
			} else {
				cb(null, output);
			}
		});
	});
}

function renderTemplate(template, context, cb) {
	if (name(template) !== "template") {
		throw new Error("invalid template");
	}

	var elements = template[1];
	if (typeof elements !== "object") {
		throw new Error("invalid template");
	}

	/* need to capture all writes in case 
       we need to apply a layout or filter */

	var oldWrite = context.write;
	var body = "";
	context.write = function (str) {
		body += str;
	};

	var frame = context.stack[context.stack.length - 1];

	function filterResolve(name, filterCallback) {
		evaluateNameExpression(["name", name], context, filterCallback);
	}

	renderElements(elements, context, function (err) {
		if (err) {
			cb(err);
			return;
		}
		if (frame.templateName && typeof context.templateOutputFilter === "function") {
			body = context.templateOutputFilter(frame.templateName, body, filterResolve, function (err, newBody) {
				if (err) {
					cb(err);
					return;
				}

				if (typeof body !== "undefined") {
					throw new Error("Invalid templateOutputFilter, callback and function return value used.");
				}

				body = newBody;

				afterFilter();
			});

			if (typeof body !== "undefined") {
				afterFilter();
			}
		} else {
			afterFilter();
		}

		function afterFilter() {
			context.write = oldWrite;
			if (!frame.layout) {
				context.write(body);
				cb(err);
				return;
			}
			// need to render with layout
			var scope = {
				"data": frame.data,
				"templateName": frame.layout,
				"vars": {
					"$data": frame.data,
					"body": body
				}
			};

			context.stack.push(scope);

			context.getParsedTemplate(frame.layout, function (err,
				template) {
				if (err) {
					cb(err);
					return;
				}

				renderTemplate(template, context, function (err) {
					context.stack.pop();

					if (err) {
						cb(err);
					} else {
						cb(null);
					}
				});
			});
		}
		
	});
}

function renderElements(elements, context, cb) {
	if (!elements) {
		cb(null);
		return;
	}

	var didError = false;
	var i = 0;

	function next() {
		var element = elements[i];
		i++;

		if (!element) {
			cb(null);
			return;
		}

		var count = 0;

		renderElement(element, context, function (err) {
			count++;
			if (count !== 1) {
				throw new Error("render for " + name(element) +
					" had multiple callbacks");
			}

			if (didError) {
				return;
			}

			if (err) {
				didError = true;
				cb(err);
				return;
			}

			next();
		});
	}

	next();
}

function renderElement(element, context, cb) {
	saveToken(context, element);

	switch (name(element)) {
	case "html":
		context.write(element[1]);
		cb(null);
		break;
	case "tmpl-if":
		renderTmplIf(element, context, cb);
		break;
	case "tmpl-echo":
		renderTmplEcho(element, context, cb);
		break;
	case "tmpl":
		renderTmpl(element, context, cb);
		break;
	case "tmpl-each":
		renderTmplEach(element, context, cb);
		break;
	case "tmpl-html":
		renderTmplHtml(element, context, cb);
		break;
	case "tmpl-layout":
		captureLayout(element, context, cb);
		break;
	case "tmpl-var":
		storeTmplVar(element, context, cb);
		break;

	default:
		cb(new Error("unhandled element " + name(element)));
		break;
	}
}

function renderTmplIf(element, context, cb) {
	// ["tmpl-if", [expr, body], else_ifs, else_body]
	var expr = element[1][0];
	var elseIfs = element[2];

	evaluateExpression(expr, context, evaluatedExpr);

	function evaluatedExpr(err, val) {
		if (err) {
			cb(err);
			return;
		}
		// TODO: need else_ifs!
		if (val) {
			renderElements(element[1][1], context, cb);
		} else {
			nextElse(0);
		}

		function nextElse(i) {
			if (i === elseIfs.length) {
				doneElseIfs();
				return;
			}

			var condition = elseIfs[i][0];
			var body = elseIfs[i][1];

			evaluateExpression(condition, context, function (err,
				value) {
				if (err) {
					cb(err);
					return;
				}

				if (value) {
					renderElements(body, context, cb);
					return;
				}

				nextElse(i + 1);
			});
		}

		function doneElseIfs() {
			renderElements(element[3], context, cb);
		}
	}
}

function renderTmplEcho(element, context, cb) {
	// ["tmpl-echo", [expr]]
	evaluateExpression(element[1], context, function (err, value) {
		if (err) {
			cb(err);
			return;
		}

		if (typeof value !== "undefined") {
			context.write(html(value));
		}

		cb(null);
	});
}

function renderTmplHtml(element, context, cb) {
	// ["tmpl-html", [expr]]
	evaluateExpression(element[1], context, function (err, value) {
		if (err) {
			cb(err);
			return;
		}

		if (typeof value !== "undefined") {
			context.write(value);
		}

		cb(null);
	});
}

function captureLayout(element, context, cb) {
	// ["tmpl-layout", [expr]]
	evaluateExpression(element[1], context, function (err, value) {
		if (typeof value !== "string") {
			cb(context.error(
				"{{layout}} template must be a string"));
			return;
		}

		for (var i = context.stack.length - 1; i >= 0; i--) {
			if (context.stack[i].templateName) {
				context.stack[i].layout = value;
				context.stack[i].layoutToken = element[0];
				break;
			}
		}

		cb(null);
	});
}

function storeTmplVar(element, context, cb) {
	// ["tmpl-var", [[name, <expression>],..]

	var frame = context.stack[context.stack.length - 1];
	var items = element[1];

	function next(i) {
		if (i >= items.length) {
			cb(null);
			return;
		}

		evaluateExpression(items[i][1], context, function (err, value) {
			if (err) {
				cb(err);
				return;
			}

			frame.vars[items[i][0]] = value;
			next(i + 1);
		});
	}

	next(0);
}

function renderTmpl(element, context, cb) {
	// ["tmpl" [expr1,...] expr2]
	var objectValue;

	var frame = context.stack[context.stack.length - 1];
	if (typeof element[0] !== "string") {
		frame.lastTmplToken = element[0];
	} else {
		frame.lastTmplToken = {};
	}

	if (!element[1]) {
		gotObject(null, {});
	} else {
		evaluateExpression(element[1][0], context, gotObject);
	}

	function gotObject(err, obj) {
		if (err) {
			cb(err);
			return;
		}

		objectValue = obj;

		evaluateExpression(element[2], context, gotTemplateName);
	}

	function gotTemplateName(err, templateName) {
		if (err) {
			cb(err);
			return;
		}

		if (!objectValue) {
			throw new Error("no object value");
		}


		var scope = {
			"data": objectValue,
			"templateName": templateName,
			"vars": {
				"$data": objectValue
			}
		};

		context.stack.push(scope);
		context.getParsedTemplate(templateName, function (err,
			template) {
			if (err) {
				cb(err);
				return;
			}

			renderTemplate(template, context, function (err) {
				context.stack.pop();

				if (err) {
					cb(err);
				} else {
					cb(null);
				}
			});
		});
	}
}

function renderTmplEach(element, context, cb) {
	// ["tmpl-each", arguments, collection, template]

	var indexName;
	var valueName;
	var keyName;
	var elementArgs = element[1];

	var args;
	if (elementArgs) {
		args = [];
		for (var i = 0; i < elementArgs.length; i++) {
			var arg = elementArgs[i];
			if (name(arg) !== "name") {
				cb(context.error("parse error: " +
					"{{each}} arguments must be names"));
				return;
			} else {
				args[i] = arg[1];
			}
		}
	}

	indexName = args && args[0] || "$index";
	valueName = args && args[1] || "$value";
	keyName = args && args[2] || "$key";

	evaluateExpression(element[2], context, gotCollection);
	function gotCollection(err, collection) {
		if (err) {
			cb(err);
			return;
		}
		var typeString = Object.prototype.toString.call(collection);

		if (typeString === "[object Object]") {
			if (typeof collection.on === "function" &&
				typeof collection.pause === "function" &&
				typeof collection.resume === "function") {

				gotIterator(collection);
			} else if (typeof collection.iterator === "function") {
				gotIterator(collection.iterator());
			}
		} else if (typeString === "[object Array]") {
			gotIterator(new ArrayIterator(collection));
		} else {
			cb(context.error("Can't iterate over " + typeof collection));
		}
	}

	function gotIterator(iterator) {
		var index = 0;

		iterator.on("data", function (key, value) {
			iterator.pause();

			if (arguments.length === 1) {
				value = key;
				key = index;
			}

			var scope = {
				"data": value,
				"vars": {}
			};

			scope.vars[indexName] = index;
			scope.vars[valueName] = value;
			scope.vars[keyName] = key;

			context.stack.push(scope);

			renderElements(element[3], context, function (err) {
				if (err) {
					cb(err);
					return;
				}

				context.stack.pop();
				index++;

				iterator.resume();
			});
		});

		var endCalls = 0;
		iterator.on("end", function () {
			endCalls++;
			if (endCalls !== 1) {
				throw new Error("end called too many times!");
			}
			cb(null);
		});
	}
}

function evaluateExpression(expression, context, cb) {
	saveToken(context, expression);

	if (typeof expression === "string") {
		cb(null, expression);
		return;
	}

	switch (name(expression)) {
	case "dot":
		evaluateDotSubExpression(expression, context, cb);
		break;
	case "sub":
		evaluateDotSubExpression(expression, context, cb);
		break;
	case "name":
		evaluateNameExpression(expression, context, cb);
		break;
	case "call":
		evaluateCallExpression(expression, context, cb);
		break;
	case "binary":
		evaluateBinaryExpression(expression, context, cb);
		break;
	case "unary-prefix":
		evaluateUnaryPrefixExpression(expression, context, cb);
		break;
	case "array":
		evaluateArrayExpression(expression, context, cb);
		break;
	case "object":
		evaluateObjectExpression(expression, context, cb);
		break;
	case "conditional":
		evaluateConditionalExpression(expression, context, cb);
		break;
	case "string":
		cb(null, expression[1]);
		break;
	case "num":
		cb(null, expression[1]);
		break;
	case "function":
		cb(context.error("functions are not allowed within templates"));
		return;
	case "assign":
		cb(context.error("assignment is not allowed within templates"));
		return;
	default:
		cb(context.error("unhandled expression type " + name(
			expression)));
		break;
	}
}

function evaluateDotSubExpression(expression, context, cb) {
	var objectValue;

	evaluateExpression(expression[1], context, gotObject);

	function gotObject(err, obj) {
		if (err) {
			cb(err);
			return;
		}

		if (typeof obj === "undefined") {
			cb(context.error("not an object "));
			return;
		}

		objectValue = obj;

		evaluateExpression(expression[2], context, gotPropertyName);
	}

	function gotPropertyName(err, propertyName) {
		if (err) {
			cb(err);
			return;
		}

		if (typeof objectValue.get === "function") {
			objectValue.get(propertyName, cb);
		} else {
			var value = objectValue[propertyName];
			if (typeof (value) === "function") {
				value = value.bind(objectValue);
			}

			cb(null, value);
		}
	}
}

function evaluateNameExpression(expression, context, cb) {
	var name = expression[1];
	var stackIndex = context.stack.length;

	if (name === "true") {
		cb(null, true);
		return;
	}

	if (name === "false") {
		cb(null, false);
		return;
	}

	if (name === "null") {
		cb(null, null);
		return;
	}

	function nextScope() {
		stackIndex--;
		if (stackIndex < 0) {
			cb(context.error("cannot resolve name '" + name + "'"));
			return;
		}

		var scope = context.stack[stackIndex];
		if (HOP(scope.vars, name)) {
			cb(null, scope.vars[name]);
		} else if (HOP(scope.data, name)) {
			cb(null, scope.data[name]);
		} else if (typeof scope.data.get === "function") {
			scope.data.get(name, function (err, value) {
				if (err) {
					cb(err);
					return;
				}

				if (typeof value === "undefined") {
					nextScope();
				} else {
					cb(null, value);
				}
			});
		} else {
			nextScope();
		}
	}

	nextScope();
}

function evaluateCallExpression(expression, context, cb) {
	// ["call", <function>, [arguments]

	evaluateExpression(expression[1], context, gotFunction);

	function gotFunction(err, fn) {
		if (err) {
			cb(err);
			return;
		}

		var args = expression[2];
		var index = 0;
		var evaluatedArgs = [];

		function next() {
			if (index >= args.length) {
				gotArgs();
				return;
			}

			var arg = args[index];

			evaluateExpression(arg, context, gotArg);

			function gotArg(err, value) {
				if (err) {
					cb(err);
					return;
				}

				evaluatedArgs[index] = value;
				index++;
				nextTick(next);
			}
		}

		next();

		function gotArgs() {
			if (typeof (fn) !== "function") {
				cb(context.error("not a function"));
			} else {
				// if last argument of function is cb or fn, call
				// asynchronously
				var sig = signature(fn);
				var lastArg = sig.args[sig.args.length - 1];
				if ( lastArg === "cb" || lastArg === "fn") {
					evaluatedArgs.push(cb);
					fn.apply(null, evaluatedArgs)
					return;
				}

				cb(null, fn.apply(null, evaluatedArgs));
			}
		}
	}
}

function evaluateArrayExpression(expression, context, cb) {
	//["array",[<elements]]
	var elements = expression[1];
	var result = [];

	function next(i) {
		if (i >= elements.length) {
			cb(null, result);
			return;
		}

		evaluateExpression(elements[i], context, function (err, value) {
			if (err) {
				cb(err);
				return;
			}

			result[i] = value;
			next(i + 1);
		});
	}

	next(0);
}

function evaluateObjectExpression(expression, context, cb) {
	//["object",[[<key>,<value>],[<key>,<value>]]]

	var elements = expression[1];
	var result = {};

	function next(i) {
		if (i >= elements.length) {
			cb(null, result);
			return;
		}

		evaluateExpression(elements[i][1], context, function (err,
			value) {
			if (err) {
				cb(err);
				return;
			}

			var key = elements[i][0];

			result[key] = value;
			next(i + 1);
		});
	}

	next(0);
}

function evaluateBinaryExpression(expression, context, cb) {
	var operator = expression[1];
	var leftValue;

	evaluateExpression(expression[2], context, gotLeftValue);

	function gotLeftValue(err, value) {
		if (err) {
			cb(err);
			return;
		}

		leftValue = value;

		evaluateExpression(expression[3], context, gotRightValue);
	}

	function gotRightValue(err, rightValue) {
		if (err) {
			cb(err);
			return;
		}

		switch (operator) {
		case "==":
			cb(null, leftValue === rightValue);
			break;
		case "+":
			cb(null, leftValue + rightValue);
			break;
		case "-":
			cb(null, leftValue - rightValue);
			break;
		case "&":
			cb(context.error(
				"bitwise operator '&' not allowed in templates"));
			break;
		case "|":
			cb(context.error(
				"bitwise operator '|' not allowed in templates"));
			break;
		case "*":
			cb(null, leftValue * rightValue);
			break;
		case "/":
			cb(null, leftValue / rightValue);
			break;
		case "%":
			cb(null, leftValue % rightValue);
			break;
		case ">>":
			cb(context.error("bit shift operator '>>' " +
				"not allowed in templates"));
			break;
		case "<<":
			cb(context.error("bit shift operator '<<' " +
				"not allowed in templates"));
			break;
		case ">>>":
			cb(context.error("bit shift operator '>>>' " +
				"not allowed in templates"));
			break;
		case "<":
			cb(null, leftValue < rightValue);
			break;
		case ">":
			cb(null, leftValue > rightValue);
			break;
		case "<=":
			cb(null, leftValue <= rightValue);
			break;
		case ">=":
			cb(null, leftValue >= rightValue);
			break;
		case "===":
			cb(context.error(
				"'===' operator not allowed in templates. " +
				"Note that '==' is 'strictly equals' (non-casting)."
			));
			break;
		case "!=":
			cb(null, leftValue !== rightValue);
			break;
		case "!==":
			cb(context.error(
				"'!==' operator not allowed in templates. " +
				"Note that '!=' is 'strictly not equal' (non-casting)."
			));
			break;
		case "&&":
			cb(null, leftValue && rightValue);
			break;
		case "||":
			cb(null, leftValue || rightValue);
			break;
		default:
			cb(context.error("unhandled binary operator " + operator));
			break;
		}
	}
}

function evaluateConditionalExpression(expression, context, cb) {
	// ["conditional", <test>, <case true>, <case false>]

	evaluateExpression(expression[1], context, gotTest);

	function gotTest(err, value) {
		if (err) {
			cb(err);
			return;
		}

		if (value) {
			evaluateExpression(expression[2], context, cb);
		} else {
			evaluateExpression(expression[3], context, cb);
		}
	}
}

function evaluateUnaryPrefixExpression(expression, context, cb) {
	var operator = expression[1];
	evaluateExpression(expression[2], context, gotValue);

	function gotValue(err, value) {
		if (err) {
			cb(err);
			return;
		}

		switch (operator) {
		case "!":
			cb(null, !value);
			break;
		case "-":
			cb(null, -value);
			break;
		case "+":
			cb(null, +value);
			break;
		default:
			cb(context.error("unhandled unary-prefix operator " +
				operator));
			break;
		}
	}
}

function HOP(obj, prop) {
	if (!obj) {
		return false;
	} else {
		return Object.prototype.hasOwnProperty.call(obj, prop);
	}
}

function html(str) {
	return ("" + str).replace(/&|"|'|<|>/g, function (c) {
		switch (c) {
		case "&":
			return "&amp;";
		case "\"":
			return "&quot;";
		case "'":
			return "&#39;";
		case "<":
			return "&lt;";
		case ">":
			return "&gt;";
		}
	});
}

/** helper classes */


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
function ArrayIterator(array) {
	var self = this;

	self._array = array;
	self._index = 0;
	self._paused = false;
	self._done = false;

	nextTick(function () {
		self._next();
	});
}

util.inherits(ArrayIterator, events.EventEmitter);

ArrayIterator.prototype._next = function () {
	var self = this;
	if (self._done) {
		return;
	}

	if (!self._paused) {
		if (self._index >= self._array.length) {
			self._done = true;
			nextTick(function () {
				self.emit("end");
			});
			return;
		}

		var data = self._array[self._index];
		self._index++;
		self.emit("data", data);
		self._next();
	}
};

ArrayIterator.prototype.resume = function () {
	if (this._paused) {
		this._paused = false;
		this._next();
	}
};

ArrayIterator.prototype.pause = function () {
	this._paused = true;
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

exports.render = render;

}).call(this,require("Oc9zQJ"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./parse-js.js":3,"Oc9zQJ":9,"events":6,"util":11}],5:[function(require,module,exports){

},{}],6:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],7:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],8:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("Oc9zQJ"))
},{"Oc9zQJ":9}],9:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],10:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],11:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("Oc9zQJ"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":10,"Oc9zQJ":9,"inherits":7}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL21hcmsvRGV2ZWxvcG1lbnQvR3JpdC9Ob2RlTW9kdWxlcy9iY24vbGliL2NsaWVudC9icm93c2VyLmpzIiwiL1VzZXJzL21hcmsvRGV2ZWxvcG1lbnQvR3JpdC9Ob2RlTW9kdWxlcy9iY24vbm9kZV9tb2R1bGVzL2JhY29uLXRlbXBsYXRlcy9saWIvYmFjb24tdGVtcGxhdGVzLmpzIiwiL1VzZXJzL21hcmsvRGV2ZWxvcG1lbnQvR3JpdC9Ob2RlTW9kdWxlcy9iY24vbm9kZV9tb2R1bGVzL2JhY29uLXRlbXBsYXRlcy9saWIvcGFyc2UtanMuanMiLCIvVXNlcnMvbWFyay9EZXZlbG9wbWVudC9Hcml0L05vZGVNb2R1bGVzL2Jjbi9ub2RlX21vZHVsZXMvYmFjb24tdGVtcGxhdGVzL2xpYi90ZW1wbGF0ZS1yZW5kZXJlci5qcyIsIi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwiL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbmhlcml0cy9pbmhlcml0c19icm93c2VyLmpzIiwiL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wYXRoLWJyb3dzZXJpZnkvaW5kZXguanMiLCIvdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC9zdXBwb3J0L2lzQnVmZmVyQnJvd3Nlci5qcyIsIi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC91dGlsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvZ0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsb0NBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9TQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXG52YXIgcmVuZGVyID0gcmVxdWlyZShcImJhY29uLXRlbXBsYXRlc1wiKS5yZW5kZXI7XG5cbkJDTiA9IHtcblx0XCJyZW5kZXJcIjogcmVuZGVyVGVtcGxhdGVcbn07XG5cbmZ1bmN0aW9uIHJlbmRlclRlbXBsYXRlKHRlbXBsYXRlTmFtZSwgcGF0aCwgZGF0YSwgY2IpIHtcblx0XHRcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHBhcnNlID0gcmVxdWlyZShcIi4vcGFyc2UtanMuanNcIikucGFyc2U7XG52YXIgcmVuZGVyID0gcmVxdWlyZShcIi4uL2xpYi90ZW1wbGF0ZS1yZW5kZXJlci5qc1wiKS5yZW5kZXI7XG52YXIgcGF0aCA9IHJlcXVpcmUoXCJwYXRoXCIpO1xudmFyIGZzID0gcmVxdWlyZShcImZzXCIpO1xuXG5mdW5jdGlvbiBwYXJzZVRlbXBsYXRlKHN0ciwga2VlcFRva2Vucykge1xuXHR2YXIgYXN0O1xuXHR0cnkge1xuXHRcdC8vIHBhcnNlKHN0cmluZywgZXhpZ2VudF9tb2RlLCBrZWVwX3Rva2VucywgdGVtcGxhdGVfbW9kZSlcblx0XHRhc3QgPSBwYXJzZShzdHIsIGZhbHNlLCBrZWVwVG9rZW5zLCB0cnVlKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdHRocm93IGU7XG5cdH1cblx0cmV0dXJuIGFzdDtcbn1cblxuZnVuY3Rpb24gZXhwcmVzcyh0ZW1wbGF0ZVBhdGgsIG9wdGlvbnMsIGZuKSB7XG5cdHZhciB2aWV3c1BhdGggPSBvcHRpb25zLnNldHRpbmdzLnZpZXdzO1xuXHR2YXIgcmVsYXRpdmVQYXRoID0gdGVtcGxhdGVQYXRoLnN1YnN0cih2aWV3c1BhdGgubGVuZ3RoICsgMSk7XG5cblx0dmFyIHJlbmRlck9wdGlvbnMgPSB7XG5cdFx0Z2V0VGVtcGxhdGU6IGZ1bmN0aW9uICh0ZW1wbGF0ZU5hbWUsIGNiKSB7XG5cdFx0XHR2YXIgdGVtcGxhdGVQYXRoID0gcGF0aC5qb2luKHZpZXdzUGF0aCwgdGVtcGxhdGVOYW1lKTtcblx0XHRcdGZzLnJlYWRGaWxlKHRlbXBsYXRlUGF0aCwgZnVuY3Rpb24gKGVyciwgYnVmZikge1xuXHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0Y2IoZXJyKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dmFyIHN0ciA9IGJ1ZmYudG9TdHJpbmcoXCJ1dGY4XCIpO1xuXG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRjYihuZXcgRXJyb3IoXCJjb3VsZCBub3QgZmluZCB0ZW1wbGF0ZSBcIiArXG5cdFx0XHRcdFx0XHR0ZW1wbGF0ZU5hbWUpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYihudWxsLCBzdHIpO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHR0ZW1wbGF0ZVJvb3Q6IHZpZXdzUGF0aFxuXHR9O1xuXG5cdHJlbmRlcihyZWxhdGl2ZVBhdGgsIG9wdGlvbnMsIHJlbmRlck9wdGlvbnMsIGZuKTtcbn1cblxuZXhwb3J0cy5yZW5kZXIgPSByZW5kZXI7XG5leHBvcnRzLnBhcnNlVGVtcGxhdGUgPSBwYXJzZVRlbXBsYXRlO1xuZXhwb3J0cy5leHByZXNzID0gZXhwcmVzcztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcblxuICBBIEphdmFTY3JpcHQgdG9rZW5pemVyIC8gcGFyc2VyIC8gYmVhdXRpZmllciAvIGNvbXByZXNzb3IuXG5cbiAgVGhpcyB2ZXJzaW9uIGlzIHN1aXRhYmxlIGZvciBOb2RlLmpzLiAgV2l0aCBtaW5pbWFsIGNoYW5nZXMgKHRoZVxuICBleHBvcnRzIHN0dWZmKSBpdCBzaG91bGQgd29yayBvbiBhbnkgSlMgcGxhdGZvcm0uXG5cbiAgVGhpcyBmaWxlIGNvbnRhaW5zIHRoZSB0b2tlbml6ZXIvcGFyc2VyLiAgSXQgaXMgYSBwb3J0IHRvIEphdmFTY3JpcHRcbiAgb2YgcGFyc2UtanMgWzFdLCBhIEphdmFTY3JpcHQgcGFyc2VyIGxpYnJhcnkgd3JpdHRlbiBpbiBDb21tb24gTGlzcFxuICBieSBNYXJpam4gSGF2ZXJiZWtlLiAgVGhhbmsgeW91IE1hcmlqbiFcblxuICBbMV0gaHR0cDovL21hcmlqbi5oYXZlcmJla2UubmwvcGFyc2UtanMvXG5cbiAgRXhwb3J0ZWQgZnVuY3Rpb25zOlxuXG4gICAgLSB0b2tlbml6ZXIoY29kZSkgLS0gcmV0dXJucyBhIGZ1bmN0aW9uLiAgQ2FsbCB0aGUgcmV0dXJuZWRcbiAgICAgIGZ1bmN0aW9uIHRvIGZldGNoIHRoZSBuZXh0IHRva2VuLlxuXG4gICAgLSBwYXJzZShjb2RlKSAtLSByZXR1cm5zIGFuIEFTVCBvZiB0aGUgZ2l2ZW4gSmF2YVNjcmlwdCBjb2RlLlxuXG4gIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIChDKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgQXV0aG9yOiBNaWhhaSBCYXpvblxuICAgICAgICAgICAgICAgICAgICAgICAgIDxtaWhhaS5iYXpvbkBnbWFpbC5jb20+XG4gICAgICAgICAgICAgICAgICAgICAgIGh0dHA6Ly9taWhhaS5iYXpvbi5uZXQvYmxvZ1xuXG4gIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcblxuICAgIENvcHlyaWdodCAyMDEwIChjKSBNaWhhaSBCYXpvbiA8bWloYWkuYmF6b25AZ21haWwuY29tPlxuICAgIEJhc2VkIG9uIHBhcnNlLWpzIChodHRwOi8vbWFyaWpuLmhhdmVyYmVrZS5ubC9wYXJzZS1qcy8pLlxuXG4gICAgUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gICAgbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zXG4gICAgYXJlIG1ldDpcblxuICAgICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmVcbiAgICAgICAgICBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZ1xuICAgICAgICAgIGRpc2NsYWltZXIuXG5cbiAgICAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlXG4gICAgICAgICAgY29weXJpZ2h0IG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmdcbiAgICAgICAgICBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHNcbiAgICAgICAgICBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cbiAgICBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSIOKAnEFTIElT4oCdIEFORCBBTllcbiAgICBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRVxuICAgIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUlxuICAgIFBVUlBPU0UgQVJFIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIEJFXG4gICAgTElBQkxFIEZPUiBBTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLFxuICAgIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sXG4gICAgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUzsgTE9TUyBPRiBVU0UsIERBVEEsIE9SXG4gICAgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT04gQU5ZXG4gICAgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1JcbiAgICBUT1JUIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0ZcbiAgICBUSEUgVVNFIE9GIFRISVMgU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0ZcbiAgICBTVUNIIERBTUFHRS5cblxuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4vKiAtLS0tLVsgVG9rZW5pemVyIChjb25zdGFudHMpIF0tLS0tLSAqL1xuXG52YXIgS0VZV09SRFMgPSBhcnJheVRvSGFzaChbXG5cdFwiYnJlYWtcIixcblx0XCJjYXNlXCIsXG5cdFwiY2F0Y2hcIixcblx0XCJjb25zdFwiLFxuXHRcImNvbnRpbnVlXCIsXG5cdFwiZGVidWdnZXJcIixcblx0XCJkZWZhdWx0XCIsXG5cdFwiZGVsZXRlXCIsXG5cdFwiZG9cIixcblx0XCJlbHNlXCIsXG5cdFwiZmluYWxseVwiLFxuXHRcImZvclwiLFxuXHRcImZ1bmN0aW9uXCIsXG5cdFwiaWZcIixcblx0XCJpblwiLFxuXHRcImluc3RhbmNlb2ZcIixcblx0XCJuZXdcIixcblx0XCJyZXR1cm5cIixcblx0XCJzd2l0Y2hcIixcblx0XCJ0aHJvd1wiLFxuXHRcInRyeVwiLFxuXHRcInR5cGVvZlwiLFxuXHRcInZhclwiLFxuXHRcInZvaWRcIixcblx0XCJ3aGlsZVwiLFxuXHRcIndpdGhcIlxuXSk7XG5cbnZhciBSRVNFUlZFRF9XT1JEUyA9IGFycmF5VG9IYXNoKFtcblx0XCJhYnN0cmFjdFwiLFxuXHRcImJvb2xlYW5cIixcblx0XCJieXRlXCIsXG5cdFwiY2hhclwiLFxuXHRcImNsYXNzXCIsXG5cdFwiZG91YmxlXCIsXG5cdFwiZW51bVwiLFxuXHRcImV4cG9ydFwiLFxuXHRcImV4dGVuZHNcIixcblx0XCJmaW5hbFwiLFxuXHRcImZsb2F0XCIsXG5cdFwiZ290b1wiLFxuXHRcImltcGxlbWVudHNcIixcblx0XCJpbXBvcnRcIixcblx0XCJpbnRcIixcblx0XCJpbnRlcmZhY2VcIixcblx0XCJsb25nXCIsXG5cdFwibmF0aXZlXCIsXG5cdFwicGFja2FnZVwiLFxuXHRcInByaXZhdGVcIixcblx0XCJwcm90ZWN0ZWRcIixcblx0XCJwdWJsaWNcIixcblx0XCJzaG9ydFwiLFxuXHRcInN0YXRpY1wiLFxuXHRcInN1cGVyXCIsXG5cdFwic3luY2hyb25pemVkXCIsXG5cdFwidGhyb3dzXCIsXG5cdFwidHJhbnNpZW50XCIsXG5cdFwidm9sYXRpbGVcIlxuXSk7XG5cbnZhciBLRVlXT1JEU19CRUZPUkVfRVhQUkVTU0lPTiA9IGFycmF5VG9IYXNoKFtcblx0XCJyZXR1cm5cIixcblx0XCJuZXdcIixcblx0XCJkZWxldGVcIixcblx0XCJ0aHJvd1wiLFxuXHRcImVsc2VcIixcblx0XCJjYXNlXCJcbl0pO1xuXG52YXIgS0VZV09SRFNfQVRPTSA9IGFycmF5VG9IYXNoKFtcblx0XCJmYWxzZVwiLFxuXHRcIm51bGxcIixcblx0XCJ0cnVlXCIsXG5cdFwidW5kZWZpbmVkXCJcbl0pO1xuXG52YXIgT1BFUkFUT1JfQ0hBUlMgPSBhcnJheVRvSGFzaChjaGFyYWN0ZXJzKFwiKy0qJiU9PD4hP3x+XlwiKSk7XG5cbnZhciBSRV9IRVhfTlVNQkVSID0gL14weFswLTlhLWZdKyQvaTtcbnZhciBSRV9PQ1RfTlVNQkVSID0gL14wWzAtN10rJC87XG52YXIgUkVfREVDX05VTUJFUiA9IC9eXFxkKlxcLj9cXGQqKD86ZVsrLV0/XFxkKig/OlxcZFxcLj98XFwuP1xcZClcXGQqKT8kL2k7XG5cbnZhciBPUEVSQVRPUlMgPSBhcnJheVRvSGFzaChbXG5cdFwiaW5cIixcblx0XCJpbnN0YW5jZW9mXCIsXG5cdFwidHlwZW9mXCIsXG5cdFwibmV3XCIsXG5cdFwidm9pZFwiLFxuXHRcImRlbGV0ZVwiLFxuXHRcIisrXCIsXG5cdFwiLS1cIixcblx0XCIrXCIsXG5cdFwiLVwiLFxuXHRcIiFcIixcblx0XCJ+XCIsXG5cdFwiJlwiLFxuXHRcInxcIixcblx0XCJeXCIsXG5cdFwiKlwiLFxuXHRcIi9cIixcblx0XCIlXCIsXG5cdFwiPj5cIixcblx0XCI8PFwiLFxuXHRcIj4+PlwiLFxuXHRcIjxcIixcblx0XCI+XCIsXG5cdFwiPD1cIixcblx0XCI+PVwiLFxuXHRcIj09XCIsXG5cdFwiPT09XCIsXG5cdFwiIT1cIixcblx0XCIhPT1cIixcblx0XCI/XCIsXG5cdFwiPVwiLFxuXHRcIis9XCIsXG5cdFwiLT1cIixcblx0XCIvPVwiLFxuXHRcIio9XCIsXG5cdFwiJT1cIixcblx0XCI+Pj1cIixcblx0XCI8PD1cIixcblx0XCI+Pj49XCIsXG5cdFwifD1cIixcblx0XCJePVwiLFxuXHRcIiY9XCIsXG5cdFwiJiZcIixcblx0XCJ8fFwiXG5dKTtcblxudmFyIFRFTVBMQVRFX1NUQVJUX0NPTU1BTkRTID0gYXJyYXlUb0hhc2goW1xuXHRcImVhY2hcIixcblx0XCJpZlwiLFxuXHRcImVsc2VcIixcblx0XCJ0bXBsXCIsXG5cdFwidmVyYmF0aW1cIixcblx0XCJodG1sXCIsXG5cdFwibGF5b3V0XCIsXG5cdFwidmFyXCIsXG5cdFwiIVwiXG5dKTtcblxudmFyIFRFTVBMQVRFX0VORF9DT01NQU5EUyA9IGFycmF5VG9IYXNoKFtcblx0XCJlYWNoXCIsXG5cdFwiaWZcIixcblx0XCJ2ZXJiYXRpbVwiXG5dKTtcblxudmFyIFdISVRFU1BBQ0VfQ0hBUlMgPSBhcnJheVRvSGFzaChjaGFyYWN0ZXJzKFxuXHRbXG5cdFx0XCIgXFx1MDBhMFxcblxcclxcdFxcZlxcdTAwMGJcXHUyMDBiXFx1MTgwZVxcdTIwMDBcXHUyMDAxXFx1MjAwMlxcdTIwMDNcXHUyMDA0XCIsXG5cdFx0XCJcXHUyMDA1XFx1MjAwNlxcdTIwMDdcXHUyMDA4XFx1MjAwOVxcdTIwMGFcXHUyMDJmXFx1MjA1ZlxcdTMwMDBcIlxuXHRdLmpvaW4oXCJcIilcbikpO1xuXG52YXIgUFVOQ19CRUZPUkVfRVhQUkVTU0lPTiA9IGFycmF5VG9IYXNoKGNoYXJhY3RlcnMoXCJbeygsLjs6XCIpKTtcblxudmFyIFBVTkNfQ0hBUlMgPSBhcnJheVRvSGFzaChjaGFyYWN0ZXJzKFwiW117fSgpLDs6XCIpKTtcblxuLyogLS0tLS1bIFRva2VuaXplciBdLS0tLS0gKi9cblxuLy8gcmVnZXhwcyBhZGFwdGVkIGZyb20gaHR0cDovL3hyZWdleHAuY29tL3BsdWdpbnMvI3VuaWNvZGVcbnZhciBVTklDT0RFID0ge1xuXHRsZXR0ZXI6IG5ldyBSZWdFeHAoW1xuXHRcdFwiW1xcXFx1MDA0MS1cXFxcdTAwNUFcXFxcdTAwNjEtXFxcXHUwMDdBXFxcXHUwMEFBXFxcXHUwMEI1XFxcXHUwMEJBXFxcXHUwMENcIixcblx0XHRcIjAtXFxcXHUwMEQ2XFxcXHUwMEQ4LVxcXFx1MDBGNlxcXFx1MDBGOC1cXFxcdTAyQzFcXFxcdTAyQzYtXFxcXHUwMkQxXFxcXHUwXCIsXG5cdFx0XCIyRTAtXFxcXHUwMkU0XFxcXHUwMkVDXFxcXHUwMkVFXFxcXHUwMzcwLVxcXFx1MDM3NFxcXFx1MDM3NlxcXFx1MDM3N1xcXFx1MFwiLFxuXHRcdFwiMzdBLVxcXFx1MDM3RFxcXFx1MDM4NlxcXFx1MDM4OC1cXFxcdTAzOEFcXFxcdTAzOENcXFxcdTAzOEUtXFxcXHUwM0ExXFxcXHVcIixcblx0XHRcIjAzQTMtXFxcXHUwM0Y1XFxcXHUwM0Y3LVxcXFx1MDQ4MVxcXFx1MDQ4QS1cXFxcdTA1MjNcXFxcdTA1MzEtXFxcXHUwNTU2XCIsXG5cdFx0XCJcXFxcdTA1NTlcXFxcdTA1NjEtXFxcXHUwNTg3XFxcXHUwNUQwLVxcXFx1MDVFQVxcXFx1MDVGMC1cXFxcdTA1RjJcXFxcdTA2MlwiLFxuXHRcdFwiMS1cXFxcdTA2NEFcXFxcdTA2NkVcXFxcdTA2NkZcXFxcdTA2NzEtXFxcXHUwNkQzXFxcXHUwNkQ1XFxcXHUwNkU1XFxcXHUwNkVcIixcblx0XHRcIjZcXFxcdTA2RUVcXFxcdTA2RUZcXFxcdTA2RkEtXFxcXHUwNkZDXFxcXHUwNkZGXFxcXHUwNzEwXFxcXHUwNzEyLVxcXFx1MDcyXCIsXG5cdFx0XCJGXFxcXHUwNzRELVxcXFx1MDdBNVxcXFx1MDdCMVxcXFx1MDdDQS1cXFxcdTA3RUFcXFxcdTA3RjRcXFxcdTA3RjVcXFxcdTA3RlwiLFxuXHRcdFwiQVxcXFx1MDkwNC1cXFxcdTA5MzlcXFxcdTA5M0RcXFxcdTA5NTBcXFxcdTA5NTgtXFxcXHUwOTYxXFxcXHUwOTcxXFxcXHUwOTdcIixcblx0XHRcIjJcXFxcdTA5N0ItXFxcXHUwOTdGXFxcXHUwOTg1LVxcXFx1MDk4Q1xcXFx1MDk4RlxcXFx1MDk5MFxcXFx1MDk5My1cXFxcdTA5XCIsXG5cdFx0XCJBOFxcXFx1MDlBQS1cXFxcdTA5QjBcXFxcdTA5QjJcXFxcdTA5QjYtXFxcXHUwOUI5XFxcXHUwOUJEXFxcXHUwOUNFXFxcXHUwOVwiLFxuXHRcdFwiRENcXFxcdTA5RERcXFxcdTA5REYtXFxcXHUwOUUxXFxcXHUwOUYwXFxcXHUwOUYxXFxcXHUwQTA1LVxcXFx1MEEwQVxcXFx1MEFcIixcblx0XHRcIjBGXFxcXHUwQTEwXFxcXHUwQTEzLVxcXFx1MEEyOFxcXFx1MEEyQS1cXFxcdTBBMzBcXFxcdTBBMzJcXFxcdTBBMzNcXFxcdTBBXCIsXG5cdFx0XCIzNVxcXFx1MEEzNlxcXFx1MEEzOFxcXFx1MEEzOVxcXFx1MEE1OS1cXFxcdTBBNUNcXFxcdTBBNUVcXFxcdTBBNzItXFxcXHUwQVwiLFxuXHRcdFwiNzRcXFxcdTBBODUtXFxcXHUwQThEXFxcXHUwQThGLVxcXFx1MEE5MVxcXFx1MEE5My1cXFxcdTBBQThcXFxcdTBBQUEtXFxcXHVcIixcblx0XHRcIjBBQjBcXFxcdTBBQjJcXFxcdTBBQjNcXFxcdTBBQjUtXFxcXHUwQUI5XFxcXHUwQUJEXFxcXHUwQUQwXFxcXHUwQUUwXFxcXHUwXCIsXG5cdFx0XCJBRTFcXFxcdTBCMDUtXFxcXHUwQjBDXFxcXHUwQjBGXFxcXHUwQjEwXFxcXHUwQjEzLVxcXFx1MEIyOFxcXFx1MEIyQS1cXFxcdVwiLFxuXHRcdFwiMEIzMFxcXFx1MEIzMlxcXFx1MEIzM1xcXFx1MEIzNS1cXFxcdTBCMzlcXFxcdTBCM0RcXFxcdTBCNUNcXFxcdTBCNURcXFxcdTBcIixcblx0XHRcIkI1Ri1cXFxcdTBCNjFcXFxcdTBCNzFcXFxcdTBCODNcXFxcdTBCODUtXFxcXHUwQjhBXFxcXHUwQjhFLVxcXFx1MEI5MFxcXFx1XCIsXG5cdFx0XCIwQjkyLVxcXFx1MEI5NVxcXFx1MEI5OVxcXFx1MEI5QVxcXFx1MEI5Q1xcXFx1MEI5RVxcXFx1MEI5RlxcXFx1MEJBM1xcXFx1MFwiLFxuXHRcdFwiQkE0XFxcXHUwQkE4LVxcXFx1MEJBQVxcXFx1MEJBRS1cXFxcdTBCQjlcXFxcdTBCRDBcXFxcdTBDMDUtXFxcXHUwQzBDXFxcXHVcIixcblx0XHRcIjBDMEUtXFxcXHUwQzEwXFxcXHUwQzEyLVxcXFx1MEMyOFxcXFx1MEMyQS1cXFxcdTBDMzNcXFxcdTBDMzUtXFxcXHUwQzM5XCIsXG5cdFx0XCJcXFxcdTBDM0RcXFxcdTBDNThcXFxcdTBDNTlcXFxcdTBDNjBcXFxcdTBDNjFcXFxcdTBDODUtXFxcXHUwQzhDXFxcXHUwQzhFLVwiLFxuXHRcdFwiXFxcXHUwQzkwXFxcXHUwQzkyLVxcXFx1MENBOFxcXFx1MENBQS1cXFxcdTBDQjNcXFxcdTBDQjUtXFxcXHUwQ0I5XFxcXHUwQ0JcIixcblx0XHRcIkRcXFxcdTBDREVcXFxcdTBDRTBcXFxcdTBDRTFcXFxcdTBEMDUtXFxcXHUwRDBDXFxcXHUwRDBFLVxcXFx1MEQxMFxcXFx1MEQxXCIsXG5cdFx0XCIyLVxcXFx1MEQyOFxcXFx1MEQyQS1cXFxcdTBEMzlcXFxcdTBEM0RcXFxcdTBENjBcXFxcdTBENjFcXFxcdTBEN0EtXFxcXHUwRFwiLFxuXHRcdFwiN0ZcXFxcdTBEODUtXFxcXHUwRDk2XFxcXHUwRDlBLVxcXFx1MERCMVxcXFx1MERCMy1cXFxcdTBEQkJcXFxcdTBEQkRcXFxcdTBcIixcblx0XHRcIkRDMC1cXFxcdTBEQzZcXFxcdTBFMDEtXFxcXHUwRTMwXFxcXHUwRTMyXFxcXHUwRTMzXFxcXHUwRTQwLVxcXFx1MEU0NlxcXFx1XCIsXG5cdFx0XCIwRTgxXFxcXHUwRTgyXFxcXHUwRTg0XFxcXHUwRTg3XFxcXHUwRTg4XFxcXHUwRThBXFxcXHUwRThEXFxcXHUwRTk0LVxcXFx1MFwiLFxuXHRcdFwiRTk3XFxcXHUwRTk5LVxcXFx1MEU5RlxcXFx1MEVBMS1cXFxcdTBFQTNcXFxcdTBFQTVcXFxcdTBFQTdcXFxcdTBFQUFcXFxcdTBcIixcblx0XHRcIkVBQlxcXFx1MEVBRC1cXFxcdTBFQjBcXFxcdTBFQjJcXFxcdTBFQjNcXFxcdTBFQkRcXFxcdTBFQzAtXFxcXHUwRUM0XFxcXHUwXCIsXG5cdFx0XCJFQzZcXFxcdTBFRENcXFxcdTBFRERcXFxcdTBGMDBcXFxcdTBGNDAtXFxcXHUwRjQ3XFxcXHUwRjQ5LVxcXFx1MEY2Q1xcXFx1MFwiLFxuXHRcdFwiRjg4LVxcXFx1MEY4QlxcXFx1MTAwMC1cXFxcdTEwMkFcXFxcdTEwM0ZcXFxcdTEwNTAtXFxcXHUxMDU1XFxcXHUxMDVBLVxcXFxcIixcblx0XHRcInUxMDVEXFxcXHUxMDYxXFxcXHUxMDY1XFxcXHUxMDY2XFxcXHUxMDZFLVxcXFx1MTA3MFxcXFx1MTA3NS1cXFxcdTEwODFcXFxcXCIsXG5cdFx0XCJ1MTA4RVxcXFx1MTBBMC1cXFxcdTEwQzVcXFxcdTEwRDAtXFxcXHUxMEZBXFxcXHUxMEZDXFxcXHUxMTAwLVxcXFx1MTE1OVwiLFxuXHRcdFwiXFxcXHUxMTVGLVxcXFx1MTFBMlxcXFx1MTFBOC1cXFxcdTExRjlcXFxcdTEyMDAtXFxcXHUxMjQ4XFxcXHUxMjRBLVxcXFx1MTJcIixcblx0XHRcIjREXFxcXHUxMjUwLVxcXFx1MTI1NlxcXFx1MTI1OFxcXFx1MTI1QS1cXFxcdTEyNURcXFxcdTEyNjAtXFxcXHUxMjg4XFxcXHUxXCIsXG5cdFx0XCIyOEEtXFxcXHUxMjhEXFxcXHUxMjkwLVxcXFx1MTJCMFxcXFx1MTJCMi1cXFxcdTEyQjVcXFxcdTEyQjgtXFxcXHUxMkJFXFxcXFwiLFxuXHRcdFwidTEyQzBcXFxcdTEyQzItXFxcXHUxMkM1XFxcXHUxMkM4LVxcXFx1MTJENlxcXFx1MTJEOC1cXFxcdTEzMTBcXFxcdTEzMTItXCIsXG5cdFx0XCJcXFxcdTEzMTVcXFxcdTEzMTgtXFxcXHUxMzVBXFxcXHUxMzgwLVxcXFx1MTM4RlxcXFx1MTNBMC1cXFxcdTEzRjRcXFxcdTE0MFwiLFxuXHRcdFwiMS1cXFxcdTE2NkNcXFxcdTE2NkYtXFxcXHUxNjc2XFxcXHUxNjgxLVxcXFx1MTY5QVxcXFx1MTZBMC1cXFxcdTE2RUFcXFxcdTFcIixcblx0XHRcIjcwMC1cXFxcdTE3MENcXFxcdTE3MEUtXFxcXHUxNzExXFxcXHUxNzIwLVxcXFx1MTczMVxcXFx1MTc0MC1cXFxcdTE3NTFcXFxcXCIsXG5cdFx0XCJ1MTc2MC1cXFxcdTE3NkNcXFxcdTE3NkUtXFxcXHUxNzcwXFxcXHUxNzgwLVxcXFx1MTdCM1xcXFx1MTdEN1xcXFx1MTdEQ1wiLFxuXHRcdFwiXFxcXHUxODIwLVxcXFx1MTg3N1xcXFx1MTg4MC1cXFxcdTE4QThcXFxcdTE4QUFcXFxcdTE5MDAtXFxcXHUxOTFDXFxcXHUxOTVcIixcblx0XHRcIjAtXFxcXHUxOTZEXFxcXHUxOTcwLVxcXFx1MTk3NFxcXFx1MTk4MC1cXFxcdTE5QTlcXFxcdTE5QzEtXFxcXHUxOUM3XFxcXHUxXCIsXG5cdFx0XCJBMDAtXFxcXHUxQTE2XFxcXHUxQjA1LVxcXFx1MUIzM1xcXFx1MUI0NS1cXFxcdTFCNEJcXFxcdTFCODMtXFxcXHUxQkEwXFxcXFwiLFxuXHRcdFwidTFCQUVcXFxcdTFCQUZcXFxcdTFDMDAtXFxcXHUxQzIzXFxcXHUxQzRELVxcXFx1MUM0RlxcXFx1MUM1QS1cXFxcdTFDN0RcIixcblx0XHRcIlxcXFx1MUQwMC1cXFxcdTFEQkZcXFxcdTFFMDAtXFxcXHUxRjE1XFxcXHUxRjE4LVxcXFx1MUYxRFxcXFx1MUYyMC1cXFxcdTFGXCIsXG5cdFx0XCI0NVxcXFx1MUY0OC1cXFxcdTFGNERcXFxcdTFGNTAtXFxcXHUxRjU3XFxcXHUxRjU5XFxcXHUxRjVCXFxcXHUxRjVEXFxcXHUxRlwiLFxuXHRcdFwiNUYtXFxcXHUxRjdEXFxcXHUxRjgwLVxcXFx1MUZCNFxcXFx1MUZCNi1cXFxcdTFGQkNcXFxcdTFGQkVcXFxcdTFGQzItXFxcXHVcIixcblx0XHRcIjFGQzRcXFxcdTFGQzYtXFxcXHUxRkNDXFxcXHUxRkQwLVxcXFx1MUZEM1xcXFx1MUZENi1cXFxcdTFGREJcXFxcdTFGRTAtXCIsXG5cdFx0XCJcXFxcdTFGRUNcXFxcdTFGRjItXFxcXHUxRkY0XFxcXHUxRkY2LVxcXFx1MUZGQ1xcXFx1MjA3MVxcXFx1MjA3RlxcXFx1MjA5MFwiLFxuXHRcdFwiLVxcXFx1MjA5NFxcXFx1MjEwMlxcXFx1MjEwN1xcXFx1MjEwQS1cXFxcdTIxMTNcXFxcdTIxMTVcXFxcdTIxMTktXFxcXHUyMTFcIixcblx0XHRcIkRcXFxcdTIxMjRcXFxcdTIxMjZcXFxcdTIxMjhcXFxcdTIxMkEtXFxcXHUyMTJEXFxcXHUyMTJGLVxcXFx1MjEzOVxcXFx1MjEzXCIsXG5cdFx0XCJDLVxcXFx1MjEzRlxcXFx1MjE0NS1cXFxcdTIxNDlcXFxcdTIxNEVcXFxcdTIxODNcXFxcdTIxODRcXFxcdTJDMDAtXFxcXHUyQ1wiLFxuXHRcdFwiMkVcXFxcdTJDMzAtXFxcXHUyQzVFXFxcXHUyQzYwLVxcXFx1MkM2RlxcXFx1MkM3MS1cXFxcdTJDN0RcXFxcdTJDODAtXFxcXHVcIixcblx0XHRcIjJDRTRcXFxcdTJEMDAtXFxcXHUyRDI1XFxcXHUyRDMwLVxcXFx1MkQ2NVxcXFx1MkQ2RlxcXFx1MkQ4MC1cXFxcdTJEOTZcXFxcXCIsXG5cdFx0XCJ1MkRBMC1cXFxcdTJEQTZcXFxcdTJEQTgtXFxcXHUyREFFXFxcXHUyREIwLVxcXFx1MkRCNlxcXFx1MkRCOC1cXFxcdTJEQkVcIixcblx0XHRcIlxcXFx1MkRDMC1cXFxcdTJEQzZcXFxcdTJEQzgtXFxcXHUyRENFXFxcXHUyREQwLVxcXFx1MkRENlxcXFx1MkREOC1cXFxcdTJEXCIsXG5cdFx0XCJERVxcXFx1MkUyRlxcXFx1MzAwNVxcXFx1MzAwNlxcXFx1MzAzMS1cXFxcdTMwMzVcXFxcdTMwM0JcXFxcdTMwM0NcXFxcdTMwNFwiLFxuXHRcdFwiMS1cXFxcdTMwOTZcXFxcdTMwOUQtXFxcXHUzMDlGXFxcXHUzMEExLVxcXFx1MzBGQVxcXFx1MzBGQy1cXFxcdTMwRkZcXFxcdTNcIixcblx0XHRcIjEwNS1cXFxcdTMxMkRcXFxcdTMxMzEtXFxcXHUzMThFXFxcXHUzMUEwLVxcXFx1MzFCN1xcXFx1MzFGMC1cXFxcdTMxRkZcXFxcXCIsXG5cdFx0XCJ1MzQwMFxcXFx1NERCNVxcXFx1NEUwMFxcXFx1OUZDM1xcXFx1QTAwMC1cXFxcdUE0OENcXFxcdUE1MDAtXFxcXHVBNjBDXFxcXFwiLFxuXHRcdFwidUE2MTAtXFxcXHVBNjFGXFxcXHVBNjJBXFxcXHVBNjJCXFxcXHVBNjQwLVxcXFx1QTY1RlxcXFx1QTY2Mi1cXFxcdUE2NkVcIixcblx0XHRcIlxcXFx1QTY3Ri1cXFxcdUE2OTdcXFxcdUE3MTctXFxcXHVBNzFGXFxcXHVBNzIyLVxcXFx1QTc4OFxcXFx1QTc4QlxcXFx1QTc4XCIsXG5cdFx0XCJDXFxcXHVBN0ZCLVxcXFx1QTgwMVxcXFx1QTgwMy1cXFxcdUE4MDVcXFxcdUE4MDctXFxcXHVBODBBXFxcXHVBODBDLVxcXFx1QVwiLFxuXHRcdFwiODIyXFxcXHVBODQwLVxcXFx1QTg3M1xcXFx1QTg4Mi1cXFxcdUE4QjNcXFxcdUE5MEEtXFxcXHVBOTI1XFxcXHVBOTMwLVxcXFxcIixcblx0XHRcInVBOTQ2XFxcXHVBQTAwLVxcXFx1QUEyOFxcXFx1QUE0MC1cXFxcdUFBNDJcXFxcdUFBNDQtXFxcXHVBQTRCXFxcXHVBQzAwXCIsXG5cdFx0XCJcXFxcdUQ3QTNcXFxcdUY5MDAtXFxcXHVGQTJEXFxcXHVGQTMwLVxcXFx1RkE2QVxcXFx1RkE3MC1cXFxcdUZBRDlcXFxcdUZCMFwiLFxuXHRcdFwiMC1cXFxcdUZCMDZcXFxcdUZCMTMtXFxcXHVGQjE3XFxcXHVGQjFEXFxcXHVGQjFGLVxcXFx1RkIyOFxcXFx1RkIyQS1cXFxcdUZcIixcblx0XHRcIkIzNlxcXFx1RkIzOC1cXFxcdUZCM0NcXFxcdUZCM0VcXFxcdUZCNDBcXFxcdUZCNDFcXFxcdUZCNDNcXFxcdUZCNDRcXFxcdUZCXCIsXG5cdFx0XCI0Ni1cXFxcdUZCQjFcXFxcdUZCRDMtXFxcXHVGRDNEXFxcXHVGRDUwLVxcXFx1RkQ4RlxcXFx1RkQ5Mi1cXFxcdUZEQzdcXFxcdVwiLFxuXHRcdFwiRkRGMC1cXFxcdUZERkJcXFxcdUZFNzAtXFxcXHVGRTc0XFxcXHVGRTc2LVxcXFx1RkVGQ1xcXFx1RkYyMS1cXFxcdUZGM0FcIixcblx0XHRcIlxcXFx1RkY0MS1cXFxcdUZGNUFcXFxcdUZGNjYtXFxcXHVGRkJFXFxcXHVGRkMyLVxcXFx1RkZDN1xcXFx1RkZDQS1cXFxcdUZGXCIsXG5cdFx0XCJDRlxcXFx1RkZEMi1cXFxcdUZGRDdcXFxcdUZGREEtXFxcXHVGRkRDXVwiXG5cdF0uam9pbihcIlwiKSksXG5cdG5vblNwYWNpbmdNYXJrOiBuZXcgUmVnRXhwKFtcblx0XHRcIltcXFxcdTAzMDAtXFxcXHUwMzZGXFxcXHUwNDgzLVxcXFx1MDQ4N1xcXFx1MDU5MS1cXFxcdTA1QkRcXFxcdTA1QkZcXFxcdTA1XCIsXG5cdFx0XCJDMVxcXFx1MDVDMlxcXFx1MDVDNFxcXFx1MDVDNVxcXFx1MDVDN1xcXFx1MDYxMC1cXFxcdTA2MUFcXFxcdTA2NEItXFxcXHUwNlwiLFxuXHRcdFwiNUVcXFxcdTA2NzBcXFxcdTA2RDYtXFxcXHUwNkRDXFxcXHUwNkRGLVxcXFx1MDZFNFxcXFx1MDZFN1xcXFx1MDZFOFxcXFx1MDZcIixcblx0XHRcIkVBLVxcXFx1MDZFRFxcXFx1MDcxMVxcXFx1MDczMC1cXFxcdTA3NEFcXFxcdTA3QTYtXFxcXHUwN0IwXFxcXHUwN0VCLVxcXFx1XCIsXG5cdFx0XCIwN0YzXFxcXHUwODE2LVxcXFx1MDgxOVxcXFx1MDgxQi1cXFxcdTA4MjNcXFxcdTA4MjUtXFxcXHUwODI3XFxcXHUwODI5LVwiLFxuXHRcdFwiXFxcXHUwODJEXFxcXHUwOTAwLVxcXFx1MDkwMlxcXFx1MDkzQ1xcXFx1MDk0MS1cXFxcdTA5NDhcXFxcdTA5NERcXFxcdTA5NTFcIixcblx0XHRcIi1cXFxcdTA5NTVcXFxcdTA5NjJcXFxcdTA5NjNcXFxcdTA5ODFcXFxcdTA5QkNcXFxcdTA5QzEtXFxcXHUwOUM0XFxcXHUwOUNEXCIsXG5cdFx0XCJcXFxcdTA5RTJcXFxcdTA5RTNcXFxcdTBBMDFcXFxcdTBBMDJcXFxcdTBBM0NcXFxcdTBBNDFcXFxcdTBBNDJcXFxcdTBBNDdcXFxcXCIsXG5cdFx0XCJ1MEE0OFxcXFx1MEE0Qi1cXFxcdTBBNERcXFxcdTBBNTFcXFxcdTBBNzBcXFxcdTBBNzFcXFxcdTBBNzVcXFxcdTBBODFcXFxcdVwiLFxuXHRcdFwiMEE4MlxcXFx1MEFCQ1xcXFx1MEFDMS1cXFxcdTBBQzVcXFxcdTBBQzdcXFxcdTBBQzhcXFxcdTBBQ0RcXFxcdTBBRTJcXFxcdTBcIixcblx0XHRcIkFFM1xcXFx1MEIwMVxcXFx1MEIzQ1xcXFx1MEIzRlxcXFx1MEI0MS1cXFxcdTBCNDRcXFxcdTBCNERcXFxcdTBCNTZcXFxcdTBCXCIsXG5cdFx0XCI2MlxcXFx1MEI2M1xcXFx1MEI4MlxcXFx1MEJDMFxcXFx1MEJDRFxcXFx1MEMzRS1cXFxcdTBDNDBcXFxcdTBDNDYtXFxcXHUwQ1wiLFxuXHRcdFwiNDhcXFxcdTBDNEEtXFxcXHUwQzREXFxcXHUwQzU1XFxcXHUwQzU2XFxcXHUwQzYyXFxcXHUwQzYzXFxcXHUwQ0JDXFxcXHUwQ0JcIixcblx0XHRcIkZcXFxcdTBDQzZcXFxcdTBDQ0NcXFxcdTBDQ0RcXFxcdTBDRTJcXFxcdTBDRTNcXFxcdTBENDEtXFxcXHUwRDQ0XFxcXHUwRDREXCIsXG5cdFx0XCJcXFxcdTBENjJcXFxcdTBENjNcXFxcdTBEQ0FcXFxcdTBERDItXFxcXHUwREQ0XFxcXHUwREQ2XFxcXHUwRTMxXFxcXHUwRTM0LVwiLFxuXHRcdFwiXFxcXHUwRTNBXFxcXHUwRTQ3LVxcXFx1MEU0RVxcXFx1MEVCMVxcXFx1MEVCNC1cXFxcdTBFQjlcXFxcdTBFQkJcXFxcdTBFQkNcIixcblx0XHRcIlxcXFx1MEVDOC1cXFxcdTBFQ0RcXFxcdTBGMThcXFxcdTBGMTlcXFxcdTBGMzVcXFxcdTBGMzdcXFxcdTBGMzlcXFxcdTBGNzEtXCIsXG5cdFx0XCJcXFxcdTBGN0VcXFxcdTBGODAtXFxcXHUwRjg0XFxcXHUwRjg2XFxcXHUwRjg3XFxcXHUwRjkwLVxcXFx1MEY5N1xcXFx1MEY5OVwiLFxuXHRcdFwiLVxcXFx1MEZCQ1xcXFx1MEZDNlxcXFx1MTAyRC1cXFxcdTEwMzBcXFxcdTEwMzItXFxcXHUxMDM3XFxcXHUxMDM5XFxcXHUxMDNcIixcblx0XHRcIkFcXFxcdTEwM0RcXFxcdTEwM0VcXFxcdTEwNThcXFxcdTEwNTlcXFxcdTEwNUUtXFxcXHUxMDYwXFxcXHUxMDcxLVxcXFx1MTA3XCIsXG5cdFx0XCI0XFxcXHUxMDgyXFxcXHUxMDg1XFxcXHUxMDg2XFxcXHUxMDhEXFxcXHUxMDlEXFxcXHUxMzVGXFxcXHUxNzEyLVxcXFx1MTcxNFwiLFxuXHRcdFwiXFxcXHUxNzMyLVxcXFx1MTczNFxcXFx1MTc1MlxcXFx1MTc1M1xcXFx1MTc3MlxcXFx1MTc3M1xcXFx1MTdCNy1cXFxcdTE3QkRcIixcblx0XHRcIlxcXFx1MTdDNlxcXFx1MTdDOS1cXFxcdTE3RDNcXFxcdTE3RERcXFxcdTE4MEItXFxcXHUxODBEXFxcXHUxOEE5XFxcXHUxOTIwXCIsXG5cdFx0XCItXFxcXHUxOTIyXFxcXHUxOTI3XFxcXHUxOTI4XFxcXHUxOTMyXFxcXHUxOTM5LVxcXFx1MTkzQlxcXFx1MUExN1xcXFx1MUExOFwiLFxuXHRcdFwiXFxcXHUxQTU2XFxcXHUxQTU4LVxcXFx1MUE1RVxcXFx1MUE2MFxcXFx1MUE2MlxcXFx1MUE2NS1cXFxcdTFBNkNcXFxcdTFBNzNcIixcblx0XHRcIi1cXFxcdTFBN0NcXFxcdTFBN0ZcXFxcdTFCMDAtXFxcXHUxQjAzXFxcXHUxQjM0XFxcXHUxQjM2LVxcXFx1MUIzQVxcXFx1MUIzXCIsXG5cdFx0XCJDXFxcXHUxQjQyXFxcXHUxQjZCLVxcXFx1MUI3M1xcXFx1MUI4MFxcXFx1MUI4MVxcXFx1MUJBMi1cXFxcdTFCQTVcXFxcdTFCQVwiLFxuXHRcdFwiOFxcXFx1MUJBOVxcXFx1MUMyQy1cXFxcdTFDMzNcXFxcdTFDMzZcXFxcdTFDMzdcXFxcdTFDRDAtXFxcXHUxQ0QyXFxcXHUxQ0RcIixcblx0XHRcIjQtXFxcXHUxQ0UwXFxcXHUxQ0UyLVxcXFx1MUNFOFxcXFx1MUNFRFxcXFx1MURDMC1cXFxcdTFERTZcXFxcdTFERkQtXFxcXHUxXCIsXG5cdFx0XCJERkZcXFxcdTIwRDAtXFxcXHUyMERDXFxcXHUyMEUxXFxcXHUyMEU1LVxcXFx1MjBGMFxcXFx1MkNFRi1cXFxcdTJDRjFcXFxcdVwiLFxuXHRcdFwiMkRFMC1cXFxcdTJERkZcXFxcdTMwMkEtXFxcXHUzMDJGXFxcXHUzMDk5XFxcXHUzMDlBXFxcXHVBNjZGXFxcXHVBNjdDXFxcXHVcIixcblx0XHRcIkE2N0RcXFxcdUE2RjBcXFxcdUE2RjFcXFxcdUE4MDJcXFxcdUE4MDZcXFxcdUE4MEJcXFxcdUE4MjVcXFxcdUE4MjZcXFxcdUE4XCIsXG5cdFx0XCJDNFxcXFx1QThFMC1cXFxcdUE4RjFcXFxcdUE5MjYtXFxcXHVBOTJEXFxcXHVBOTQ3LVxcXFx1QTk1MVxcXFx1QTk4MC1cXFxcdVwiLFxuXHRcdFwiQTk4MlxcXFx1QTlCM1xcXFx1QTlCNi1cXFxcdUE5QjlcXFxcdUE5QkNcXFxcdUFBMjktXFxcXHVBQTJFXFxcXHVBQTMxXFxcXHVcIixcblx0XHRcIkFBMzJcXFxcdUFBMzVcXFxcdUFBMzZcXFxcdUFBNDNcXFxcdUFBNENcXFxcdUFBQjBcXFxcdUFBQjItXFxcXHVBQUI0XFxcXHVBXCIsXG5cdFx0XCJBQjdcXFxcdUFBQjhcXFxcdUFBQkVcXFxcdUFBQkZcXFxcdUFBQzFcXFxcdUFCRTVcXFxcdUFCRThcXFxcdUFCRURcXFxcdUZCMVwiLFxuXHRcdFwiRVxcXFx1RkUwMC1cXFxcdUZFMEZcXFxcdUZFMjAtXFxcXHVGRTI2XVwiXG5cdF0uam9pbihcIlwiKSksXG5cdHNwYWNlQ29tYmluaW5nTWFyazogbmV3IFJlZ0V4cChbXG5cdFx0XCJbXFxcXHUwOTAzXFxcXHUwOTNFLVxcXFx1MDk0MFxcXFx1MDk0OS1cXFxcdTA5NENcXFxcdTA5NEVcXFxcdTA5ODJcXFxcdTA5OFwiLFxuXHRcdFwiM1xcXFx1MDlCRS1cXFxcdTA5QzBcXFxcdTA5QzdcXFxcdTA5QzhcXFxcdTA5Q0JcXFxcdTA5Q0NcXFxcdTA5RDdcXFxcdTBBMDNcIixcblx0XHRcIlxcXFx1MEEzRS1cXFxcdTBBNDBcXFxcdTBBODNcXFxcdTBBQkUtXFxcXHUwQUMwXFxcXHUwQUM5XFxcXHUwQUNCXFxcXHUwQUNDXCIsXG5cdFx0XCJcXFxcdTBCMDJcXFxcdTBCMDNcXFxcdTBCM0VcXFxcdTBCNDBcXFxcdTBCNDdcXFxcdTBCNDhcXFxcdTBCNEJcXFxcdTBCNENcXFxcXCIsXG5cdFx0XCJ1MEI1N1xcXFx1MEJCRVxcXFx1MEJCRlxcXFx1MEJDMVxcXFx1MEJDMlxcXFx1MEJDNi1cXFxcdTBCQzhcXFxcdTBCQ0EtXFxcXFwiLFxuXHRcdFwidTBCQ0NcXFxcdTBCRDdcXFxcdTBDMDEtXFxcXHUwQzAzXFxcXHUwQzQxLVxcXFx1MEM0NFxcXFx1MEM4MlxcXFx1MEM4M1xcXFxcIixcblx0XHRcInUwQ0JFXFxcXHUwQ0MwLVxcXFx1MENDNFxcXFx1MENDN1xcXFx1MENDOFxcXFx1MENDQVxcXFx1MENDQlxcXFx1MENENVxcXFx1XCIsXG5cdFx0XCIwQ0Q2XFxcXHUwRDAyXFxcXHUwRDAzXFxcXHUwRDNFLVxcXFx1MEQ0MFxcXFx1MEQ0Ni1cXFxcdTBENDhcXFxcdTBENEEtXFxcXFwiLFxuXHRcdFwidTBENENcXFxcdTBENTdcXFxcdTBEODJcXFxcdTBEODNcXFxcdTBEQ0YtXFxcXHUwREQxXFxcXHUwREQ4LVxcXFx1MERERlxcXFxcIixcblx0XHRcInUwREYyXFxcXHUwREYzXFxcXHUwRjNFXFxcXHUwRjNGXFxcXHUwRjdGXFxcXHUxMDJCXFxcXHUxMDJDXFxcXHUxMDMxXFxcXHUxXCIsXG5cdFx0XCIwMzhcXFxcdTEwM0JcXFxcdTEwM0NcXFxcdTEwNTZcXFxcdTEwNTdcXFxcdTEwNjItXFxcXHUxMDY0XFxcXHUxMDY3LVxcXFx1MVwiLFxuXHRcdFwiMDZEXFxcXHUxMDgzXFxcXHUxMDg0XFxcXHUxMDg3LVxcXFx1MTA4Q1xcXFx1MTA4RlxcXFx1MTA5QS1cXFxcdTEwOUNcXFxcdTFcIixcblx0XHRcIjdCNlxcXFx1MTdCRS1cXFxcdTE3QzVcXFxcdTE3QzdcXFxcdTE3QzhcXFxcdTE5MjMtXFxcXHUxOTI2XFxcXHUxOTI5LVxcXFx1XCIsXG5cdFx0XCIxOTJCXFxcXHUxOTMwXFxcXHUxOTMxXFxcXHUxOTMzLVxcXFx1MTkzOFxcXFx1MTlCMC1cXFxcdTE5QzBcXFxcdTE5QzhcXFxcdVwiLFxuXHRcdFwiMTlDOVxcXFx1MUExOS1cXFxcdTFBMUJcXFxcdTFBNTVcXFxcdTFBNTdcXFxcdTFBNjFcXFxcdTFBNjNcXFxcdTFBNjRcXFxcdTFcIixcblx0XHRcIkE2RC1cXFxcdTFBNzJcXFxcdTFCMDRcXFxcdTFCMzVcXFxcdTFCM0JcXFxcdTFCM0QtXFxcXHUxQjQxXFxcXHUxQjQzXFxcXHUxXCIsXG5cdFx0XCJCNDRcXFxcdTFCODJcXFxcdTFCQTFcXFxcdTFCQTZcXFxcdTFCQTdcXFxcdTFCQUFcXFxcdTFDMjQtXFxcXHUxQzJCXFxcXHUxQ1wiLFxuXHRcdFwiMzRcXFxcdTFDMzVcXFxcdTFDRTFcXFxcdTFDRjJcXFxcdUE4MjNcXFxcdUE4MjRcXFxcdUE4MjdcXFxcdUE4ODBcXFxcdUE4ODFcIixcblx0XHRcIlxcXFx1QThCNC1cXFxcdUE4QzNcXFxcdUE5NTJcXFxcdUE5NTNcXFxcdUE5ODNcXFxcdUE5QjRcXFxcdUE5QjVcXFxcdUE5QkFcIixcblx0XHRcIlxcXFx1QTlCQlxcXFx1QTlCRC1cXFxcdUE5QzBcXFxcdUFBMkZcXFxcdUFBMzBcXFxcdUFBMzNcXFxcdUFBMzRcXFxcdUFBNERcIixcblx0XHRcIlxcXFx1QUE3QlxcXFx1QUJFM1xcXFx1QUJFNFxcXFx1QUJFNlxcXFx1QUJFN1xcXFx1QUJFOVxcXFx1QUJFQVxcXFx1QUJFQ11cIlxuXHRdLmpvaW4oXCJcIikpLFxuXHRjb25uZWN0b3JQdW5jdHVhdGlvbjogbmV3IFJlZ0V4cChcblx0XHRcIltcXFxcdTAwNUZcXFxcdTIwM0ZcXFxcdTIwNDBcXFxcdTIwNTRcXFxcdUZFMzNcXFxcdUZFMzRcXFxcdUZFNEQtXFxcXHVGRTRGXFxcXHVGRjNGXVwiXG5cdClcbn07XG5cbmZ1bmN0aW9uIGlzTGV0dGVyKGNoKSB7XG5cdHJldHVybiBVTklDT0RFLmxldHRlci50ZXN0KGNoKTtcbn1cblxuZnVuY3Rpb24gaXNEaWdpdChjaCkge1xuXHRjaCA9IGNoLmNoYXJDb2RlQXQoMCk7XG5cdHJldHVybiBjaCA+PSA0OCAmJiBjaCA8PSA1Nztcbn1cblxuZnVuY3Rpb24gaXNBbHBoYW51bWVyaWNDaGFyKGNoKSB7XG5cdHJldHVybiBpc0RpZ2l0KGNoKSB8fCBpc0xldHRlcihjaCk7XG59XG5cbmZ1bmN0aW9uIGlzVW5pY29kZUNvbWJpbmluZ01hcmsoY2gpIHtcblx0cmV0dXJuIFVOSUNPREUubm9uU3BhY2luZ01hcmsudGVzdChjaCkgfHxcblx0XHRVTklDT0RFLnNwYWNlQ29tYmluaW5nTWFyay50ZXN0KGNoKTtcbn1cblxuZnVuY3Rpb24gaXNVbmljb2RlQ29ubmVjdG9yUHVuY3R1YXRpb24oY2gpIHtcblx0cmV0dXJuIFVOSUNPREUuY29ubmVjdG9yUHVuY3R1YXRpb24udGVzdChjaCk7XG59XG5cbmZ1bmN0aW9uIGlzSWRlbnRpZmllclN0YXJ0KGNoKSB7XG5cdHJldHVybiBjaCA9PT0gXCIkXCIgfHwgY2ggPT09IFwiX1wiIHx8IGlzTGV0dGVyKGNoKTtcbn1cblxuZnVuY3Rpb24gaXNJZGVudGlmaWVyQ2hhcihjaCkge1xuXHRyZXR1cm4gaXNJZGVudGlmaWVyU3RhcnQoY2gpIHx8XG5cdFx0aXNVbmljb2RlQ29tYmluaW5nTWFyayhjaCkgfHxcblx0XHRpc0RpZ2l0KGNoKSB8fFxuXHRcdGlzVW5pY29kZUNvbm5lY3RvclB1bmN0dWF0aW9uKGNoKSB8fFxuXHRcdGNoID09PSBcIlxcdTIwMGNcIiB8fCAvKiB6ZXJvLXdpZHRoIG5vbi1qb2luZXIgPFpXTko+ICovXG5cdFx0Y2ggPT09IFwiXFx1MjAwZFwiXG5cdC8qIHplcm8td2lkdGggam9pbmVyIDxaV0o+XG4gICAgICAgICAgICAoaW4gbXkgRUNNQS0yNjIgUERGLCB0aGlzIGlzIGFsc28gMjAwYykgKi9cblx0O1xufVxuXG5mdW5jdGlvbiBwYXJzZUpzTnVtYmVyKG51bSkge1xuXHRpZiAoUkVfSEVYX05VTUJFUi50ZXN0KG51bSkpIHtcblx0XHRyZXR1cm4gcGFyc2VJbnQobnVtLnN1YnN0cigyKSwgMTYpO1xuXHR9IGVsc2UgaWYgKFJFX09DVF9OVU1CRVIudGVzdChudW0pKSB7XG5cdFx0cmV0dXJuIHBhcnNlSW50KG51bS5zdWJzdHIoMSksIDgpO1xuXHR9IGVsc2UgaWYgKFJFX0RFQ19OVU1CRVIudGVzdChudW0pKSB7XG5cdFx0cmV0dXJuIHBhcnNlRmxvYXQobnVtKTtcblx0fVxufVxuXG5mdW5jdGlvbiBQYXJzZUVycm9yKG1lc3NhZ2UsIGxpbmUsIGNvbCwgcG9zKSB7XG5cdHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG5cdHRoaXMubGluZSA9IGxpbmUgKyAxO1xuXHR0aGlzLmNvbCA9IGNvbCArIDE7XG5cdHRoaXMucG9zID0gcG9zICsgMTtcblx0dGhpcy5zdGFjayA9IG5ldyBFcnJvcigpLnN0YWNrO1xufVxuXG5QYXJzZUVycm9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuIHRoaXMubWVzc2FnZSArXG5cdFx0XCIgKGxpbmU6IFwiICsgdGhpcy5saW5lICtcblx0XHRcIiwgY29sOiBcIiArIHRoaXMuY29sICtcblx0XHRcIiwgcG9zOiBcIiArIHRoaXMucG9zICtcblx0XHRcIilcIiArIFwiXFxuXFxuXCIgKyB0aGlzLnN0YWNrO1xufTtcblxuZnVuY3Rpb24gdGhyb3dQYXJzZUVycm9yKG1lc3NhZ2UsIGxpbmUsIGNvbCwgcG9zKSB7XG5cdHRocm93IG5ldyBQYXJzZUVycm9yKG1lc3NhZ2UsIGxpbmUsIGNvbCwgcG9zKTtcbn1cblxuZnVuY3Rpb24gaXNUb2tlbih0b2tlbiwgdHlwZSwgdmFsKSB7XG5cdHJldHVybiB0b2tlbi50eXBlID09PSB0eXBlICYmICh2YWwgPT09IHVuZGVmaW5lZCB8fFxuXHRcdHRva2VuLnZhbHVlID09PSB2YWwpO1xufVxuXG52YXIgRVhfRU9GID0ge307XG5cbnZhciBUTVBMX01PREVfTk9ORSA9IDAsXG5cdFRNUExfTU9ERV9IVE1MID0gMSxcblx0VE1QTF9NT0RFX0NPTU1BTkQgPSAyLFxuXHRUTVBMX01PREVfVkFSSUFCTEUgPSAzO1xuXG5mdW5jdGlvbiB0b2tlbml6ZXIoJFRFWFQsIGhhc1RlbXBsYXRlTW9kZSkge1xuXG5cdHZhciBTID0ge1xuXHRcdHRleHQ6ICRURVhULnJlcGxhY2UoL1xcclxcbj98W1xcblxcdTIwMjhcXHUyMDI5XS9nLCBcIlxcblwiKVxuXHRcdFx0LnJlcGxhY2UoL15cXHVGRUZGLywgXCJcIiksXG5cdFx0cG9zOiAwLFxuXHRcdHRva3BvczogMCxcblx0XHRsaW5lOiAwLFxuXHRcdHRva2xpbmU6IDAsXG5cdFx0Y29sOiAwLFxuXHRcdHRva2NvbDogMCxcblx0XHRuZXdsaW5lQmVmb3JlOiBmYWxzZSxcblx0XHRyZWdleEFsbG93ZWQ6IGZhbHNlLFxuXHRcdGN1cmx5Q291bnQ6IDAsXG5cdFx0dGVtcGxhdGVNb2RlOiBoYXNUZW1wbGF0ZU1vZGUgPyBUTVBMX01PREVfSFRNTCA6IFRNUExfTU9ERV9OT05FLFxuXHRcdGNvbW1lbnRzQmVmb3JlOiBbXVxuXHR9O1xuXG5cdGZ1bmN0aW9uIHBlZWsoKSB7XG5cdFx0cmV0dXJuIFMudGV4dC5jaGFyQXQoUy5wb3MpO1xuXHR9XG5cblx0ZnVuY3Rpb24gbmV4dChzaWduYWxFb2YsIGluU3RyaW5nKSB7XG5cdFx0dmFyIGNoID0gUy50ZXh0LmNoYXJBdChTLnBvcysrKTtcblx0XHRpZiAoc2lnbmFsRW9mICYmICFjaCkge1xuXHRcdFx0dGhyb3cgRVhfRU9GO1xuXHRcdH1cblx0XHRpZiAoY2ggPT09IFwiXFxuXCIpIHtcblx0XHRcdFMubmV3bGluZUJlZm9yZSA9IFMubmV3bGluZUJlZm9yZSB8fCAhaW5TdHJpbmc7XG5cdFx0XHQrK1MubGluZTtcblx0XHRcdFMuY29sID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0KytTLmNvbDtcblx0XHR9XG5cdFx0cmV0dXJuIGNoO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmluZCh3aGF0LCBzaWduYWxFb2YpIHtcblx0XHR2YXIgcG9zID0gUy50ZXh0LmluZGV4T2Yod2hhdCwgUy5wb3MpO1xuXHRcdGlmIChzaWduYWxFb2YgJiYgcG9zID09PSAtMSkge1xuXHRcdFx0dGhyb3cgRVhfRU9GO1xuXHRcdH1cblx0XHRyZXR1cm4gcG9zO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhcnRUb2tlbigpIHtcblx0XHRTLnRva2xpbmUgPSBTLmxpbmU7XG5cdFx0Uy50b2tjb2wgPSBTLmNvbDtcblx0XHRTLnRva3BvcyA9IFMucG9zO1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9rZW4odHlwZSwgdmFsdWUsIGlzQ29tbWVudCkge1xuXHRcdFMucmVnZXhBbGxvd2VkID0gKCh0eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgIUhPUChVTkFSWV9QT1NURklYLFxuXHRcdFx0XHR2YWx1ZSkpIHx8XG5cdFx0XHQodHlwZSA9PT0gXCJrZXl3b3JkXCIgJiYgSE9QKEtFWVdPUkRTX0JFRk9SRV9FWFBSRVNTSU9OLFxuXHRcdFx0XHR2YWx1ZSkpIHx8XG5cdFx0XHQodHlwZSA9PT0gXCJwdW5jXCIgJiYgSE9QKFBVTkNfQkVGT1JFX0VYUFJFU1NJT04sIHZhbHVlKSkpO1xuXHRcdHZhciByZXQgPSB7XG5cdFx0XHR0eXBlOiB0eXBlLFxuXHRcdFx0dmFsdWU6IHZhbHVlLFxuXHRcdFx0bGluZTogUy50b2tsaW5lLFxuXHRcdFx0Y29sOiBTLnRva2NvbCxcblx0XHRcdHBvczogUy50b2twb3MsXG5cdFx0XHRlbmRwb3M6IFMucG9zLFxuXHRcdFx0bmxiOiBTLm5ld2xpbmVCZWZvcmVcblx0XHR9O1xuXHRcdGlmICghaXNDb21tZW50KSB7XG5cdFx0XHRyZXQuY29tbWVudHNCZWZvcmUgPSBTLmNvbW1lbnRzQmVmb3JlO1xuXHRcdFx0Uy5jb21tZW50c0JlZm9yZSA9IFtdO1xuXHRcdH1cblx0XHRTLm5ld2xpbmVCZWZvcmUgPSBmYWxzZTtcblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2tpcFdoaXRlc3BhY2UoKSB7XG5cdFx0d2hpbGUgKEhPUChXSElURVNQQUNFX0NIQVJTLCBwZWVrKCkpKSB7XG5cdFx0XHRuZXh0KCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZFdoaWxlKHByZWQpIHtcblx0XHR2YXIgcmV0ID0gXCJcIixcblx0XHRcdGNoID0gcGVlaygpLFxuXHRcdFx0aSA9IDA7XG5cdFx0d2hpbGUgKGNoICYmIHByZWQoY2gsIGkrKykpIHtcblx0XHRcdHJldCArPSBuZXh0KCk7XG5cdFx0XHRjaCA9IHBlZWsoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlRXJyb3IoZXJyKSB7XG5cdFx0dGhyb3dQYXJzZUVycm9yKGVyciwgUy50b2tsaW5lLCBTLnRva2NvbCwgUy50b2twb3MpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZE51bShwcmVmaXgpIHtcblx0XHR2YXIgaGFzRSA9IGZhbHNlLFxuXHRcdFx0YWZ0ZXJFID0gZmFsc2UsXG5cdFx0XHRoYXNYID0gZmFsc2UsXG5cdFx0XHRoYXNEb3QgPSBwcmVmaXggPT09IFwiLlwiO1xuXG5cdFx0dmFyIG51bSA9IHJlYWRXaGlsZShmdW5jdGlvbiAoY2gsIGkpIHtcblx0XHRcdGlmIChjaCA9PT0gXCJ4XCIgfHwgY2ggPT09IFwiWFwiKSB7XG5cdFx0XHRcdGlmIChoYXNYKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhhc1ggPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghaGFzWCAmJiAoY2ggPT09IFwiRVwiIHx8IGNoID09PSBcImVcIikpIHtcblx0XHRcdFx0aWYgKGhhc0UpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aGFzRSA9IHRydWU7XG5cdFx0XHRcdGFmdGVyRSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoID09PSBcIi1cIikge1xuXHRcdFx0XHRpZiAoYWZ0ZXJFIHx8IChpID09PSAwICYmICFwcmVmaXgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoID09PSBcIitcIikge1xuXHRcdFx0XHRyZXR1cm4gYWZ0ZXJFO1xuXHRcdFx0fVxuXHRcdFx0YWZ0ZXJFID0gZmFsc2U7XG5cdFx0XHRpZiAoY2ggPT09IFwiLlwiKSB7XG5cdFx0XHRcdGlmICghaGFzRG90ICYmICFoYXNYKSB7XG5cdFx0XHRcdFx0aGFzRG90ID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaXNBbHBoYW51bWVyaWNDaGFyKGNoKTtcblx0XHR9KTtcblx0XHRpZiAocHJlZml4KSB7XG5cdFx0XHRudW0gPSBwcmVmaXggKyBudW07XG5cdFx0fVxuXHRcdHZhciB2YWxpZCA9IHBhcnNlSnNOdW1iZXIobnVtKTtcblx0XHRpZiAoIWlzTmFOKHZhbGlkKSkge1xuXHRcdFx0cmV0dXJuIHRva2VuKFwibnVtXCIsIHZhbGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cGFyc2VFcnJvcihcIkludmFsaWQgc3ludGF4OiBcIiArIG51bSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZEVzY2FwZWRDaGFyKGluU3RyaW5nKSB7XG5cdFx0dmFyIGNoID0gbmV4dCh0cnVlLCBpblN0cmluZyk7XG5cdFx0c3dpdGNoIChjaCkge1xuXHRcdGNhc2UgXCJuXCI6XG5cdFx0XHRyZXR1cm4gXCJcXG5cIjtcblx0XHRjYXNlIFwiclwiOlxuXHRcdFx0cmV0dXJuIFwiXFxyXCI7XG5cdFx0Y2FzZSBcInRcIjpcblx0XHRcdHJldHVybiBcIlxcdFwiO1xuXHRcdGNhc2UgXCJiXCI6XG5cdFx0XHRyZXR1cm4gXCJcXGJcIjtcblx0XHRjYXNlIFwidlwiOlxuXHRcdFx0cmV0dXJuIFwiXFx1MDAwYlwiO1xuXHRcdGNhc2UgXCJmXCI6XG5cdFx0XHRyZXR1cm4gXCJcXGZcIjtcblx0XHRjYXNlIFwiMFwiOlxuXHRcdFx0cmV0dXJuIFwiXFwwXCI7XG5cdFx0Y2FzZSBcInhcIjpcblx0XHRcdHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKGhleEJ5dGVzKDIpKTtcblx0XHRjYXNlIFwidVwiOlxuXHRcdFx0cmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoaGV4Qnl0ZXMoNCkpO1xuXHRcdGNhc2UgXCJcXG5cIjpcblx0XHRcdHJldHVybiBcIlwiO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gY2g7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaGV4Qnl0ZXMobikge1xuXHRcdHZhciBudW0gPSAwO1xuXHRcdGZvciAoOyBuID4gMDsgLS1uKSB7XG5cdFx0XHR2YXIgZGlnaXQgPSBwYXJzZUludChuZXh0KHRydWUpLCAxNik7XG5cdFx0XHRpZiAoaXNOYU4oZGlnaXQpKSB7XG5cdFx0XHRcdHBhcnNlRXJyb3IoXCJJbnZhbGlkIGhleC1jaGFyYWN0ZXIgcGF0dGVybiBpbiBzdHJpbmdcIik7XG5cdFx0XHR9XG5cdFx0XHRudW0gPSAobnVtICogMTYpICsgZGlnaXQ7XG5cdFx0fVxuXHRcdHJldHVybiBudW07XG5cdH1cblxuXHRmdW5jdGlvbiByZWFkU3RyaW5nKCkge1xuXHRcdHJldHVybiB3aXRoRW9mRXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nIGNvbnN0YW50XCIsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBxdW90ZSA9IG5leHQoKSxcblx0XHRcdFx0cmV0ID0gXCJcIixcblx0XHRcdFx0b2N0YWxMZW4sXG5cdFx0XHRcdGZpcnN0LFxuXHRcdFx0XHRjaDtcblxuXHRcdFx0ZnVuY3Rpb24gd2hpbGVPY3RhbChjaCkge1xuXHRcdFx0XHRpZiAoY2ggPj0gXCIwXCIgJiYgY2ggPD0gXCI3XCIpIHtcblx0XHRcdFx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRcdFx0XHRmaXJzdCA9IGNoO1xuXHRcdFx0XHRcdFx0cmV0dXJuICsrb2N0YWxMZW47XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChmaXJzdCA8PSBcIjNcIiAmJiBvY3RhbExlbiA8PSAyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gKytvY3RhbExlbjtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGZpcnN0ID49IFwiNFwiICYmIG9jdGFsTGVuIDw9IDEpIHtcblx0XHRcdFx0XHRcdHJldHVybiArK29jdGFsTGVuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoOzspIHtcblx0XHRcdFx0Y2ggPSBuZXh0KHRydWUpO1xuXHRcdFx0XHRpZiAoY2ggPT09IFwiXFxcXFwiKSB7XG5cdFx0XHRcdFx0Ly8gcmVhZCBPY3RhbEVzY2FwZVNlcXVlbmNlIFxuXHRcdFx0XHRcdC8vIChYWFg6IGRlcHJlY2F0ZWQgaWYgXCJzdHJpY3QgbW9kZVwiKVxuXHRcdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taXNob28vVWdsaWZ5SlMvaXNzdWVzLzE3OFxuXHRcdFx0XHRcdG9jdGFsTGVuID0gMDtcblx0XHRcdFx0XHRmaXJzdCA9IG51bGw7XG5cdFx0XHRcdFx0Y2ggPSByZWFkV2hpbGUod2hpbGVPY3RhbCk7XG5cdFx0XHRcdFx0aWYgKG9jdGFsTGVuID4gMCkge1xuXHRcdFx0XHRcdFx0Y2ggPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGNoLCA4KSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNoID0gcmVhZEVzY2FwZWRDaGFyKHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gcXVvdGUpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXQgKz0gY2g7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdG9rZW4oXCJzdHJpbmdcIiwgcmV0KTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlYWRMaW5lQ29tbWVudCgpIHtcblx0XHRuZXh0KCk7XG5cdFx0dmFyIGkgPSBmaW5kKFwiXFxuXCIpLFxuXHRcdFx0cmV0O1xuXHRcdGlmIChpID09PSAtMSkge1xuXHRcdFx0cmV0ID0gUy50ZXh0LnN1YnN0cihTLnBvcyk7XG5cdFx0XHRTLnBvcyA9IFMudGV4dC5sZW5ndGg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldCA9IFMudGV4dC5zdWJzdHJpbmcoUy5wb3MsIGkpO1xuXHRcdFx0Uy5wb3MgPSBpO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9rZW4oXCJjb21tZW50MVwiLCByZXQsIHRydWUpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZE11bHRpbGluZUNvbW1lbnQoKSB7XG5cdFx0bmV4dCgpO1xuXHRcdHJldHVybiB3aXRoRW9mRXJyb3IoXCJVbnRlcm1pbmF0ZWQgbXVsdGlsaW5lIGNvbW1lbnRcIixcblx0XHRcdGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0dmFyIGkgPSBmaW5kKFwiKi9cIiwgdHJ1ZSksXG5cdFx0XHRcdFx0dGV4dCA9IFMudGV4dC5zdWJzdHJpbmcoUy5wb3MsIGkpO1xuXHRcdFx0XHRTLnBvcyA9IGkgKyAyO1xuXHRcdFx0XHRTLmxpbmUgKz0gdGV4dC5zcGxpdChcIlxcblwiKS5sZW5ndGggLSAxO1xuXHRcdFx0XHRTLm5ld2xpbmVCZWZvcmUgPSB0ZXh0LmluZGV4T2YoXCJcXG5cIikgPj0gMDtcblxuXHRcdFx0XHRyZXR1cm4gdG9rZW4oXCJjb21tZW50MlwiLCB0ZXh0LCB0cnVlKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZE11bHRpbGluZVRlbXBsYXRlQ29tbWVudCgpIHtcblx0XHRuZXh0KCk7XG5cdFx0cmV0dXJuIHdpdGhFb2ZFcnJvcihcIlVudGVybWluYXRlZCBtdWx0aWxpbmUgY29tbWVudFwiLFxuXHRcdFx0ZnVuY3Rpb24gKCkge1xuXHRcdFx0XHR2YXIgaSA9IGZpbmQoXCJ9fVwiLCB0cnVlKSxcblx0XHRcdFx0XHR0ZXh0ID0gUy50ZXh0LnN1YnN0cmluZyhTLnBvcywgaSk7XG5cdFx0XHRcdFMucG9zID0gaSArIDI7XG5cdFx0XHRcdFMubGluZSArPSB0ZXh0LnNwbGl0KFwiXFxuXCIpLmxlbmd0aCAtIDE7XG5cdFx0XHRcdFMubmV3bGluZUJlZm9yZSA9IHRleHQuaW5kZXhPZihcIlxcblwiKSA+PSAwO1xuXG5cdFx0XHRcdHJldHVybiB0b2tlbihcImNvbW1lbnQyXCIsIHRleHQsIHRydWUpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiByZWFkTmFtZSgpIHtcblx0XHR2YXIgYmFja3NsYXNoID0gZmFsc2UsXG5cdFx0XHRuYW1lID0gXCJcIixcblx0XHRcdGNoLCBlc2NhcGVkID0gZmFsc2UsXG5cdFx0XHRoZXg7XG5cdFx0d2hpbGUgKChjaCA9IHBlZWsoKSkgIT09IG51bGwpIHtcblx0XHRcdGlmICghYmFja3NsYXNoKSB7XG5cdFx0XHRcdGlmIChjaCA9PT0gXCJcXFxcXCIpIHtcblx0XHRcdFx0XHRlc2NhcGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRiYWNrc2xhc2ggPSB0cnVlO1xuXHRcdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc0lkZW50aWZpZXJDaGFyKGNoKSkge1xuXHRcdFx0XHRcdG5hbWUgKz0gbmV4dCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY2ggIT09IFwidVwiKSB7XG5cdFx0XHRcdFx0cGFyc2VFcnJvcihcblx0XHRcdFx0XHRcdFwiRXhwZWN0aW5nIFVuaWNvZGVFc2NhcGVTZXF1ZW5jZSAtLSB1WFhYWFwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjaCA9IHJlYWRFc2NhcGVkQ2hhcigpO1xuXHRcdFx0XHRpZiAoIWlzSWRlbnRpZmllckNoYXIoY2gpKSB7XG5cdFx0XHRcdFx0cGFyc2VFcnJvcihcIlVuaWNvZGUgY2hhcjogXCIgK1xuXHRcdFx0XHRcdFx0Y2guY2hhckNvZGVBdCgwKSArXG5cdFx0XHRcdFx0XHRcIiBpcyBub3QgdmFsaWQgaW4gaWRlbnRpZmllclwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRuYW1lICs9IGNoO1xuXHRcdFx0XHRiYWNrc2xhc2ggPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKEhPUChLRVlXT1JEUywgbmFtZSkgJiYgZXNjYXBlZCkge1xuXHRcdFx0aGV4ID0gbmFtZS5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpO1xuXHRcdFx0bmFtZSA9IFwiXFxcXHVcIiArIFwiMDAwMFwiLnN1YnN0cihoZXgubGVuZ3RoKSArIGhleCArIG5hbWUuc2xpY2UoXG5cdFx0XHRcdDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmFtZTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlYWRSZWdleHAocmVnZXhwKSB7XG5cdFx0cmV0dXJuIHdpdGhFb2ZFcnJvcihcIlVudGVybWluYXRlZCByZWd1bGFyIGV4cHJlc3Npb25cIixcblx0XHRcdGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0dmFyIHByZXZCYWNrc2xhc2ggPSBmYWxzZSxcblx0XHRcdFx0XHRjaCwgaW5DbGFzcyA9IGZhbHNlO1xuXHRcdFx0XHR3aGlsZSAoKGNoID0gbmV4dCh0cnVlKSkpIHtcblx0XHRcdFx0XHRpZiAocHJldkJhY2tzbGFzaCkge1xuXHRcdFx0XHRcdFx0cmVnZXhwICs9IFwiXFxcXFwiICsgY2g7XG5cdFx0XHRcdFx0XHRwcmV2QmFja3NsYXNoID0gZmFsc2U7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gXCJbXCIpIHtcblx0XHRcdFx0XHRcdGluQ2xhc3MgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cmVnZXhwICs9IGNoO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY2ggPT09IFwiXVwiICYmIGluQ2xhc3MpIHtcblx0XHRcdFx0XHRcdGluQ2xhc3MgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHJlZ2V4cCArPSBjaDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNoID09PSBcIi9cIiAmJiAhaW5DbGFzcykge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gXCJcXFxcXCIpIHtcblx0XHRcdFx0XHRcdHByZXZCYWNrc2xhc2ggPSB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZWdleHAgKz0gY2g7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmFyIG1vZHMgPSByZWFkTmFtZSgpO1xuXHRcdFx0XHRyZXR1cm4gdG9rZW4oXCJyZWdleHBcIiwgW3JlZ2V4cCwgbW9kc10pO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiByZWFkT3BlcmF0b3IocHJlZml4KSB7XG5cdFx0ZnVuY3Rpb24gZ3JvdyhvcCkge1xuXHRcdFx0aWYgKCFwZWVrKCkpIHtcblx0XHRcdFx0cmV0dXJuIG9wO1xuXHRcdFx0fVxuXHRcdFx0dmFyIGJpZ2dlciA9IG9wICsgcGVlaygpO1xuXHRcdFx0aWYgKEhPUChPUEVSQVRPUlMsIGJpZ2dlcikpIHtcblx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRyZXR1cm4gZ3JvdyhiaWdnZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG9wO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdG9rZW4oXCJvcGVyYXRvclwiLCBncm93KHByZWZpeCB8fCBuZXh0KCkpKTtcblx0fVxuXG5cblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblxuXHR2YXIgY29tbWFuZFJlZ2V4ID0gL157eyhcXC8pPyhbYS16IV0rKShbIH1cXChdKS87XG5cblx0ZnVuY3Rpb24gcGVla1RlbXBsYXRlQ29tbWFuZCgpIHtcblx0XHR2YXIgZW5kID0gUy5wb3MgKyAyMDtcblx0XHRpZiAoZW5kID4gUy50ZXh0Lmxlbmd0aCkge1xuXHRcdFx0ZW5kID0gUy50ZXh0Lmxlbmd0aDtcblx0XHR9XG5cdFx0dmFyIGxvb2thaGVhZCA9IFMudGV4dC5zdWJzdHJpbmcoUy5wb3MsIGVuZCk7XG5cdFx0dmFyIG1hdGNoZXMgPSBjb21tYW5kUmVnZXguZXhlYyhsb29rYWhlYWQpO1xuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHR2YXIgaXNFbmQgPSBtYXRjaGVzWzFdIHx8IFwiXCI7XG5cdFx0XHR2YXIgY29tbWFuZCA9IG1hdGNoZXNbMl07XG5cdFx0XHR2YXIgdmFsaWRDb21tYW5kcyA9XG5cdFx0XHRcdGlzRW5kID8gVEVNUExBVEVfRU5EX0NPTU1BTkRTIDpcblx0XHRcdFx0VEVNUExBVEVfU1RBUlRfQ09NTUFORFM7XG5cdFx0XHRpZiAoSE9QKHZhbGlkQ29tbWFuZHMsIGNvbW1hbmQpKSB7XG5cdFx0XHRcdHJldHVybiBbaXNFbmQsIGNvbW1hbmRdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGZ1bmN0aW9uIHBlZWtUZW1wbGF0ZVZhcmlhYmxlKCkge1xuXHRcdHJldHVybiBTLnRleHQuY2hhckF0KFMucG9zKSA9PT0gXCIkXCIgJiYgUy50ZXh0LmNoYXJBdChTLnBvcyArXG5cdFx0XHQxKSA9PT0gXCJ7XCI7XG5cdH1cblxuXHRmdW5jdGlvbiByZWFkVHB1bmMoKSB7XG5cdFx0dmFyIGNoID0gcGVlaygpO1xuXHRcdGlmIChjaCA9PT0gXCIkXCIpIHtcblx0XHRcdG5leHQoKTtcblx0XHRcdG5leHQoKTtcblx0XHRcdFMudGVtcGxhdGVNb2RlID0gVE1QTF9NT0RFX1ZBUklBQkxFO1xuXHRcdFx0Uy5jdXJseUNvdW50ID0gMDtcblx0XHRcdHJldHVybiB0b2tlbihcInRwdW5jXCIsIFwiJHtcIik7XG5cdFx0fSBlbHNlIGlmIChjaCA9PT0gXCJ7XCIpIHtcblx0XHRcdHZhciB0ZW1wbGF0ZUNvbW1hbmQgPSBwZWVrVGVtcGxhdGVDb21tYW5kKCk7XG5cdFx0XHR2YXIgaXNFbmRUYWcgPSB0ZW1wbGF0ZUNvbW1hbmRbMF07XG5cdFx0XHRpZiAodGVtcGxhdGVDb21tYW5kKSB7XG5cdFx0XHRcdGlmICghaXNFbmRUYWcgJiYgdGVtcGxhdGVDb21tYW5kWzFdID09PSBcInZlcmJhdGltXCIpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVhZFZlcmJhdGltKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWlzRW5kVGFnICYmIHRlbXBsYXRlQ29tbWFuZFsxXSA9PT0gXCIhXCIpIHtcblx0XHRcdFx0XHRTLmNvbW1lbnRzQmVmb3JlLnB1c2goXG5cdFx0XHRcdFx0XHRyZWFkTXVsdGlsaW5lVGVtcGxhdGVDb21tZW50KCkpO1xuXHRcdFx0XHRcdHJldHVybiBuZXh0VG9rZW4oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRTLnRlbXBsYXRlTW9kZSA9IFRNUExfTU9ERV9DT01NQU5EO1xuXHRcdFx0XHRcdFMuY3VybHlDb3VudCA9IDA7XG5cblx0XHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRcdGlmIChpc0VuZFRhZykgeyAvLyBhbHNvIGVhdCB1cCBcIi9cIiBmb3IgZW5kIGNvbW1hbmRzXG5cdFx0XHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdG9rZW4oXCJ0cHVuY1wiLCBcInt7L1wiKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRva2VuKFwidHB1bmNcIiwgXCJ7e1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHBhcnNlRXJyb3IoXCJFcnJvciBwYXJzaW5nIHRlbXBsYXRlXCIpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZFZlcmJhdGltKCkge1xuXHRcdG5leHQoKTtcblx0XHRyZXR1cm4gd2l0aEVvZkVycm9yKFwiVW50ZXJtaW5hdGVkIHt7dmVyYmF0aW19fVwiLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgaSA9IGZpbmQoXCJ7ey92ZXJiYXRpbX19XCIsIHRydWUpLFxuXHRcdFx0XHR0ZXh0ID0gUy50ZXh0LnN1YnN0cmluZyhTLnBvcyArIDExLCBpKTtcblx0XHRcdFMucG9zID0gaSArIDEzO1xuXHRcdFx0Uy5saW5lICs9IHRleHQuc3BsaXQoXCJcXG5cIikubGVuZ3RoIC0gMTtcblx0XHRcdFMubmV3bGluZUJlZm9yZSA9IHRleHQuaW5kZXhPZihcIlxcblwiKSA+PSAwO1xuXG5cdFx0XHRyZXR1cm4gdG9rZW4oXCJodG1sXCIsIHRleHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZFRlbXBsYXRlKCkge1xuXHRcdHZhciByZXQgPSBcIlwiO1xuXG5cdFx0Zm9yICg7Oykge1xuXHRcdFx0dmFyIHAgPSBwZWVrKCk7XG5cdFx0XHRpZiAocCA9PT0gXCIkXCIgJiYgcGVla1RlbXBsYXRlVmFyaWFibGUoKSB8fFxuXHRcdFx0XHRwID09PSBcIntcIiAmJiBwZWVrVGVtcGxhdGVDb21tYW5kKCkpIHtcblx0XHRcdFx0aWYgKHJldCA9PT0gXCJcIikge1xuXHRcdFx0XHRcdHJldHVybiByZWFkVHB1bmMoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR2YXIgY2ggPSBuZXh0KCk7XG5cdFx0XHRpZiAoIWNoKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0cmV0ICs9IGNoO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b2tlbihcImh0bWxcIiwgcmV0KTtcblx0fVxuXG5cblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG5cdC8vICAgICAgICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXHQvLyAgICAgICAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG5cdC8vICAgICAgICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXHQvLyAgICAgICAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG5cdC8vICAgICAgICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXHQvLyAgICAgICAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gICAgICAgIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG5cblxuXHRmdW5jdGlvbiBoYW5kbGVTbGFzaCgpIHtcblx0XHRuZXh0KCk7XG5cdFx0dmFyIHJlZ2V4QWxsb3dlZCA9IFMucmVnZXhBbGxvd2VkO1xuXHRcdHN3aXRjaCAocGVlaygpKSB7XG5cdFx0Y2FzZSBcIi9cIjpcblx0XHRcdFMuY29tbWVudHNCZWZvcmUucHVzaChyZWFkTGluZUNvbW1lbnQoKSk7XG5cdFx0XHRTLnJlZ2V4QWxsb3dlZCA9IHJlZ2V4QWxsb3dlZDtcblx0XHRcdHJldHVybiBuZXh0VG9rZW4oKTtcblx0XHRjYXNlIFwiKlwiOlxuXHRcdFx0Uy5jb21tZW50c0JlZm9yZS5wdXNoKHJlYWRNdWx0aWxpbmVDb21tZW50KCkpO1xuXHRcdFx0Uy5yZWdleEFsbG93ZWQgPSByZWdleEFsbG93ZWQ7XG5cdFx0XHRyZXR1cm4gbmV4dFRva2VuKCk7XG5cdFx0fVxuXHRcdHJldHVybiBTLnJlZ2V4QWxsb3dlZCA/IHJlYWRSZWdleHAoXCJcIikgOiByZWFkT3BlcmF0b3IoXCIvXCIpO1xuXHR9XG5cblx0ZnVuY3Rpb24gaGFuZGxlRG90KCkge1xuXHRcdG5leHQoKTtcblx0XHRyZXR1cm4gaXNEaWdpdChwZWVrKCkpID8gcmVhZE51bShcIi5cIikgOiB0b2tlbihcInB1bmNcIiwgXCIuXCIpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZFdvcmQoKSB7XG5cdFx0dmFyIHdvcmQgPSByZWFkTmFtZSgpO1xuXHRcdHJldHVybiAhSE9QKEtFWVdPUkRTLCB3b3JkKSA/IHRva2VuKFwibmFtZVwiLCB3b3JkKSA6XG5cdFx0XHRIT1AoT1BFUkFUT1JTLCB3b3JkKSA/IHRva2VuKFwib3BlcmF0b3JcIiwgd29yZCkgOlxuXHRcdFx0SE9QKEtFWVdPUkRTX0FUT00sIHdvcmQpID8gdG9rZW4oXCJhdG9tXCIsIHdvcmQpIDpcblx0XHRcdHRva2VuKFwia2V5d29yZFwiLCB3b3JkKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHdpdGhFb2ZFcnJvcihlb2ZFcnJvciwgY29udCkge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gY29udCgpO1xuXHRcdH0gY2F0Y2ggKGV4KSB7XG5cdFx0XHRpZiAoZXggPT09IEVYX0VPRikge1xuXHRcdFx0XHRwYXJzZUVycm9yKGVvZkVycm9yKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGV4O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIG5leHRUb2tlbihmb3JjZVJlZ2V4cCkge1xuXHRcdGlmIChmb3JjZVJlZ2V4cCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gcmVhZFJlZ2V4cChmb3JjZVJlZ2V4cCk7XG5cdFx0fVxuXG5cdFx0aWYgKFMudGVtcGxhdGVNb2RlICE9PSBUTVBMX01PREVfSFRNTCkge1xuXHRcdFx0c2tpcFdoaXRlc3BhY2UoKTtcblx0XHR9XG5cblx0XHRzdGFydFRva2VuKCk7XG5cdFx0dmFyIGNoID0gcGVlaygpO1xuXHRcdGlmICghY2gpIHtcblx0XHRcdHJldHVybiB0b2tlbihcImVvZlwiKTtcblx0XHR9XG5cblx0XHQvLyB0ZW1wbGF0ZSBtb2RlXG5cdFx0aWYgKFMudGVtcGxhdGVNb2RlID09PSBUTVBMX01PREVfQ09NTUFORCB8fFxuXHRcdFx0Uy50ZW1wbGF0ZU1vZGUgPT09IFRNUExfTU9ERV9WQVJJQUJMRSkge1xuXHRcdFx0aWYgKGNoID09PSBcIntcIikge1xuXHRcdFx0XHRTLmN1cmx5Q291bnQrKztcblx0XHRcdH0gZWxzZSBpZiAoY2ggPT09IFwifVwiKSB7XG5cdFx0XHRcdGlmIChTLmN1cmx5Q291bnQgPT09IDApIHtcblx0XHRcdFx0XHRpZiAoUy50ZW1wbGF0ZU1vZGUgPT09IFRNUExfTU9ERV9DT01NQU5EKSB7XG5cdFx0XHRcdFx0XHRpZiAocGVlaygpICE9PSBcIn1cIikge1xuXHRcdFx0XHRcdFx0XHRwYXJzZUVycm9yKFxuXHRcdFx0XHRcdFx0XHRcdFwiRXhwZWN0ZWQgY2xvc2luZyAnfX0nIGhlcmUgZ290ICd9XCIgK1xuXHRcdFx0XHRcdFx0XHRcdGNoICsgXCInXCIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRcdFx0Uy50ZW1wbGF0ZU1vZGUgPSBUTVBMX01PREVfSFRNTDtcblx0XHRcdFx0XHRcdHJldHVybiB0b2tlbihcInRwdW5jXCIsIFwifX1cIik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0XHRcdFMudGVtcGxhdGVNb2RlID0gVE1QTF9NT0RFX0hUTUw7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdG9rZW4oXCJ0cHVuY1wiLCBcIn1cIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdFMuY3VybHlDb3VudC0tO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBlbmQgdGVtcGxhdGUgbW9kZVxuXG5cdFx0aWYgKFMudGVtcGxhdGVNb2RlID09PSBUTVBMX01PREVfSFRNTCkge1xuXHRcdFx0cmV0dXJuIHJlYWRUZW1wbGF0ZSgpO1xuXHRcdH1cblx0XHRpZiAoaXNEaWdpdChjaCkpIHtcblx0XHRcdHJldHVybiByZWFkTnVtKCk7XG5cdFx0fVxuXHRcdGlmIChjaCA9PT0gXCJcXFwiXCIgfHwgY2ggPT09IFwiJ1wiKSB7XG5cdFx0XHRyZXR1cm4gcmVhZFN0cmluZygpO1xuXHRcdH1cblx0XHRpZiAoSE9QKFBVTkNfQ0hBUlMsIGNoKSkge1xuXHRcdFx0cmV0dXJuIHRva2VuKFwicHVuY1wiLCBuZXh0KCkpO1xuXHRcdH1cblx0XHRpZiAoY2ggPT09IFwiLlwiKSB7XG5cdFx0XHRyZXR1cm4gaGFuZGxlRG90KCk7XG5cdFx0fVxuXHRcdGlmIChjaCA9PT0gXCIvXCIpIHtcblx0XHRcdHJldHVybiBoYW5kbGVTbGFzaCgpO1xuXHRcdH1cblx0XHRpZiAoSE9QKE9QRVJBVE9SX0NIQVJTLCBjaCkpIHtcblx0XHRcdHJldHVybiByZWFkT3BlcmF0b3IoKTtcblx0XHR9XG5cdFx0aWYgKGNoID09PSBcIlxcXFxcIiB8fCBpc0lkZW50aWZpZXJTdGFydChjaCkpIHtcblx0XHRcdHJldHVybiByZWFkV29yZCgpO1xuXHRcdH1cblxuXHRcdHBhcnNlRXJyb3IoXCJVbmV4cGVjdGVkIGNoYXJhY3RlciAnXCIgKyBjaCArIFwiJ1wiKTtcblx0fVxuXG5cdG5leHRUb2tlbi5jb250ZXh0ID0gZnVuY3Rpb24gKG5jKSB7XG5cdFx0aWYgKG5jKSB7XG5cdFx0XHRTID0gbmM7XG5cdFx0fVxuXHRcdHJldHVybiBTO1xuXHR9O1xuXG5cdHJldHVybiBuZXh0VG9rZW47XG59XG5cbi8qIC0tLS0tWyBQYXJzZXIgKGNvbnN0YW50cykgXS0tLS0tICovXG5cbnZhciBVTkFSWV9QUkVGSVggPSBhcnJheVRvSGFzaChbXG5cdFwidHlwZW9mXCIsXG5cdFwidm9pZFwiLFxuXHRcImRlbGV0ZVwiLFxuXHRcIi0tXCIsXG5cdFwiKytcIixcblx0XCIhXCIsXG5cdFwiflwiLFxuXHRcIi1cIixcblx0XCIrXCJcbl0pO1xuXG52YXIgVU5BUllfUE9TVEZJWCA9IGFycmF5VG9IYXNoKFtcIi0tXCIsIFwiKytcIl0pO1xuXG52YXIgQVNTSUdOTUVOVCA9IChmdW5jdGlvbiAoYSwgcmV0LCBpKSB7XG5cdHdoaWxlIChpIDwgYS5sZW5ndGgpIHtcblx0XHRyZXRbYVtpXV0gPSBhW2ldLnN1YnN0cigwLCBhW2ldLmxlbmd0aCAtIDEpO1xuXHRcdGkrKztcblx0fVxuXHRyZXR1cm4gcmV0O1xufSkoXG5cdFtcIis9XCIsIFwiLT1cIiwgXCIvPVwiLCBcIio9XCIsIFwiJT1cIiwgXCI+Pj1cIiwgXCI8PD1cIiwgXCI+Pj49XCIsIFwifD1cIiwgXCJePVwiLFxuXHRcdFwiJj1cIlxuXHRdLCB7XG5cdFx0XCI9XCI6IHRydWVcblx0fSxcblx0MFxuKTtcblxudmFyIFBSRUNFREVOQ0UgPSAoZnVuY3Rpb24gKGEsIHJldCkge1xuXHRmb3IgKHZhciBpID0gMCwgbiA9IDE7IGkgPCBhLmxlbmd0aDsgKytpLCArK24pIHtcblx0XHR2YXIgYiA9IGFbaV07XG5cdFx0Zm9yICh2YXIgaiA9IDA7IGogPCBiLmxlbmd0aDsgKytqKSB7XG5cdFx0XHRyZXRbYltqXV0gPSBuO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmV0O1xufSkoXG5cdFtcblx0XHRbXCJ8fFwiXSxcblx0XHRbXCImJlwiXSxcblx0XHRbXCJ8XCJdLFxuXHRcdFtcIl5cIl0sXG5cdFx0W1wiJlwiXSxcblx0XHRbXCI9PVwiLCBcIj09PVwiLCBcIiE9XCIsIFwiIT09XCJdLFxuXHRcdFtcIjxcIiwgXCI+XCIsIFwiPD1cIiwgXCI+PVwiLCBcImluXCIsIFwiaW5zdGFuY2VvZlwiXSxcblx0XHRbXCI+PlwiLCBcIjw8XCIsIFwiPj4+XCJdLFxuXHRcdFtcIitcIiwgXCItXCJdLFxuXHRcdFtcIipcIiwgXCIvXCIsIFwiJVwiXVxuXHRdLCB7fVxuKTtcblxudmFyIFNUQVRFTUVOVFNfV0lUSF9MQUJFTFMgPSBhcnJheVRvSGFzaChbXCJmb3JcIiwgXCJkb1wiLCBcIndoaWxlXCIsXG5cdFwic3dpdGNoXCJcbl0pO1xuXG52YXIgQVRPTUlDX1NUQVJUX1RPS0VOID0gYXJyYXlUb0hhc2goXG5cdFtcImF0b21cIiwgXCJudW1cIiwgXCJzdHJpbmdcIiwgXCJyZWdleHBcIiwgXCJuYW1lXCJdKTtcblxuLyogLS0tLS1bIFBhcnNlciBdLS0tLS0gKi9cblxuZnVuY3Rpb24gTm9kZVdpdGhUb2tlbihzdHIsIHN0YXJ0LCBlbmQpIHtcblx0dGhpcy5uYW1lID0gc3RyO1xuXHR0aGlzLnN0YXJ0ID0gc3RhcnQ7XG5cdHRoaXMuZW5kID0gZW5kO1xufVxuXG5Ob2RlV2l0aFRva2VuLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuIHRoaXMubmFtZTtcbn07XG5cbmZ1bmN0aW9uIHBhcnNlKCRURVhULCBleGlnZW50TW9kZSwgZW1iZWRUb2tlbnMsIGhhc1RlbXBsYXRlTW9kZSkge1xuXG5cdHZhciBTID0ge1xuXHRcdGlucHV0OiB0eXBlb2YgJFRFWFQgPT09IFwic3RyaW5nXCIgPyB0b2tlbml6ZXIoJFRFWFQsXG5cdFx0XHRoYXNUZW1wbGF0ZU1vZGUpIDogJFRFWFQsXG5cdFx0dG9rZW46IG51bGwsXG5cdFx0cHJldjogbnVsbCxcblx0XHRwZWVrZWQ6IG51bGwsXG5cdFx0aW5GdW5jdGlvbjogMCxcblx0XHRpbkxvb3A6IDAsXG5cdFx0bGFiZWxzOiBbXVxuXHR9O1xuXG5cdFMudG9rZW4gPSBuZXh0KCk7XG5cblx0ZnVuY3Rpb24gaXModHlwZSwgdmFsdWUpIHtcblx0XHRyZXR1cm4gaXNUb2tlbihTLnRva2VuLCB0eXBlLCB2YWx1ZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBwZWVrKCkge1xuXHRcdHJldHVybiBTLnBlZWtlZCB8fCAoUy5wZWVrZWQgPSBTLmlucHV0KCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gbmV4dCgpIHtcblx0XHRTLnByZXYgPSBTLnRva2VuO1xuXHRcdGlmIChTLnBlZWtlZCkge1xuXHRcdFx0Uy50b2tlbiA9IFMucGVla2VkO1xuXHRcdFx0Uy5wZWVrZWQgPSBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRTLnRva2VuID0gUy5pbnB1dCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gUy50b2tlbjtcblx0fVxuXG5cdGZ1bmN0aW9uIHByZXYoKSB7XG5cdFx0cmV0dXJuIFMucHJldjtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyb2FrKG1zZywgbGluZSwgY29sLCBwb3MpIHtcblx0XHR2YXIgY3R4ID0gUy5pbnB1dC5jb250ZXh0KCk7XG5cdFx0dGhyb3dQYXJzZUVycm9yKG1zZyxcblx0XHRcdGxpbmUgIT09IG51bGwgPyBsaW5lIDogY3R4LnRva2xpbmUsXG5cdFx0XHRjb2wgIT09IG51bGwgPyBjb2wgOiBjdHgudG9rY29sLFxuXHRcdFx0cG9zICE9PSBudWxsID8gcG9zIDogY3R4LnRva3Bvcyk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b2tlbkVycm9yKHRva2VuLCBtc2cpIHtcblx0XHRjcm9hayhtc2csIHRva2VuLmxpbmUsIHRva2VuLmNvbCk7XG5cdH1cblxuXHRmdW5jdGlvbiB1bmV4cGVjdGVkKHRva2VuKSB7XG5cdFx0aWYgKHRva2VuID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRva2VuID0gUy50b2tlbjtcblx0XHR9XG5cdFx0dG9rZW5FcnJvcih0b2tlbiwgXCJVbmV4cGVjdGVkIHRva2VuOiBcIiArIHRva2VuLnR5cGUgK1xuXHRcdFx0XCIgKFwiICsgdG9rZW4udmFsdWUgKyBcIilcIik7XG5cdH1cblxuXHRmdW5jdGlvbiBleHBlY3RUb2tlbih0eXBlLCB2YWwpIHtcblx0XHRpZiAoaXModHlwZSwgdmFsKSkge1xuXHRcdFx0cmV0dXJuIG5leHQoKTtcblx0XHR9XG5cdFx0dG9rZW5FcnJvcihTLnRva2VuLCBcIlVuZXhwZWN0ZWQgdG9rZW4gXCIgKyBTLnRva2VuLnR5cGUgK1xuXHRcdFx0XCIsIGV4cGVjdGVkIFwiICsgdHlwZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBleHBlY3QocHVuYykge1xuXHRcdHJldHVybiBleHBlY3RUb2tlbihcInB1bmNcIiwgcHVuYyk7XG5cdH1cblxuXHRmdW5jdGlvbiBjYW5JbnNlcnRTZW1pY29sb24oKSB7XG5cdFx0cmV0dXJuICFleGlnZW50TW9kZSAmJiAoXG5cdFx0XHRTLnRva2VuLm5sYiB8fCBpcyhcImVvZlwiKSB8fCBpcyhcInB1bmNcIiwgXCJ9XCIpXG5cdFx0KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNlbWljb2xvbigpIHtcblx0XHRpZiAoaXMoXCJwdW5jXCIsIFwiO1wiKSkge1xuXHRcdFx0bmV4dCgpO1xuXHRcdH0gZWxzZSBpZiAoIWNhbkluc2VydFNlbWljb2xvbigpKSB7XG5cdFx0XHR1bmV4cGVjdGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gYXMoKSB7XG5cdFx0cmV0dXJuIHNsaWNlKGFyZ3VtZW50cyk7XG5cdH1cblxuXHRmdW5jdGlvbiBwYXJlbnRoZXNpc2VkKCkge1xuXHRcdGV4cGVjdChcIihcIik7XG5cdFx0dmFyIGV4ID0gZXhwcmVzc2lvbigpO1xuXHRcdGV4cGVjdChcIilcIik7XG5cdFx0cmV0dXJuIGV4O1xuXHR9XG5cblx0ZnVuY3Rpb24gYWRkVG9rZW5zKHN0ciwgc3RhcnQsIGVuZCkge1xuXHRcdHJldHVybiBzdHIgaW5zdGFuY2VvZiBOb2RlV2l0aFRva2VuID8gc3RyIDpcblx0XHRcdG5ldyBOb2RlV2l0aFRva2VuKHN0ciwgc3RhcnQsIGVuZCk7XG5cdH1cblxuXHRmdW5jdGlvbiBtYXliZUVtYmVkVG9rZW5zKHBhcnNlcikge1xuXHRcdGlmIChlbWJlZFRva2Vucykge1xuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0dmFyIHN0YXJ0ID0gUy50b2tlbjtcblx0XHRcdFx0dmFyIGFzdCA9IHBhcnNlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdFx0XHRhc3RbMF0gPSBhZGRUb2tlbnMoYXN0WzBdLCBzdGFydCwgcHJldigpKTtcblx0XHRcdFx0cmV0dXJuIGFzdDtcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBwYXJzZXI7XG5cdFx0fVxuXHR9XG5cblx0dmFyIHN0YXRlbWVudCA9IG1heWJlRW1iZWRUb2tlbnMoZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpcyhcIm9wZXJhdG9yXCIsIFwiL1wiKSB8fCBpcyhcIm9wZXJhdG9yXCIsIFwiLz1cIikpIHtcblx0XHRcdFMucGVla2VkID0gbnVsbDtcblx0XHRcdFMudG9rZW4gPSBTLmlucHV0KFMudG9rZW4udmFsdWUuc3Vic3RyKDEpKTsgLy8gZm9yY2UgcmVnZXhwXG5cdFx0fVxuXHRcdHN3aXRjaCAoUy50b2tlbi50eXBlKSB7XG5cdFx0Y2FzZSBcIm51bVwiOlxuXHRcdGNhc2UgXCJzdHJpbmdcIjpcblx0XHRjYXNlIFwicmVnZXhwXCI6XG5cdFx0Y2FzZSBcIm9wZXJhdG9yXCI6XG5cdFx0Y2FzZSBcImF0b21cIjpcblx0XHRcdHJldHVybiBzaW1wbGVTdGF0ZW1lbnQoKTtcblxuXHRcdGNhc2UgXCJuYW1lXCI6XG5cdFx0XHRyZXR1cm4gaXNUb2tlbihwZWVrKCksIFwicHVuY1wiLCBcIjpcIikgP1xuXHRcdFx0XHRsYWJlbGVkU3RhdGVtZW50KHByb2cxKFMudG9rZW4udmFsdWUsIG5leHQsIG5leHQpKSA6XG5cdFx0XHRcdHNpbXBsZVN0YXRlbWVudCgpO1xuXG5cdFx0Y2FzZSBcInB1bmNcIjpcblx0XHRcdHN3aXRjaCAoUy50b2tlbi52YWx1ZSkge1xuXHRcdFx0Y2FzZSBcIntcIjpcblx0XHRcdFx0cmV0dXJuIGFzKFwiYmxvY2tcIiwgYmxvY2skKCkpO1xuXHRcdFx0Y2FzZSBcIltcIjpcblx0XHRcdGNhc2UgXCIoXCI6XG5cdFx0XHRcdHJldHVybiBzaW1wbGVTdGF0ZW1lbnQoKTtcblx0XHRcdGNhc2UgXCI7XCI6XG5cdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0cmV0dXJuIGFzKFwiYmxvY2tcIik7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR1bmV4cGVjdGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwia2V5d29yZFwiOlxuXHRcdFx0c3dpdGNoIChwcm9nMShTLnRva2VuLnZhbHVlLCBuZXh0KSkge1xuXHRcdFx0Y2FzZSBcImJyZWFrXCI6XG5cdFx0XHRcdHJldHVybiBicmVha0NvbnQoXCJicmVha1wiKTtcblxuXHRcdFx0Y2FzZSBcImNvbnRpbnVlXCI6XG5cdFx0XHRcdHJldHVybiBicmVha0NvbnQoXCJjb250aW51ZVwiKTtcblxuXHRcdFx0Y2FzZSBcImRlYnVnZ2VyXCI6XG5cdFx0XHRcdHNlbWljb2xvbigpO1xuXHRcdFx0XHRyZXR1cm4gYXMoXCJkZWJ1Z2dlclwiKTtcblxuXHRcdFx0Y2FzZSBcImRvXCI6XG5cdFx0XHRcdHJldHVybiAoZnVuY3Rpb24gKGJvZHkpIHtcblx0XHRcdFx0XHRleHBlY3RUb2tlbihcImtleXdvcmRcIiwgXCJ3aGlsZVwiKTtcblx0XHRcdFx0XHRyZXR1cm4gYXMoXCJkb1wiLCBwcm9nMShwYXJlbnRoZXNpc2VkLFxuXHRcdFx0XHRcdFx0XHRzZW1pY29sb24pLFxuXHRcdFx0XHRcdFx0Ym9keSk7XG5cdFx0XHRcdH0pKGluTG9vcChzdGF0ZW1lbnQpKTtcblxuXHRcdFx0Y2FzZSBcImZvclwiOlxuXHRcdFx0XHRyZXR1cm4gZm9yJCgpO1xuXG5cdFx0XHRjYXNlIFwiZnVuY3Rpb25cIjpcblx0XHRcdFx0cmV0dXJuIGZ1bmN0aW9uJCh0cnVlKTtcblxuXHRcdFx0Y2FzZSBcImlmXCI6XG5cdFx0XHRcdHJldHVybiBpZiQoKTtcblxuXHRcdFx0Y2FzZSBcInJldHVyblwiOlxuXHRcdFx0XHRpZiAoUy5pbkZ1bmN0aW9uID09PSAwKSB7XG5cdFx0XHRcdFx0Y3JvYWsoXCIncmV0dXJuJyBvdXRzaWRlIG9mIGZ1bmN0aW9uXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhcyhcInJldHVyblwiLFxuXHRcdFx0XHRcdGlzKFwicHVuY1wiLCBcIjtcIikgPyAobmV4dCgpLCBudWxsKSA6XG5cdFx0XHRcdFx0Y2FuSW5zZXJ0U2VtaWNvbG9uKCkgPyBudWxsIDpcblx0XHRcdFx0XHRwcm9nMShleHByZXNzaW9uLCBzZW1pY29sb24pKTtcblxuXHRcdFx0Y2FzZSBcInN3aXRjaFwiOlxuXHRcdFx0XHRyZXR1cm4gYXMoXCJzd2l0Y2hcIiwgcGFyZW50aGVzaXNlZCgpLCBzd2l0Y2hCbG9jayQoKSk7XG5cblx0XHRcdGNhc2UgXCJ0aHJvd1wiOlxuXHRcdFx0XHRpZiAoUy50b2tlbi5ubGIpIHtcblx0XHRcdFx0XHRjcm9hayhcIklsbGVnYWwgbmV3bGluZSBhZnRlciAndGhyb3cnXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhcyhcInRocm93XCIsIHByb2cxKGV4cHJlc3Npb24sIHNlbWljb2xvbikpO1xuXG5cdFx0XHRjYXNlIFwidHJ5XCI6XG5cdFx0XHRcdHJldHVybiB0cnkkKCk7XG5cblx0XHRcdGNhc2UgXCJ2YXJcIjpcblx0XHRcdFx0cmV0dXJuIHByb2cxKHZhciQsIHNlbWljb2xvbik7XG5cblx0XHRcdGNhc2UgXCJjb25zdFwiOlxuXHRcdFx0XHRyZXR1cm4gcHJvZzEoY29uc3QkLCBzZW1pY29sb24pO1xuXG5cdFx0XHRjYXNlIFwid2hpbGVcIjpcblx0XHRcdFx0cmV0dXJuIGFzKFwid2hpbGVcIiwgcGFyZW50aGVzaXNlZCgpLCBpbkxvb3AoXG5cdFx0XHRcdFx0c3RhdGVtZW50KSk7XG5cblx0XHRcdGNhc2UgXCJ3aXRoXCI6XG5cdFx0XHRcdHJldHVybiBhcyhcIndpdGhcIiwgcGFyZW50aGVzaXNlZCgpLCBzdGF0ZW1lbnQoKSk7XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHVuZXhwZWN0ZWQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGxhYmVsZWRTdGF0ZW1lbnQobGFiZWwpIHtcblx0XHRTLmxhYmVscy5wdXNoKGxhYmVsKTtcblx0XHR2YXIgc3RhcnQgPSBTLnRva2VuLFxuXHRcdFx0c3RhdCA9IHN0YXRlbWVudCgpO1xuXHRcdGlmIChleGlnZW50TW9kZSAmJiAhSE9QKFNUQVRFTUVOVFNfV0lUSF9MQUJFTFMsIHN0YXRbMF0pKSB7XG5cdFx0XHR1bmV4cGVjdGVkKHN0YXJ0KTtcblx0XHR9XG5cdFx0Uy5sYWJlbHMucG9wKCk7XG5cdFx0cmV0dXJuIGFzKFwibGFiZWxcIiwgbGFiZWwsIHN0YXQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2ltcGxlU3RhdGVtZW50KCkge1xuXHRcdHJldHVybiBhcyhcInN0YXRcIiwgcHJvZzEoZXhwcmVzc2lvbiwgc2VtaWNvbG9uKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBicmVha0NvbnQodHlwZSkge1xuXHRcdHZhciBuYW1lO1xuXHRcdGlmICghY2FuSW5zZXJ0U2VtaWNvbG9uKCkpIHtcblx0XHRcdG5hbWUgPSBpcyhcIm5hbWVcIikgPyBTLnRva2VuLnZhbHVlIDogbnVsbDtcblx0XHR9XG5cdFx0aWYgKG5hbWUgIT09IG51bGwpIHtcblx0XHRcdG5leHQoKTtcblx0XHRcdGlmICghbWVtYmVyKG5hbWUsIFMubGFiZWxzKSkge1xuXHRcdFx0XHRjcm9hayhcIkxhYmVsIFwiICsgbmFtZSArXG5cdFx0XHRcdFx0XCIgd2l0aG91dCBtYXRjaGluZyBsb29wIG9yIHN0YXRlbWVudFwiKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKFMuaW5Mb29wID09PSAwKSB7XG5cdFx0XHRjcm9hayh0eXBlICsgXCIgbm90IGluc2lkZSBhIGxvb3Agb3Igc3dpdGNoXCIpO1xuXHRcdH1cblx0XHRzZW1pY29sb24oKTtcblx0XHRyZXR1cm4gYXModHlwZSwgbmFtZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBmb3IkKCkge1xuXHRcdGV4cGVjdChcIihcIik7XG5cdFx0dmFyIGluaXQgPSBudWxsO1xuXHRcdGlmICghaXMoXCJwdW5jXCIsIFwiO1wiKSkge1xuXHRcdFx0aW5pdCA9IGlzKFwia2V5d29yZFwiLCBcInZhclwiKSA/IChuZXh0KCksIHZhciQodHJ1ZSkpIDpcblx0XHRcdFx0ZXhwcmVzc2lvbih0cnVlLCB0cnVlKTtcblx0XHRcdGlmIChpcyhcIm9wZXJhdG9yXCIsIFwiaW5cIikpIHtcblx0XHRcdFx0aWYgKGluaXRbMF0gPT09IFwidmFyXCIgJiYgaW5pdFsxXS5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0Y3JvYWsoXCJPbmx5IG9uZSB2YXJpYWJsZSBkZWNsYXJhdGlvbiBhbGxvd2VkIFwiICtcblx0XHRcdFx0XHRcdFwiaW4gZm9yLi5pbiBsb29wXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmb3JJbihpbml0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlZ3VsYXJGb3IoaW5pdCk7XG5cdH1cblxuXHRmdW5jdGlvbiByZWd1bGFyRm9yKGluaXQpIHtcblx0XHRleHBlY3QoXCI7XCIpO1xuXHRcdHZhciB0ZXN0ID0gaXMoXCJwdW5jXCIsIFwiO1wiKSA/IG51bGwgOiBleHByZXNzaW9uKCk7XG5cdFx0ZXhwZWN0KFwiO1wiKTtcblx0XHR2YXIgc3RlcCA9IGlzKFwicHVuY1wiLCBcIilcIikgPyBudWxsIDogZXhwcmVzc2lvbigpO1xuXHRcdGV4cGVjdChcIilcIik7XG5cdFx0cmV0dXJuIGFzKFwiZm9yXCIsIGluaXQsIHRlc3QsIHN0ZXAsIGluTG9vcChzdGF0ZW1lbnQpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZvckluKGluaXQpIHtcblx0XHR2YXIgbGhzID0gaW5pdFswXSA9PT0gXCJ2YXJcIiA/IGFzKFwibmFtZVwiLCBpbml0WzFdWzBdKSA6IGluaXQ7XG5cdFx0bmV4dCgpO1xuXHRcdHZhciBvYmogPSBleHByZXNzaW9uKCk7XG5cdFx0ZXhwZWN0KFwiKVwiKTtcblx0XHRyZXR1cm4gYXMoXCJmb3ItaW5cIiwgaW5pdCwgbGhzLCBvYmosIGluTG9vcChzdGF0ZW1lbnQpKTtcblx0fVxuXG5cdHZhciBmdW5jdGlvbiQgPSBmdW5jdGlvbiAoaW5TdGF0ZW1lbnQpIHtcblx0XHR2YXIgbmFtZSA9IGlzKFwibmFtZVwiKSA/IHByb2cxKFMudG9rZW4udmFsdWUsIG5leHQpIDogbnVsbDtcblx0XHRpZiAoaW5TdGF0ZW1lbnQgJiYgIW5hbWUpIHtcblx0XHRcdHVuZXhwZWN0ZWQoKTtcblx0XHR9XG5cdFx0ZXhwZWN0KFwiKFwiKTtcblx0XHRyZXR1cm4gYXMoaW5TdGF0ZW1lbnQgPyBcImRlZnVuXCIgOiBcImZ1bmN0aW9uXCIsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Ly8gYXJndW1lbnRzXG5cdFx0XHQoZnVuY3Rpb24gKGZpcnN0LCBhKSB7XG5cdFx0XHRcdHdoaWxlICghaXMoXCJwdW5jXCIsIFwiKVwiKSkge1xuXHRcdFx0XHRcdGlmIChmaXJzdCkge1xuXHRcdFx0XHRcdFx0Zmlyc3QgPSBmYWxzZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZXhwZWN0KFwiLFwiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFpcyhcIm5hbWVcIikpIHtcblx0XHRcdFx0XHRcdHVuZXhwZWN0ZWQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YS5wdXNoKFMudG9rZW4udmFsdWUpO1xuXHRcdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdHJldHVybiBhO1xuXHRcdFx0fSkodHJ1ZSwgW10pLFxuXHRcdFx0Ly8gYm9keVxuXHRcdFx0KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0KytTLmluRnVuY3Rpb247XG5cdFx0XHRcdHZhciBsb29wID0gUy5pbkxvb3A7XG5cdFx0XHRcdFMuaW5Mb29wID0gMDtcblx0XHRcdFx0dmFyIGEgPSBibG9jayQoKTtcblx0XHRcdFx0LS1TLmluRnVuY3Rpb247XG5cdFx0XHRcdFMuaW5Mb29wID0gbG9vcDtcblx0XHRcdFx0cmV0dXJuIGE7XG5cdFx0XHR9KSgpKTtcblx0fTtcblxuXHRmdW5jdGlvbiBpZiQoKSB7XG5cdFx0dmFyIGNvbmQgPSBwYXJlbnRoZXNpc2VkKCksXG5cdFx0XHRib2R5ID0gc3RhdGVtZW50KCksXG5cdFx0XHRiZWxzZTtcblx0XHRpZiAoaXMoXCJrZXl3b3JkXCIsIFwiZWxzZVwiKSkge1xuXHRcdFx0bmV4dCgpO1xuXHRcdFx0YmVsc2UgPSBzdGF0ZW1lbnQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFzKFwiaWZcIiwgY29uZCwgYm9keSwgYmVsc2UpO1xuXHR9XG5cblx0ZnVuY3Rpb24gYmxvY2skKCkge1xuXHRcdGV4cGVjdChcIntcIik7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHR3aGlsZSAoIWlzKFwicHVuY1wiLCBcIn1cIikpIHtcblx0XHRcdGlmIChpcyhcImVvZlwiKSkge1xuXHRcdFx0XHR1bmV4cGVjdGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRhLnB1c2goc3RhdGVtZW50KCkpO1xuXHRcdH1cblx0XHRuZXh0KCk7XG5cdFx0cmV0dXJuIGE7XG5cdH1cblxuXHR2YXIgc3dpdGNoQmxvY2skID0gY3VycnkoaW5Mb29wLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZXhwZWN0KFwie1wiKTtcblx0XHR2YXIgYSA9IFtdLFxuXHRcdFx0Y3VyID0gbnVsbDtcblx0XHR3aGlsZSAoIWlzKFwicHVuY1wiLCBcIn1cIikpIHtcblx0XHRcdGlmIChpcyhcImVvZlwiKSkge1xuXHRcdFx0XHR1bmV4cGVjdGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXMoXCJrZXl3b3JkXCIsIFwiY2FzZVwiKSkge1xuXHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdGN1ciA9IFtdO1xuXHRcdFx0XHRhLnB1c2goW2V4cHJlc3Npb24oKSwgY3VyXSk7XG5cdFx0XHRcdGV4cGVjdChcIjpcIik7XG5cdFx0XHR9IGVsc2UgaWYgKGlzKFwia2V5d29yZFwiLCBcImRlZmF1bHRcIikpIHtcblx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRleHBlY3QoXCI6XCIpO1xuXHRcdFx0XHRjdXIgPSBbXTtcblx0XHRcdFx0YS5wdXNoKFtudWxsLCBjdXJdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghY3VyKSB7XG5cdFx0XHRcdFx0dW5leHBlY3RlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN1ci5wdXNoKHN0YXRlbWVudCgpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0bmV4dCgpO1xuXHRcdHJldHVybiBhO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0cnkkKCkge1xuXHRcdHZhciBib2R5ID0gYmxvY2skKCksXG5cdFx0XHRiY2F0Y2gsIGJmaW5hbGx5O1xuXHRcdGlmIChpcyhcImtleXdvcmRcIiwgXCJjYXRjaFwiKSkge1xuXHRcdFx0bmV4dCgpO1xuXHRcdFx0ZXhwZWN0KFwiKFwiKTtcblx0XHRcdGlmICghaXMoXCJuYW1lXCIpKSB7XG5cdFx0XHRcdGNyb2FrKFwiTmFtZSBleHBlY3RlZFwiKTtcblx0XHRcdH1cblx0XHRcdHZhciBuYW1lID0gUy50b2tlbi52YWx1ZTtcblx0XHRcdG5leHQoKTtcblx0XHRcdGV4cGVjdChcIilcIik7XG5cdFx0XHRiY2F0Y2ggPSBbbmFtZSwgYmxvY2skKCldO1xuXHRcdH1cblx0XHRpZiAoaXMoXCJrZXl3b3JkXCIsIFwiZmluYWxseVwiKSkge1xuXHRcdFx0bmV4dCgpO1xuXHRcdFx0YmZpbmFsbHkgPSBibG9jayQoKTtcblx0XHR9XG5cdFx0aWYgKCFiY2F0Y2ggJiYgIWJmaW5hbGx5KSB7XG5cdFx0XHRjcm9hayhcIk1pc3NpbmcgY2F0Y2gvZmluYWxseSBibG9ja3NcIik7XG5cdFx0fVxuXHRcdHJldHVybiBhcyhcInRyeVwiLCBib2R5LCBiY2F0Y2gsIGJmaW5hbGx5KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHZhcmRlZnMobm9Jbikge1xuXHRcdHZhciBhID0gW107XG5cdFx0Zm9yICg7Oykge1xuXHRcdFx0aWYgKCFpcyhcIm5hbWVcIikpIHtcblx0XHRcdFx0dW5leHBlY3RlZCgpO1xuXHRcdFx0fVxuXHRcdFx0dmFyIG5hbWUgPSBTLnRva2VuLnZhbHVlO1xuXHRcdFx0bmV4dCgpO1xuXHRcdFx0aWYgKGlzKFwib3BlcmF0b3JcIiwgXCI9XCIpKSB7XG5cdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0YS5wdXNoKFtuYW1lLCBleHByZXNzaW9uKGZhbHNlLCBub0luKV0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YS5wdXNoKFtuYW1lXSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzKFwicHVuY1wiLCBcIixcIikpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRuZXh0KCk7XG5cdFx0fVxuXHRcdHJldHVybiBhO1xuXHR9XG5cblx0ZnVuY3Rpb24gdmFyJChub0luKSB7XG5cdFx0cmV0dXJuIGFzKFwidmFyXCIsIHZhcmRlZnMobm9JbikpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY29uc3QkKCkge1xuXHRcdHJldHVybiBhcyhcImNvbnN0XCIsIHZhcmRlZnMoKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBuZXckKCkge1xuXHRcdHZhciBuZXdleHAgPSBleHByQXRvbShmYWxzZSksXG5cdFx0XHRhcmdzO1xuXHRcdGlmIChpcyhcInB1bmNcIiwgXCIoXCIpKSB7XG5cdFx0XHRuZXh0KCk7XG5cdFx0XHRhcmdzID0gZXhwckxpc3QoXCIpXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmdzID0gW107XG5cdFx0fVxuXHRcdHJldHVybiBzdWJzY3JpcHRzKGFzKFwibmV3XCIsIG5ld2V4cCwgYXJncyksIHRydWUpO1xuXHR9XG5cblx0dmFyIGV4cHJBdG9tID0gbWF5YmVFbWJlZFRva2VucyhmdW5jdGlvbiAoYWxsb3dDYWxscykge1xuXHRcdGlmIChpcyhcIm9wZXJhdG9yXCIsIFwibmV3XCIpKSB7XG5cdFx0XHRuZXh0KCk7XG5cdFx0XHRyZXR1cm4gbmV3JCgpO1xuXHRcdH1cblx0XHRpZiAoaXMoXCJwdW5jXCIpKSB7XG5cdFx0XHRzd2l0Y2ggKFMudG9rZW4udmFsdWUpIHtcblx0XHRcdGNhc2UgXCIoXCI6XG5cdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0cmV0dXJuIHN1YnNjcmlwdHMocHJvZzEoZXhwcmVzc2lvbixcblx0XHRcdFx0XHRjdXJyeShleHBlY3QsIFwiKVwiKSksIGFsbG93Q2FsbHMpO1xuXHRcdFx0Y2FzZSBcIltcIjpcblx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRyZXR1cm4gc3Vic2NyaXB0cyhhcnJheSQoKSwgYWxsb3dDYWxscyk7XG5cdFx0XHRjYXNlIFwie1wiOlxuXHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdHJldHVybiBzdWJzY3JpcHRzKG9iamVjdCQoKSwgYWxsb3dDYWxscyk7XG5cdFx0XHR9XG5cdFx0XHR1bmV4cGVjdGVkKCk7XG5cdFx0fVxuXHRcdGlmIChpcyhcImtleXdvcmRcIiwgXCJmdW5jdGlvblwiKSkge1xuXHRcdFx0bmV4dCgpO1xuXHRcdFx0cmV0dXJuIHN1YnNjcmlwdHMoZnVuY3Rpb24kKGZhbHNlKSwgYWxsb3dDYWxscyk7XG5cdFx0fVxuXHRcdGlmIChIT1AoQVRPTUlDX1NUQVJUX1RPS0VOLCBTLnRva2VuLnR5cGUpKSB7XG5cdFx0XHR2YXIgYXRvbSA9IFMudG9rZW4udHlwZSA9PT0gXCJyZWdleHBcIiA/XG5cdFx0XHRcdGFzKFwicmVnZXhwXCIsIFMudG9rZW4udmFsdWVbMF0sIFMudG9rZW4udmFsdWVbMV0pIDpcblx0XHRcdFx0YXMoUy50b2tlbi50eXBlLCBTLnRva2VuLnZhbHVlKTtcblx0XHRcdHJldHVybiBzdWJzY3JpcHRzKHByb2cxKGF0b20sIG5leHQpLCBhbGxvd0NhbGxzKTtcblx0XHR9XG5cdFx0dW5leHBlY3RlZCgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBleHByTGlzdChjbG9zaW5nLCBhbGxvd1RyYWlsaW5nQ29tbWEsIGFsbG93RW1wdHkpIHtcblx0XHR2YXIgZmlyc3QgPSB0cnVlLFxuXHRcdFx0YSA9IFtdO1xuXHRcdHdoaWxlICghaXMoXCJwdW5jXCIsIGNsb3NpbmcpKSB7XG5cdFx0XHRpZiAoZmlyc3QpIHtcblx0XHRcdFx0Zmlyc3QgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4cGVjdChcIixcIik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWxsb3dUcmFpbGluZ0NvbW1hICYmIGlzKFwicHVuY1wiLCBjbG9zaW5nKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChpcyhcInB1bmNcIiwgXCIsXCIpICYmIGFsbG93RW1wdHkpIHtcblx0XHRcdFx0YS5wdXNoKFtcImF0b21cIiwgXCJ1bmRlZmluZWRcIl0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oZmFsc2UpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0bmV4dCgpO1xuXHRcdHJldHVybiBhO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXJyYXkkKCkge1xuXHRcdHJldHVybiBhcyhcImFycmF5XCIsIGV4cHJMaXN0KFwiXVwiLCAhZXhpZ2VudE1vZGUsIHRydWUpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIG9iamVjdCQoKSB7XG5cdFx0dmFyIGZpcnN0ID0gdHJ1ZSxcblx0XHRcdGEgPSBbXTtcblx0XHR3aGlsZSAoIWlzKFwicHVuY1wiLCBcIn1cIikpIHtcblx0XHRcdGlmIChmaXJzdCkge1xuXHRcdFx0XHRmaXJzdCA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXhwZWN0KFwiLFwiKTtcblx0XHRcdH1cblx0XHRcdGlmICghZXhpZ2VudE1vZGUgJiYgaXMoXCJwdW5jXCIsIFwifVwiKSkge1xuXHRcdFx0XHQvLyBhbGxvdyB0cmFpbGluZyBjb21tYVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHZhciB0eXBlID0gUy50b2tlbi50eXBlO1xuXHRcdFx0dmFyIG5hbWUgPSBhc1Byb3BlcnR5TmFtZSgpO1xuXHRcdFx0aWYgKHR5cGUgPT09IFwibmFtZVwiICYmIChuYW1lID09PSBcImdldFwiIHx8IG5hbWUgPT09IFwic2V0XCIpICYmICFcblx0XHRcdFx0aXMoXG5cdFx0XHRcdFx0XCJwdW5jXCIsIFwiOlwiKSkge1xuXHRcdFx0XHRhLnB1c2goW2FzTmFtZSgpLCBmdW5jdGlvbiQoZmFsc2UpLCBuYW1lXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRleHBlY3QoXCI6XCIpO1xuXHRcdFx0XHRhLnB1c2goW25hbWUsIGV4cHJlc3Npb24oZmFsc2UpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdG5leHQoKTtcblx0XHRyZXR1cm4gYXMoXCJvYmplY3RcIiwgYSk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc1Byb3BlcnR5TmFtZSgpIHtcblx0XHRzd2l0Y2ggKFMudG9rZW4udHlwZSkge1xuXHRcdGNhc2UgXCJudW1cIjpcblx0XHRjYXNlIFwic3RyaW5nXCI6XG5cdFx0XHRyZXR1cm4gcHJvZzEoUy50b2tlbi52YWx1ZSwgbmV4dCk7XG5cdFx0fVxuXHRcdHJldHVybiBhc05hbWUoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzTmFtZSgpIHtcblx0XHRzd2l0Y2ggKFMudG9rZW4udHlwZSkge1xuXHRcdGNhc2UgXCJuYW1lXCI6XG5cdFx0Y2FzZSBcIm9wZXJhdG9yXCI6XG5cdFx0Y2FzZSBcImtleXdvcmRcIjpcblx0XHRjYXNlIFwiYXRvbVwiOlxuXHRcdFx0cmV0dXJuIHByb2cxKFMudG9rZW4udmFsdWUsIG5leHQpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHR1bmV4cGVjdGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc3Vic2NyaXB0cyhleHByLCBhbGxvd0NhbGxzKSB7XG5cdFx0aWYgKGlzKFwicHVuY1wiLCBcIi5cIikpIHtcblx0XHRcdG5leHQoKTtcblx0XHRcdHJldHVybiBzdWJzY3JpcHRzKGFzKFwiZG90XCIsIGV4cHIsIGFzTmFtZSgpKSwgYWxsb3dDYWxscyk7XG5cdFx0fVxuXHRcdGlmIChpcyhcInB1bmNcIiwgXCJbXCIpKSB7XG5cdFx0XHRuZXh0KCk7XG5cdFx0XHRyZXR1cm4gc3Vic2NyaXB0cyhhcyhcInN1YlwiLCBleHByLFxuXHRcdFx0XHRcdHByb2cxKGV4cHJlc3Npb24sIGN1cnJ5KGV4cGVjdCwgXCJdXCIpKSksXG5cdFx0XHRcdGFsbG93Q2FsbHMpO1xuXHRcdH1cblx0XHRpZiAoYWxsb3dDYWxscyAmJiBpcyhcInB1bmNcIiwgXCIoXCIpKSB7XG5cdFx0XHRuZXh0KCk7XG5cdFx0XHRyZXR1cm4gc3Vic2NyaXB0cyhhcyhcImNhbGxcIiwgZXhwciwgZXhwckxpc3QoXCIpXCIpKSwgdHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBleHByO1xuXHR9XG5cblx0ZnVuY3Rpb24gbWF5YmVVbmFyeShhbGxvd0NhbGxzKSB7XG5cdFx0aWYgKGlzKFwib3BlcmF0b3JcIikgJiYgSE9QKFVOQVJZX1BSRUZJWCwgUy50b2tlbi52YWx1ZSkpIHtcblx0XHRcdHJldHVybiBtYWtlVW5hcnkoXCJ1bmFyeS1wcmVmaXhcIixcblx0XHRcdFx0cHJvZzEoUy50b2tlbi52YWx1ZSwgbmV4dCksXG5cdFx0XHRcdG1heWJlVW5hcnkoYWxsb3dDYWxscykpO1xuXHRcdH1cblx0XHR2YXIgdmFsID0gZXhwckF0b20oYWxsb3dDYWxscyk7XG5cdFx0d2hpbGUgKGlzKFwib3BlcmF0b3JcIikgJiYgSE9QKFVOQVJZX1BPU1RGSVgsIFMudG9rZW4udmFsdWUpICYmICFcblx0XHRcdFMudG9rZW4ubmxiKSB7XG5cdFx0XHR2YWwgPSBtYWtlVW5hcnkoXCJ1bmFyeS1wb3N0Zml4XCIsIFMudG9rZW4udmFsdWUsIHZhbCk7XG5cdFx0XHRuZXh0KCk7XG5cdFx0fVxuXHRcdHJldHVybiB2YWw7XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlVW5hcnkodGFnLCBvcCwgZXhwcikge1xuXHRcdGlmICgob3AgPT09IFwiKytcIiB8fCBvcCA9PT0gXCItLVwiKSAmJiAhaXNBc3NpZ25hYmxlKGV4cHIpKSB7XG5cdFx0XHRjcm9hayhcIkludmFsaWQgdXNlIG9mIFwiICsgb3AgKyBcIiBvcGVyYXRvclwiKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFzKHRhZywgb3AsIGV4cHIpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZXhwck9wKGxlZnQsIG1pblByZWMsIG5vSW4pIHtcblx0XHR2YXIgb3AgPSBpcyhcIm9wZXJhdG9yXCIpID8gUy50b2tlbi52YWx1ZSA6IG51bGw7XG5cdFx0aWYgKG9wICYmIG9wID09PSBcImluXCIgJiYgbm9Jbikge1xuXHRcdFx0b3AgPSBudWxsO1xuXHRcdH1cblx0XHR2YXIgcHJlYyA9IG9wICE9PSBudWxsID8gUFJFQ0VERU5DRVtvcF0gOiBudWxsO1xuXHRcdGlmIChwcmVjICE9PSBudWxsICYmIHByZWMgPiBtaW5QcmVjKSB7XG5cdFx0XHRuZXh0KCk7XG5cdFx0XHR2YXIgcmlnaHQgPSBleHByT3AobWF5YmVVbmFyeSh0cnVlKSwgcHJlYywgbm9Jbik7XG5cdFx0XHRyZXR1cm4gZXhwck9wKGFzKFwiYmluYXJ5XCIsIG9wLCBsZWZ0LCByaWdodCksIG1pblByZWMsXG5cdFx0XHRcdG5vSW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gbGVmdDtcblx0fVxuXG5cdGZ1bmN0aW9uIGV4cHJPcHMobm9Jbikge1xuXHRcdHJldHVybiBleHByT3AobWF5YmVVbmFyeSh0cnVlKSwgMCwgbm9Jbik7XG5cdH1cblxuXHRmdW5jdGlvbiBtYXliZUNvbmRpdGlvbmFsKG5vSW4pIHtcblx0XHR2YXIgZXhwciA9IGV4cHJPcHMobm9Jbik7XG5cdFx0aWYgKGlzKFwib3BlcmF0b3JcIiwgXCI/XCIpKSB7XG5cdFx0XHRuZXh0KCk7XG5cdFx0XHR2YXIgeWVzID0gZXhwcmVzc2lvbihmYWxzZSk7XG5cdFx0XHRleHBlY3QoXCI6XCIpO1xuXHRcdFx0cmV0dXJuIGFzKFwiY29uZGl0aW9uYWxcIiwgZXhwciwgeWVzLCBleHByZXNzaW9uKGZhbHNlLFxuXHRcdFx0XHRub0luKSk7XG5cdFx0fVxuXHRcdHJldHVybiBleHByO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNBc3NpZ25hYmxlKGV4cHIpIHtcblx0XHRpZiAoIWV4aWdlbnRNb2RlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0c3dpdGNoIChleHByWzBdICsgXCJcIikge1xuXHRcdGNhc2UgXCJkb3RcIjpcblx0XHRjYXNlIFwic3ViXCI6XG5cdFx0Y2FzZSBcIm5ld1wiOlxuXHRcdGNhc2UgXCJjYWxsXCI6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRjYXNlIFwibmFtZVwiOlxuXHRcdFx0cmV0dXJuIGV4cHJbMV0gIT09IFwidGhpc1wiO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIG1heWJlQXNzaWduKG5vSW4pIHtcblx0XHR2YXIgbGVmdCA9IG1heWJlQ29uZGl0aW9uYWwobm9JbiksXG5cdFx0XHR2YWwgPSBTLnRva2VuLnZhbHVlO1xuXHRcdGlmIChpcyhcIm9wZXJhdG9yXCIpICYmIEhPUChBU1NJR05NRU5ULCB2YWwpKSB7XG5cdFx0XHRpZiAoaXNBc3NpZ25hYmxlKGxlZnQpKSB7XG5cdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0cmV0dXJuIGFzKFwiYXNzaWduXCIsIEFTU0lHTk1FTlRbdmFsXSwgbGVmdCxcblx0XHRcdFx0XHRtYXliZUFzc2lnbihub0luKSk7XG5cdFx0XHR9XG5cdFx0XHRjcm9hayhcIkludmFsaWQgYXNzaWdubWVudFwiKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxlZnQ7XG5cdH1cblxuXHR2YXIgZXhwcmVzc2lvbiA9IG1heWJlRW1iZWRUb2tlbnMoZnVuY3Rpb24gKGNvbW1hcywgbm9Jbikge1xuXHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb21tYXMgPSB0cnVlO1xuXHRcdH1cblx0XHR2YXIgZXhwciA9IG1heWJlQXNzaWduKG5vSW4pO1xuXHRcdGlmIChjb21tYXMgJiYgaXMoXCJwdW5jXCIsIFwiLFwiKSkge1xuXHRcdFx0bmV4dCgpO1xuXHRcdFx0cmV0dXJuIGFzKFwic2VxXCIsIGV4cHIsIGV4cHJlc3Npb24odHJ1ZSwgbm9JbikpO1xuXHRcdH1cblx0XHRyZXR1cm4gZXhwcjtcblx0fSk7XG5cblx0ZnVuY3Rpb24gaW5Mb29wKGNvbnQpIHtcblx0XHR0cnkge1xuXHRcdFx0KytTLmluTG9vcDtcblx0XHRcdHJldHVybiBjb250KCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC0tUy5pbkxvb3A7XG5cdFx0fVxuXHR9XG5cblx0Ly8gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5cdC8vICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuXHQvLyAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcblx0Ly8gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5cdC8vICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuXHQvLyAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcblx0Ly8gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5cdC8vICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuXHQvLyAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcblx0Ly8gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5cdC8vICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuXG5cdHZhciBjaHVuayA9IG1heWJlRW1iZWRUb2tlbnMoZnVuY3Rpb24gKCkge1xuXHRcdHZhciBleHByO1xuXG5cdFx0aWYgKGlzKFwiaHRtbFwiKSkge1xuXHRcdFx0dmFyIGh0bWwgPSBTLnRva2VuLnZhbHVlO1xuXHRcdFx0bmV4dCgpO1xuXHRcdFx0cmV0dXJuIGFzKFwiaHRtbFwiLCBodG1sKTtcblx0XHR9XG5cdFx0aWYgKGlzKFwidHB1bmNcIiwgXCIke1wiKSkge1xuXHRcdFx0bmV4dCgpO1xuXHRcdFx0ZXhwciA9IGV4cHJlc3Npb24oZmFsc2UpO1xuXHRcdFx0ZXhwZWN0VG9rZW4oXCJ0cHVuY1wiLCBcIn1cIik7XG5cdFx0XHRyZXR1cm4gYXMoXCJ0bXBsLWVjaG9cIiwgZXhwcik7XG5cdFx0fVxuXHRcdGlmIChpcyhcInRwdW5jXCIsIFwie3tcIikpIHtcblx0XHRcdG5leHQoKTtcblxuXHRcdFx0dmFyIGV4cHIxID0gbnVsbDtcblx0XHRcdHZhciBleHByMiA9IG51bGw7XG5cdFx0XHRpZiAoaXMoXCJuYW1lXCIsIFwiZWFjaFwiKSkge1xuXHRcdFx0XHRuZXh0KCk7XG5cblx0XHRcdFx0aWYgKGlzKFwicHVuY1wiLCBcIihcIikpIHtcblx0XHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdFx0ZXhwcjEgPSBleHByTGlzdChcIilcIiwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGNvbGxlY3Rpb24gZXhwcmVzc2lvbiBoYWQgcGFyZW50aGVzaXM/XG5cdFx0XHRcdGlmIChpcyhcInRwdW5jXCIsIFwifX1cIikpIHtcblx0XHRcdFx0XHRpZiAoZXhwcjEgJiYgZXhwcjEubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRleHByMiA9IGV4cHIxWzBdO1xuXHRcdFx0XHRcdFx0ZXhwcjEgPSBudWxsO1xuXHRcdFx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjcm9hayhcblx0XHRcdFx0XHRcdFx0XCJwYXJzZSBlcnJvciwgY29sbGVjdGlvbiB2YWx1ZSBleHBlY3RlZFwiXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRleHByMiA9IGV4cHJlc3Npb24oZmFsc2UpO1xuXHRcdFx0XHRcdGV4cGVjdFRva2VuKFwidHB1bmNcIiwgXCJ9fVwiKTtcblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0dmFyIGEgPSBbXTtcblx0XHRcdFx0d2hpbGUgKCFpcyhcInRwdW5jXCIsIFwie3svXCIpKSB7XG5cdFx0XHRcdFx0aWYgKGlzKFwiZW9mXCIpKSB7XG5cdFx0XHRcdFx0XHR1bmV4cGVjdGVkKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGEucHVzaChjaHVuaygpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdGlmICghaXMoXCJuYW1lXCIsIFwiZWFjaFwiKSkge1xuXHRcdFx0XHRcdGNyb2FrKFwiVW5tYXRjaGVkIHRlbXBsYXRlIHRhZ3MuIFwiICtcblx0XHRcdFx0XHRcdFwiZXhwZWN0ZWQgY2xvc2luZyB7ey9lYWNofX0gaGVyZVwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdGV4cGVjdFRva2VuKFwidHB1bmNcIiwgXCJ9fVwiKTtcblxuXHRcdFx0XHRyZXR1cm4gYXMoXCJ0bXBsLWVhY2hcIiwgZXhwcjEsIGV4cHIyLCBhKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzKFwibmFtZVwiLCBcInRtcGxcIikpIHtcblx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRleHByMSA9IG51bGw7XG5cdFx0XHRcdGlmIChpcyhcInB1bmNcIiwgXCIoXCIpKSB7XG5cdFx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRcdGV4cHIxID0gZXhwckxpc3QoXCIpXCIsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRleHByMiA9IGV4cHJlc3Npb24oKTtcblx0XHRcdFx0ZXhwZWN0VG9rZW4oXCJ0cHVuY1wiLCBcIn19XCIpO1xuXG5cdFx0XHRcdHJldHVybiBhcyhcInRtcGxcIiwgZXhwcjEsIGV4cHIyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzKFwia2V5d29yZFwiLCBcInZhclwiKSkge1xuXHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdHZhciB2YXIkZGVmcyA9IHZhcmRlZnModHJ1ZSk7XG5cdFx0XHRcdGV4cGVjdFRva2VuKFwidHB1bmNcIiwgXCJ9fVwiKTtcblx0XHRcdFx0cmV0dXJuIGFzKFwidG1wbC12YXJcIiwgdmFyJGRlZnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXMoXCJrZXl3b3JkXCIsIFwiaWZcIikpIHtcblx0XHRcdFx0Ly8gW1wiaWZcIiwgPG1haW4+LCA8ZWxzZSBpZnM+LCA8ZWxzZT5dID0+XG5cdFx0XHRcdC8vIFtcImlmXCIsIFs8ZXhwcj4sIDxib2R5Pl0sIFtbPGV4cHIyPiwgW2JvZHkyXSwuLi5dLCBlbHNlQm9keV1cblxuXHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdGV4cHIgPSBleHByZXNzaW9uKGZhbHNlKTtcblx0XHRcdFx0ZXhwZWN0VG9rZW4oXCJ0cHVuY1wiLCBcIn19XCIpO1xuXG5cdFx0XHRcdHZhciBib2R5ID0gW107XG5cblx0XHRcdFx0dmFyIGN1cnJlbnQgPSBib2R5O1xuXHRcdFx0XHR2YXIgZWxzZUlmcyA9IFtdO1xuXHRcdFx0XHR2YXIgZWxzZUJvZHkgPSBudWxsO1xuXG5cdFx0XHRcdHdoaWxlICghaXMoXCJ0cHVuY1wiLCBcInt7L1wiKSkge1xuXHRcdFx0XHRcdGlmIChpcyhcImVvZlwiKSkge1xuXHRcdFx0XHRcdFx0dW5leHBlY3RlZCgpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChpcyhcInRwdW5jXCIsIFwie3tcIikpIHtcblx0XHRcdFx0XHRcdGlmIChpc1Rva2VuKHBlZWsoKSwgXCJrZXl3b3JkXCIsIFwiZWxzZVwiKSkge1xuXHRcdFx0XHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdFx0XHRcdGlmIChpc1Rva2VuKHBlZWsoKSwgXCJ0cHVuY1wiLCBcIn19XCIpKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGVsc2VCb2R5KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjcm9hayhcblx0XHRcdFx0XHRcdFx0XHRcdFx0XCJ0b28gbWFueSBkZWZhdWx0IHt7ZWxzZX19IGJsb2Nrc1wiXG5cdFx0XHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRuZXh0KCk7XG5cdFx0XHRcdFx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRcdFx0XHRcdGN1cnJlbnQgPSBlbHNlQm9keSA9IFtdO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXG5cdFx0XHRcdFx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChlbHNlQm9keSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y3JvYWsoXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFwiY2FuJ3QgaGF2ZSB7e2Vsc2UgKC4uLil9fSB3aXRoIFwiICtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XCJjb25kaXRpb24gYWZ0ZXIgZGVmYXVsdCB7e2Vsc2V9fVwiXG5cdFx0XHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR2YXIgZWxzZUlmRXhwciA9IGV4cHJlc3Npb24oZmFsc2UpO1xuXG5cdFx0XHRcdFx0XHRcdFx0dmFyIGVsc2VJZkJvZHkgPSBbXTtcblx0XHRcdFx0XHRcdFx0XHR2YXIgZWxzZUlmID0gW2Vsc2VJZkV4cHIsXG5cdFx0XHRcdFx0XHRcdFx0XHRlbHNlSWZCb2R5XG5cdFx0XHRcdFx0XHRcdFx0XTtcblx0XHRcdFx0XHRcdFx0XHRjdXJyZW50ID0gZWxzZUlmQm9keTtcblx0XHRcdFx0XHRcdFx0XHRlbHNlSWZzLnB1c2goZWxzZUlmKTtcblx0XHRcdFx0XHRcdFx0XHRleHBlY3RUb2tlbihcInRwdW5jXCIsIFwifX1cIik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjdXJyZW50LnB1c2goY2h1bmsoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bmV4dCgpO1xuXG5cdFx0XHRcdGlmICghaXMoXCJrZXl3b3JkXCIsIFwiaWZcIikpIHtcblx0XHRcdFx0XHRjcm9hayhcIlVubWF0Y2hlZCB0ZW1wbGF0ZSB0YWdzLiBcIiArXG5cdFx0XHRcdFx0XHRcImV4cGVjdGVkIGNsb3Npbmcge3svaWZ9fSBoZXJlXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0ZXhwZWN0VG9rZW4oXCJ0cHVuY1wiLCBcIn19XCIpO1xuXG5cdFx0XHRcdHJldHVybiBhcyhcInRtcGwtaWZcIiwgW2V4cHIsIGJvZHldLCBlbHNlSWZzLFxuXHRcdFx0XHRcdGVsc2VCb2R5KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzKFwibmFtZVwiLCBcImh0bWxcIikpIHtcblx0XHRcdFx0bmV4dCgpO1xuXHRcdFx0XHRleHByID0gZXhwcmVzc2lvbihmYWxzZSk7XG5cdFx0XHRcdGV4cGVjdFRva2VuKFwidHB1bmNcIiwgXCJ9fVwiKTtcblx0XHRcdFx0cmV0dXJuIGFzKFwidG1wbC1odG1sXCIsIGV4cHIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXMoXCJuYW1lXCIsIFwibGF5b3V0XCIpKSB7XG5cdFx0XHRcdG5leHQoKTtcblx0XHRcdFx0ZXhwciA9IGV4cHJlc3Npb24oZmFsc2UpO1xuXHRcdFx0XHRleHBlY3RUb2tlbihcInRwdW5jXCIsIFwifX1cIik7XG5cdFx0XHRcdHJldHVybiBhcyhcInRtcGwtbGF5b3V0XCIsIGV4cHIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHVuZXhwZWN0ZWQoKTtcblxuXHR9KTtcblxuXHRpZiAoaGFzVGVtcGxhdGVNb2RlKSB7XG5cdFx0cmV0dXJuIGFzKFwidGVtcGxhdGVcIiwgKGZ1bmN0aW9uIChhKSB7XG5cdFx0XHR3aGlsZSAoIWlzKFwiZW9mXCIpKSB7XG5cdFx0XHRcdGEucHVzaChjaHVuaygpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGE7XG5cdFx0fSkoW10pKTtcblxuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBhcyhcInRvcGxldmVsXCIsIChmdW5jdGlvbiAoYSkge1xuXHRcdFx0d2hpbGUgKCFpcyhcImVvZlwiKSkge1xuXHRcdFx0XHRhLnB1c2goc3RhdGVtZW50KCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGE7XG5cdFx0fSkoW10pKTtcblx0fVxuXG59XG5cbi8qIC0tLS0tWyBVdGlsaXRpZXMgXS0tLS0tICovXG5cbmZ1bmN0aW9uIGN1cnJ5KGYpIHtcblx0dmFyIGFyZ3MgPSBzbGljZShhcmd1bWVudHMsIDEpO1xuXHRyZXR1cm4gZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBmLmFwcGx5KHRoaXMsIGFyZ3MuY29uY2F0KHNsaWNlKGFyZ3VtZW50cykpKTtcblx0fTtcbn1cblxuZnVuY3Rpb24gcHJvZzEocmV0KSB7XG5cdGlmIChyZXQgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuXHRcdHJldCA9IHJldCgpO1xuXHR9XG5cdGZvciAodmFyIGkgPSAxLCBuID0gYXJndW1lbnRzLmxlbmd0aDsgLS1uID4gMDsgKytpKSB7XG5cdFx0YXJndW1lbnRzW2ldKCk7XG5cdH1cblx0cmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYSkge1xuXHR2YXIgcmV0ID0ge307XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgYS5sZW5ndGg7ICsraSkge1xuXHRcdHJldFthW2ldXSA9IHRydWU7XG5cdH1cblx0cmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gc2xpY2UoYSwgc3RhcnQpIHtcblx0cmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIHN0YXJ0IHx8IDApO1xufVxuXG5mdW5jdGlvbiBjaGFyYWN0ZXJzKHN0cikge1xuXHRyZXR1cm4gc3RyLnNwbGl0KFwiXCIpO1xufVxuXG5mdW5jdGlvbiBtZW1iZXIobmFtZSwgYXJyYXkpIHtcblx0Zm9yICh2YXIgaSA9IGFycmF5Lmxlbmd0aDsgLS1pID49IDA7KSB7XG5cdFx0aWYgKGFycmF5W2ldID09PSBuYW1lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIEhPUChvYmosIHByb3ApIHtcblx0cmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG4vKiAtLS0tLVsgRXhwb3J0cyBdLS0tLS0gKi9cblxuZXhwb3J0cy50b2tlbml6ZXIgPSB0b2tlbml6ZXI7XG5leHBvcnRzLnBhcnNlID0gcGFyc2U7XG5leHBvcnRzLnNsaWNlID0gc2xpY2U7XG5leHBvcnRzLmN1cnJ5ID0gY3Vycnk7XG5leHBvcnRzLm1lbWJlciA9IG1lbWJlcjtcbmV4cG9ydHMuYXJyYXlUb0hhc2ggPSBhcnJheVRvSGFzaDtcbmV4cG9ydHMuUFJFQ0VERU5DRSA9IFBSRUNFREVOQ0U7XG5leHBvcnRzLktFWVdPUkRTX0FUT00gPSBLRVlXT1JEU19BVE9NO1xuZXhwb3J0cy5SRVNFUlZFRF9XT1JEUyA9IFJFU0VSVkVEX1dPUkRTO1xuZXhwb3J0cy5LRVlXT1JEUyA9IEtFWVdPUkRTO1xuZXhwb3J0cy5BVE9NSUNfU1RBUlRfVE9LRU4gPSBBVE9NSUNfU1RBUlRfVE9LRU47XG5leHBvcnRzLk9QRVJBVE9SUyA9IE9QRVJBVE9SUztcbmV4cG9ydHMuaXNBbHBoYW51bWVyaWNDaGFyID0gaXNBbHBoYW51bWVyaWNDaGFyO1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWwgPSByZXF1aXJlKFwidXRpbFwiKTtcbnZhciBldmVudHMgPSByZXF1aXJlKFwiZXZlbnRzXCIpO1xudmFyIHBhcnNlID0gcmVxdWlyZShcIi4vcGFyc2UtanMuanNcIikucGFyc2U7XG5cbnZhciBuZXh0VGljayA9IGdsb2JhbC5zZXRJbW1lZGlhdGUgfHwgcHJvY2Vzcy5uZXh0VGljaztcblxuZnVuY3Rpb24gbmFtZShpdGVtKSB7XG5cdGlmICh0eXBlb2YgaXRlbVswXSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdHJldHVybiBpdGVtWzBdO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBpdGVtWzBdLm5hbWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2F2ZVRva2VuKGNvbnRleHQsIGVsZW1lbnQpIHtcblx0aWYgKHR5cGVvZiBlbGVtZW50WzBdID09PSBcInN0cmluZ1wiKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0dmFyIGZyYW1lID0gY29udGV4dC5zdGFja1tjb250ZXh0LnN0YWNrLmxlbmd0aCAtIDFdO1xuXHRpZiAoZnJhbWUpIHtcblx0XHRmcmFtZS5sYXN0VG9rZW4gPSBlbGVtZW50WzBdO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbmRlcih0ZW1wbGF0ZU5hbWUsIGRhdGEsIG9wdGlvbnMsIGNiKSB7XG5cdHZhciBzYXZlZFN0YWNrID0gbmV3IEVycm9yKCkuc3RhY2s7XG5cblx0dmFyIG91dHB1dCA9IFwiXCI7XG5cdHZhciBjb250ZXh0ID0ge1xuXHRcdGdldFRlbXBsYXRlOiBvcHRpb25zLmdldFRlbXBsYXRlLFxuXHRcdHRlbXBsYXRlT3V0cHV0RmlsdGVyOiBvcHRpb25zLnRlbXBsYXRlT3V0cHV0RmlsdGVyLFxuXHRcdHRlbXBsYXRlUm9vdDogb3B0aW9ucy50ZW1wbGF0ZVJvb3QgfHwgXCJcIixcblx0XHR0ZW1wbGF0ZUNhY2hlOiBvcHRpb25zLnRlbXBsYXRlQ2FjaGUgfHwge30sXG5cdFx0d3JpdGU6IGZ1bmN0aW9uIChzdHJpbmcpIHtcblx0XHRcdG91dHB1dCArPSBzdHJpbmc7XG5cdFx0fSxcblx0XHRlbmQ6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGNiKG51bGwsIG91dHB1dCk7XG5cdFx0fSxcblx0XHRlcnJvcjogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcblx0XHRcdHZhciBmcmFtZU1lc3NhZ2VzID0gW107XG5cblx0XHRcdHZhciBsYXN0VGVtcGxhdGU7XG5cblx0XHRcdGNvbnRleHQuc3RhY2suZm9yRWFjaChmdW5jdGlvbiAoZnJhbWUsIGluZGV4KSB7XG5cdFx0XHRcdHZhciB0ZW1wbGF0ZU5hbWUgPSBmcmFtZS50ZW1wbGF0ZU5hbWUgfHxcblx0XHRcdFx0XHRsYXN0VGVtcGxhdGUgfHwgXCIodW5rbm93bilcIjtcblxuXHRcdFx0XHR2YXIgdG9rZW4gPSBudWxsO1xuXG5cdFx0XHRcdGlmIChpbmRleCA9PT0gY29udGV4dC5zdGFjay5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0dG9rZW4gPSBmcmFtZS5sYXN0VG9rZW47XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dG9rZW4gPSBmcmFtZS5sYXN0VG1wbFRva2VuIHx8IGZyYW1lLmxheW91dFRva2VuO1xuXHRcdFx0XHRcdGlmICghdG9rZW4pIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2YXIgaGFzVG9rZW4gPSAodG9rZW4gJiYgdG9rZW4uc3RhcnQpO1xuXHRcdFx0XHR2YXIgbGluZSA9IGhhc1Rva2VuID8gdG9rZW4uc3RhcnQubGluZSArIDEgOiBcIj9cIjtcblx0XHRcdFx0dmFyIGNvbCA9IGhhc1Rva2VuID8gdG9rZW4uc3RhcnQuY29sICsgMSA6IFwiP1wiO1xuXHRcdFx0XHRmcmFtZU1lc3NhZ2VzLnB1c2goXCIgICAgYXQgXCIgKyB0ZW1wbGF0ZU5hbWUgK1xuXHRcdFx0XHRcdFwiIChcIiArIGNvbnRleHQudGVtcGxhdGVSb290ICsgXCIvXCIgK1xuXHRcdFx0XHRcdHRlbXBsYXRlTmFtZSArIFwiOlwiICsgbGluZSArIFwiOlwiICsgY29sICsgXCIpXCIpO1xuXG5cdFx0XHRcdGxhc3RUZW1wbGF0ZSA9IGZyYW1lLnRlbXBsYXRlTmFtZSB8fCBsYXN0VGVtcGxhdGU7XG5cdFx0XHR9KTtcblxuXHRcdFx0dmFyIHN0YWNrTWVzc2FnZSA9IGZyYW1lTWVzc2FnZXMucmV2ZXJzZSgpLmpvaW4oXCJcXG5cIik7XG5cdFx0XHRzdGFja01lc3NhZ2UgKz0gXCJcXG5cIiArIHNhdmVkU3RhY2suc3BsaXQoXCJcXG5cIikuc2xpY2UoMSkuam9pbihcblx0XHRcdFx0XCJcXG5cIik7XG5cblx0XHRcdHZhciBzdGFja1N0cmluZyA9IG1lc3NhZ2UgKyBcIlxcblwiICsgc3RhY2tNZXNzYWdlO1xuXHRcdFx0dmFyIGVyciA9IG5ldyBFcnJvcihtZXNzYWdlKTtcblxuXHRcdFx0ZXJyLnN0YWNrID0gc3RhY2tTdHJpbmc7XG5cblx0XHRcdHJldHVybiBlcnI7XG5cdFx0fSxcblx0XHRzdGFjazogW3tcblx0XHRcdHRlbXBsYXRlTmFtZTogdGVtcGxhdGVOYW1lLFxuXHRcdFx0ZGF0YTogZGF0YSxcblx0XHRcdHZhcnM6IHt9XG5cdFx0fV0sXG5cdFx0XCJnZXRQYXJzZWRUZW1wbGF0ZVwiOiBmdW5jdGlvbiAodGVtcGxhdGVOYW1lLCBjYikge1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gY29udGV4dC50ZW1wbGF0ZUNhY2hlW3RlbXBsYXRlTmFtZV07XG5cblx0XHRcdGlmICh0ZW1wbGF0ZSkge1xuXHRcdFx0XHRjYihudWxsLCB0ZW1wbGF0ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRleHQuZ2V0VGVtcGxhdGUodGVtcGxhdGVOYW1lLCBmdW5jdGlvbiAoZXJyLCBzdHIpIHtcblx0XHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0XHRjYihjb250ZXh0LmVycm9yKFwiY2Fubm90IGxvYWQgdGVtcGxhdGUgXCIgK1xuXHRcdFx0XHRcdFx0XHR0ZW1wbGF0ZU5hbWUgKyBcIi4gXCIgKyBlcnIubWVzc2FnZVxuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHRlbXBsYXRlID0gcGFyc2Uoc3RyLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR2YXIgZnJhbWUgPSBjb250ZXh0LnN0YWNrW2NvbnRleHQuc3RhY2subGVuZ3RoIC1cblx0XHRcdFx0XHRcdFx0MV07XG5cdFx0XHRcdFx0XHRmcmFtZS5sYXN0VG9rZW4gPSB7XG5cdFx0XHRcdFx0XHRcdHN0YXJ0OiB7XG5cdFx0XHRcdFx0XHRcdFx0bGluZTogZXJyLmxpbmUgLSAxLFxuXHRcdFx0XHRcdFx0XHRcdGNvbDogZXJyLmNvbCAtIDEsXG5cdFx0XHRcdFx0XHRcdFx0cG9zOiBlcnIucG9zIC0gMVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRjYihjb250ZXh0LmVycm9yKFwidGVtcGxhdGUgcGFyc2UgZXJyb3I6IFwiICtcblx0XHRcdFx0XHRcdFx0ZXJyLm1lc3NhZ2UpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb250ZXh0LnRlbXBsYXRlQ2FjaGVbdGVtcGxhdGVOYW1lXSA9XG5cdFx0XHRcdFx0XHR0ZW1wbGF0ZTtcblx0XHRcdFx0XHRjYihudWxsLCB0ZW1wbGF0ZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRjb250ZXh0LmdldFBhcnNlZFRlbXBsYXRlKHRlbXBsYXRlTmFtZSwgZnVuY3Rpb24gKGVyciwgdGVtcGxhdGUpIHtcblx0XHRpZiAoZXJyKSB7XG5cdFx0XHRjYihlcnIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyKSB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdGNiKGVycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjYihudWxsLCBvdXRwdXQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyVGVtcGxhdGUodGVtcGxhdGUsIGNvbnRleHQsIGNiKSB7XG5cdGlmIChuYW1lKHRlbXBsYXRlKSAhPT0gXCJ0ZW1wbGF0ZVwiKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCB0ZW1wbGF0ZVwiKTtcblx0fVxuXG5cdHZhciBlbGVtZW50cyA9IHRlbXBsYXRlWzFdO1xuXHRpZiAodHlwZW9mIGVsZW1lbnRzICE9PSBcIm9iamVjdFwiKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCB0ZW1wbGF0ZVwiKTtcblx0fVxuXG5cdC8qIG5lZWQgdG8gY2FwdHVyZSBhbGwgd3JpdGVzIGluIGNhc2UgXG4gICAgICAgd2UgbmVlZCB0byBhcHBseSBhIGxheW91dCBvciBmaWx0ZXIgKi9cblxuXHR2YXIgb2xkV3JpdGUgPSBjb250ZXh0LndyaXRlO1xuXHR2YXIgYm9keSA9IFwiXCI7XG5cdGNvbnRleHQud3JpdGUgPSBmdW5jdGlvbiAoc3RyKSB7XG5cdFx0Ym9keSArPSBzdHI7XG5cdH07XG5cblx0dmFyIGZyYW1lID0gY29udGV4dC5zdGFja1tjb250ZXh0LnN0YWNrLmxlbmd0aCAtIDFdO1xuXG5cdGZ1bmN0aW9uIGZpbHRlclJlc29sdmUobmFtZSwgZmlsdGVyQ2FsbGJhY2spIHtcblx0XHRldmFsdWF0ZU5hbWVFeHByZXNzaW9uKFtcIm5hbWVcIiwgbmFtZV0sIGNvbnRleHQsIGZpbHRlckNhbGxiYWNrKTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnRzKGVsZW1lbnRzLCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyKSB7XG5cdFx0aWYgKGVycikge1xuXHRcdFx0Y2IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGZyYW1lLnRlbXBsYXRlTmFtZSAmJiB0eXBlb2YgY29udGV4dC50ZW1wbGF0ZU91dHB1dEZpbHRlciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRib2R5ID0gY29udGV4dC50ZW1wbGF0ZU91dHB1dEZpbHRlcihmcmFtZS50ZW1wbGF0ZU5hbWUsIGJvZHksIGZpbHRlclJlc29sdmUsIGZ1bmN0aW9uIChlcnIsIG5ld0JvZHkpIHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdGNiKGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBib2R5ICE9PSBcInVuZGVmaW5lZFwiKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCB0ZW1wbGF0ZU91dHB1dEZpbHRlciwgY2FsbGJhY2sgYW5kIGZ1bmN0aW9uIHJldHVybiB2YWx1ZSB1c2VkLlwiKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJvZHkgPSBuZXdCb2R5O1xuXG5cdFx0XHRcdGFmdGVyRmlsdGVyKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHR5cGVvZiBib2R5ICE9PSBcInVuZGVmaW5lZFwiKSB7XG5cdFx0XHRcdGFmdGVyRmlsdGVyKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFmdGVyRmlsdGVyKCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gYWZ0ZXJGaWx0ZXIoKSB7XG5cdFx0XHRjb250ZXh0LndyaXRlID0gb2xkV3JpdGU7XG5cdFx0XHRpZiAoIWZyYW1lLmxheW91dCkge1xuXHRcdFx0XHRjb250ZXh0LndyaXRlKGJvZHkpO1xuXHRcdFx0XHRjYihlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBuZWVkIHRvIHJlbmRlciB3aXRoIGxheW91dFxuXHRcdFx0dmFyIHNjb3BlID0ge1xuXHRcdFx0XHRcImRhdGFcIjogZnJhbWUuZGF0YSxcblx0XHRcdFx0XCJ0ZW1wbGF0ZU5hbWVcIjogZnJhbWUubGF5b3V0LFxuXHRcdFx0XHRcInZhcnNcIjoge1xuXHRcdFx0XHRcdFwiJGRhdGFcIjogZnJhbWUuZGF0YSxcblx0XHRcdFx0XHRcImJvZHlcIjogYm9keVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb250ZXh0LnN0YWNrLnB1c2goc2NvcGUpO1xuXG5cdFx0XHRjb250ZXh0LmdldFBhcnNlZFRlbXBsYXRlKGZyYW1lLmxheW91dCwgZnVuY3Rpb24gKGVycixcblx0XHRcdFx0dGVtcGxhdGUpIHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdGNiKGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVuZGVyVGVtcGxhdGUodGVtcGxhdGUsIGNvbnRleHQsIGZ1bmN0aW9uIChlcnIpIHtcblx0XHRcdFx0XHRjb250ZXh0LnN0YWNrLnBvcCgpO1xuXG5cdFx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdFx0Y2IoZXJyKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y2IobnVsbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckVsZW1lbnRzKGVsZW1lbnRzLCBjb250ZXh0LCBjYikge1xuXHRpZiAoIWVsZW1lbnRzKSB7XG5cdFx0Y2IobnVsbCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0dmFyIGRpZEVycm9yID0gZmFsc2U7XG5cdHZhciBpID0gMDtcblxuXHRmdW5jdGlvbiBuZXh0KCkge1xuXHRcdHZhciBlbGVtZW50ID0gZWxlbWVudHNbaV07XG5cdFx0aSsrO1xuXG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRjYihudWxsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2YXIgY291bnQgPSAwO1xuXG5cdFx0cmVuZGVyRWxlbWVudChlbGVtZW50LCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyKSB7XG5cdFx0XHRjb3VudCsrO1xuXHRcdFx0aWYgKGNvdW50ICE9PSAxKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcInJlbmRlciBmb3IgXCIgKyBuYW1lKGVsZW1lbnQpICtcblx0XHRcdFx0XHRcIiBoYWQgbXVsdGlwbGUgY2FsbGJhY2tzXCIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGlkRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdGRpZEVycm9yID0gdHJ1ZTtcblx0XHRcdFx0Y2IoZXJyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRuZXh0KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRuZXh0KCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckVsZW1lbnQoZWxlbWVudCwgY29udGV4dCwgY2IpIHtcblx0c2F2ZVRva2VuKGNvbnRleHQsIGVsZW1lbnQpO1xuXG5cdHN3aXRjaCAobmFtZShlbGVtZW50KSkge1xuXHRjYXNlIFwiaHRtbFwiOlxuXHRcdGNvbnRleHQud3JpdGUoZWxlbWVudFsxXSk7XG5cdFx0Y2IobnVsbCk7XG5cdFx0YnJlYWs7XG5cdGNhc2UgXCJ0bXBsLWlmXCI6XG5cdFx0cmVuZGVyVG1wbElmKGVsZW1lbnQsIGNvbnRleHQsIGNiKTtcblx0XHRicmVhaztcblx0Y2FzZSBcInRtcGwtZWNob1wiOlxuXHRcdHJlbmRlclRtcGxFY2hvKGVsZW1lbnQsIGNvbnRleHQsIGNiKTtcblx0XHRicmVhaztcblx0Y2FzZSBcInRtcGxcIjpcblx0XHRyZW5kZXJUbXBsKGVsZW1lbnQsIGNvbnRleHQsIGNiKTtcblx0XHRicmVhaztcblx0Y2FzZSBcInRtcGwtZWFjaFwiOlxuXHRcdHJlbmRlclRtcGxFYWNoKGVsZW1lbnQsIGNvbnRleHQsIGNiKTtcblx0XHRicmVhaztcblx0Y2FzZSBcInRtcGwtaHRtbFwiOlxuXHRcdHJlbmRlclRtcGxIdG1sKGVsZW1lbnQsIGNvbnRleHQsIGNiKTtcblx0XHRicmVhaztcblx0Y2FzZSBcInRtcGwtbGF5b3V0XCI6XG5cdFx0Y2FwdHVyZUxheW91dChlbGVtZW50LCBjb250ZXh0LCBjYik7XG5cdFx0YnJlYWs7XG5cdGNhc2UgXCJ0bXBsLXZhclwiOlxuXHRcdHN0b3JlVG1wbFZhcihlbGVtZW50LCBjb250ZXh0LCBjYik7XG5cdFx0YnJlYWs7XG5cblx0ZGVmYXVsdDpcblx0XHRjYihuZXcgRXJyb3IoXCJ1bmhhbmRsZWQgZWxlbWVudCBcIiArIG5hbWUoZWxlbWVudCkpKTtcblx0XHRicmVhaztcblx0fVxufVxuXG5mdW5jdGlvbiByZW5kZXJUbXBsSWYoZWxlbWVudCwgY29udGV4dCwgY2IpIHtcblx0Ly8gW1widG1wbC1pZlwiLCBbZXhwciwgYm9keV0sIGVsc2VfaWZzLCBlbHNlX2JvZHldXG5cdHZhciBleHByID0gZWxlbWVudFsxXVswXTtcblx0dmFyIGVsc2VJZnMgPSBlbGVtZW50WzJdO1xuXG5cdGV2YWx1YXRlRXhwcmVzc2lvbihleHByLCBjb250ZXh0LCBldmFsdWF0ZWRFeHByKTtcblxuXHRmdW5jdGlvbiBldmFsdWF0ZWRFeHByKGVyciwgdmFsKSB7XG5cdFx0aWYgKGVycikge1xuXHRcdFx0Y2IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVE9ETzogbmVlZCBlbHNlX2lmcyFcblx0XHRpZiAodmFsKSB7XG5cdFx0XHRyZW5kZXJFbGVtZW50cyhlbGVtZW50WzFdWzFdLCBjb250ZXh0LCBjYik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5leHRFbHNlKDApO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIG5leHRFbHNlKGkpIHtcblx0XHRcdGlmIChpID09PSBlbHNlSWZzLmxlbmd0aCkge1xuXHRcdFx0XHRkb25lRWxzZUlmcygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHZhciBjb25kaXRpb24gPSBlbHNlSWZzW2ldWzBdO1xuXHRcdFx0dmFyIGJvZHkgPSBlbHNlSWZzW2ldWzFdO1xuXG5cdFx0XHRldmFsdWF0ZUV4cHJlc3Npb24oY29uZGl0aW9uLCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyLFxuXHRcdFx0XHR2YWx1ZSkge1xuXHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0Y2IoZXJyKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0XHRyZW5kZXJFbGVtZW50cyhib2R5LCBjb250ZXh0LCBjYik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bmV4dEVsc2UoaSArIDEpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZG9uZUVsc2VJZnMoKSB7XG5cdFx0XHRyZW5kZXJFbGVtZW50cyhlbGVtZW50WzNdLCBjb250ZXh0LCBjYik7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRtcGxFY2hvKGVsZW1lbnQsIGNvbnRleHQsIGNiKSB7XG5cdC8vIFtcInRtcGwtZWNob1wiLCBbZXhwcl1dXG5cdGV2YWx1YXRlRXhwcmVzc2lvbihlbGVtZW50WzFdLCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyLCB2YWx1ZSkge1xuXHRcdGlmIChlcnIpIHtcblx0XHRcdGNiKGVycik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdFx0Y29udGV4dC53cml0ZShodG1sKHZhbHVlKSk7XG5cdFx0fVxuXG5cdFx0Y2IobnVsbCk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUbXBsSHRtbChlbGVtZW50LCBjb250ZXh0LCBjYikge1xuXHQvLyBbXCJ0bXBsLWh0bWxcIiwgW2V4cHJdXVxuXHRldmFsdWF0ZUV4cHJlc3Npb24oZWxlbWVudFsxXSwgY29udGV4dCwgZnVuY3Rpb24gKGVyciwgdmFsdWUpIHtcblx0XHRpZiAoZXJyKSB7XG5cdFx0XHRjYihlcnIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHtcblx0XHRcdGNvbnRleHQud3JpdGUodmFsdWUpO1xuXHRcdH1cblxuXHRcdGNiKG51bGwpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gY2FwdHVyZUxheW91dChlbGVtZW50LCBjb250ZXh0LCBjYikge1xuXHQvLyBbXCJ0bXBsLWxheW91dFwiLCBbZXhwcl1dXG5cdGV2YWx1YXRlRXhwcmVzc2lvbihlbGVtZW50WzFdLCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyLCB2YWx1ZSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIpIHtcblx0XHRcdGNiKGNvbnRleHQuZXJyb3IoXG5cdFx0XHRcdFwie3tsYXlvdXR9fSB0ZW1wbGF0ZSBtdXN0IGJlIGEgc3RyaW5nXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKHZhciBpID0gY29udGV4dC5zdGFjay5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKGNvbnRleHQuc3RhY2tbaV0udGVtcGxhdGVOYW1lKSB7XG5cdFx0XHRcdGNvbnRleHQuc3RhY2tbaV0ubGF5b3V0ID0gdmFsdWU7XG5cdFx0XHRcdGNvbnRleHQuc3RhY2tbaV0ubGF5b3V0VG9rZW4gPSBlbGVtZW50WzBdO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjYihudWxsKTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHN0b3JlVG1wbFZhcihlbGVtZW50LCBjb250ZXh0LCBjYikge1xuXHQvLyBbXCJ0bXBsLXZhclwiLCBbW25hbWUsIDxleHByZXNzaW9uPl0sLi5dXG5cblx0dmFyIGZyYW1lID0gY29udGV4dC5zdGFja1tjb250ZXh0LnN0YWNrLmxlbmd0aCAtIDFdO1xuXHR2YXIgaXRlbXMgPSBlbGVtZW50WzFdO1xuXG5cdGZ1bmN0aW9uIG5leHQoaSkge1xuXHRcdGlmIChpID49IGl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0Y2IobnVsbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZXZhbHVhdGVFeHByZXNzaW9uKGl0ZW1zW2ldWzFdLCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyLCB2YWx1ZSkge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRjYihlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZyYW1lLnZhcnNbaXRlbXNbaV1bMF1dID0gdmFsdWU7XG5cdFx0XHRuZXh0KGkgKyAxKTtcblx0XHR9KTtcblx0fVxuXG5cdG5leHQoMCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRtcGwoZWxlbWVudCwgY29udGV4dCwgY2IpIHtcblx0Ly8gW1widG1wbFwiIFtleHByMSwuLi5dIGV4cHIyXVxuXHR2YXIgb2JqZWN0VmFsdWU7XG5cblx0dmFyIGZyYW1lID0gY29udGV4dC5zdGFja1tjb250ZXh0LnN0YWNrLmxlbmd0aCAtIDFdO1xuXHRpZiAodHlwZW9mIGVsZW1lbnRbMF0gIT09IFwic3RyaW5nXCIpIHtcblx0XHRmcmFtZS5sYXN0VG1wbFRva2VuID0gZWxlbWVudFswXTtcblx0fSBlbHNlIHtcblx0XHRmcmFtZS5sYXN0VG1wbFRva2VuID0ge307XG5cdH1cblxuXHRpZiAoIWVsZW1lbnRbMV0pIHtcblx0XHRnb3RPYmplY3QobnVsbCwge30pO1xuXHR9IGVsc2Uge1xuXHRcdGV2YWx1YXRlRXhwcmVzc2lvbihlbGVtZW50WzFdWzBdLCBjb250ZXh0LCBnb3RPYmplY3QpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ290T2JqZWN0KGVyciwgb2JqKSB7XG5cdFx0aWYgKGVycikge1xuXHRcdFx0Y2IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRvYmplY3RWYWx1ZSA9IG9iajtcblxuXHRcdGV2YWx1YXRlRXhwcmVzc2lvbihlbGVtZW50WzJdLCBjb250ZXh0LCBnb3RUZW1wbGF0ZU5hbWUpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ290VGVtcGxhdGVOYW1lKGVyciwgdGVtcGxhdGVOYW1lKSB7XG5cdFx0aWYgKGVycikge1xuXHRcdFx0Y2IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW9iamVjdFZhbHVlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJubyBvYmplY3QgdmFsdWVcIik7XG5cdFx0fVxuXG5cblx0XHR2YXIgc2NvcGUgPSB7XG5cdFx0XHRcImRhdGFcIjogb2JqZWN0VmFsdWUsXG5cdFx0XHRcInRlbXBsYXRlTmFtZVwiOiB0ZW1wbGF0ZU5hbWUsXG5cdFx0XHRcInZhcnNcIjoge1xuXHRcdFx0XHRcIiRkYXRhXCI6IG9iamVjdFZhbHVlXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnRleHQuc3RhY2sucHVzaChzY29wZSk7XG5cdFx0Y29udGV4dC5nZXRQYXJzZWRUZW1wbGF0ZSh0ZW1wbGF0ZU5hbWUsIGZ1bmN0aW9uIChlcnIsXG5cdFx0XHR0ZW1wbGF0ZSkge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRjYihlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyKSB7XG5cdFx0XHRcdGNvbnRleHQuc3RhY2sucG9wKCk7XG5cblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdGNiKGVycik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2IobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRtcGxFYWNoKGVsZW1lbnQsIGNvbnRleHQsIGNiKSB7XG5cdC8vIFtcInRtcGwtZWFjaFwiLCBhcmd1bWVudHMsIGNvbGxlY3Rpb24sIHRlbXBsYXRlXVxuXG5cdHZhciBpbmRleE5hbWU7XG5cdHZhciB2YWx1ZU5hbWU7XG5cdHZhciBrZXlOYW1lO1xuXHR2YXIgZWxlbWVudEFyZ3MgPSBlbGVtZW50WzFdO1xuXG5cdHZhciBhcmdzO1xuXHRpZiAoZWxlbWVudEFyZ3MpIHtcblx0XHRhcmdzID0gW107XG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBlbGVtZW50QXJncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIGFyZyA9IGVsZW1lbnRBcmdzW2ldO1xuXHRcdFx0aWYgKG5hbWUoYXJnKSAhPT0gXCJuYW1lXCIpIHtcblx0XHRcdFx0Y2IoY29udGV4dC5lcnJvcihcInBhcnNlIGVycm9yOiBcIiArXG5cdFx0XHRcdFx0XCJ7e2VhY2h9fSBhcmd1bWVudHMgbXVzdCBiZSBuYW1lc1wiKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFyZ3NbaV0gPSBhcmdbMV07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aW5kZXhOYW1lID0gYXJncyAmJiBhcmdzWzBdIHx8IFwiJGluZGV4XCI7XG5cdHZhbHVlTmFtZSA9IGFyZ3MgJiYgYXJnc1sxXSB8fCBcIiR2YWx1ZVwiO1xuXHRrZXlOYW1lID0gYXJncyAmJiBhcmdzWzJdIHx8IFwiJGtleVwiO1xuXG5cdGV2YWx1YXRlRXhwcmVzc2lvbihlbGVtZW50WzJdLCBjb250ZXh0LCBnb3RDb2xsZWN0aW9uKTtcblx0ZnVuY3Rpb24gZ290Q29sbGVjdGlvbihlcnIsIGNvbGxlY3Rpb24pIHtcblx0XHRpZiAoZXJyKSB7XG5cdFx0XHRjYihlcnIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2YXIgdHlwZVN0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjb2xsZWN0aW9uKTtcblxuXHRcdGlmICh0eXBlU3RyaW5nID09PSBcIltvYmplY3QgT2JqZWN0XVwiKSB7XG5cdFx0XHRpZiAodHlwZW9mIGNvbGxlY3Rpb24ub24gPT09IFwiZnVuY3Rpb25cIiAmJlxuXHRcdFx0XHR0eXBlb2YgY29sbGVjdGlvbi5wYXVzZSA9PT0gXCJmdW5jdGlvblwiICYmXG5cdFx0XHRcdHR5cGVvZiBjb2xsZWN0aW9uLnJlc3VtZSA9PT0gXCJmdW5jdGlvblwiKSB7XG5cblx0XHRcdFx0Z290SXRlcmF0b3IoY29sbGVjdGlvbik7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBjb2xsZWN0aW9uLml0ZXJhdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0Z290SXRlcmF0b3IoY29sbGVjdGlvbi5pdGVyYXRvcigpKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHR5cGVTdHJpbmcgPT09IFwiW29iamVjdCBBcnJheV1cIikge1xuXHRcdFx0Z290SXRlcmF0b3IobmV3IEFycmF5SXRlcmF0b3IoY29sbGVjdGlvbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjYihjb250ZXh0LmVycm9yKFwiQ2FuJ3QgaXRlcmF0ZSBvdmVyIFwiICsgdHlwZW9mIGNvbGxlY3Rpb24pKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBnb3RJdGVyYXRvcihpdGVyYXRvcikge1xuXHRcdHZhciBpbmRleCA9IDA7XG5cblx0XHRpdGVyYXRvci5vbihcImRhdGFcIiwgZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcblx0XHRcdGl0ZXJhdG9yLnBhdXNlKCk7XG5cblx0XHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHZhbHVlID0ga2V5O1xuXHRcdFx0XHRrZXkgPSBpbmRleDtcblx0XHRcdH1cblxuXHRcdFx0dmFyIHNjb3BlID0ge1xuXHRcdFx0XHRcImRhdGFcIjogdmFsdWUsXG5cdFx0XHRcdFwidmFyc1wiOiB7fVxuXHRcdFx0fTtcblxuXHRcdFx0c2NvcGUudmFyc1tpbmRleE5hbWVdID0gaW5kZXg7XG5cdFx0XHRzY29wZS52YXJzW3ZhbHVlTmFtZV0gPSB2YWx1ZTtcblx0XHRcdHNjb3BlLnZhcnNba2V5TmFtZV0gPSBrZXk7XG5cblx0XHRcdGNvbnRleHQuc3RhY2sucHVzaChzY29wZSk7XG5cblx0XHRcdHJlbmRlckVsZW1lbnRzKGVsZW1lbnRbM10sIGNvbnRleHQsIGZ1bmN0aW9uIChlcnIpIHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdGNiKGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29udGV4dC5zdGFjay5wb3AoKTtcblx0XHRcdFx0aW5kZXgrKztcblxuXHRcdFx0XHRpdGVyYXRvci5yZXN1bWUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dmFyIGVuZENhbGxzID0gMDtcblx0XHRpdGVyYXRvci5vbihcImVuZFwiLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRlbmRDYWxscysrO1xuXHRcdFx0aWYgKGVuZENhbGxzICE9PSAxKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImVuZCBjYWxsZWQgdG9vIG1hbnkgdGltZXMhXCIpO1xuXHRcdFx0fVxuXHRcdFx0Y2IobnVsbCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXZhbHVhdGVFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKSB7XG5cdHNhdmVUb2tlbihjb250ZXh0LCBleHByZXNzaW9uKTtcblxuXHRpZiAodHlwZW9mIGV4cHJlc3Npb24gPT09IFwic3RyaW5nXCIpIHtcblx0XHRjYihudWxsLCBleHByZXNzaW9uKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRzd2l0Y2ggKG5hbWUoZXhwcmVzc2lvbikpIHtcblx0Y2FzZSBcImRvdFwiOlxuXHRcdGV2YWx1YXRlRG90U3ViRXhwcmVzc2lvbihleHByZXNzaW9uLCBjb250ZXh0LCBjYik7XG5cdFx0YnJlYWs7XG5cdGNhc2UgXCJzdWJcIjpcblx0XHRldmFsdWF0ZURvdFN1YkV4cHJlc3Npb24oZXhwcmVzc2lvbiwgY29udGV4dCwgY2IpO1xuXHRcdGJyZWFrO1xuXHRjYXNlIFwibmFtZVwiOlxuXHRcdGV2YWx1YXRlTmFtZUV4cHJlc3Npb24oZXhwcmVzc2lvbiwgY29udGV4dCwgY2IpO1xuXHRcdGJyZWFrO1xuXHRjYXNlIFwiY2FsbFwiOlxuXHRcdGV2YWx1YXRlQ2FsbEV4cHJlc3Npb24oZXhwcmVzc2lvbiwgY29udGV4dCwgY2IpO1xuXHRcdGJyZWFrO1xuXHRjYXNlIFwiYmluYXJ5XCI6XG5cdFx0ZXZhbHVhdGVCaW5hcnlFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKTtcblx0XHRicmVhaztcblx0Y2FzZSBcInVuYXJ5LXByZWZpeFwiOlxuXHRcdGV2YWx1YXRlVW5hcnlQcmVmaXhFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKTtcblx0XHRicmVhaztcblx0Y2FzZSBcImFycmF5XCI6XG5cdFx0ZXZhbHVhdGVBcnJheUV4cHJlc3Npb24oZXhwcmVzc2lvbiwgY29udGV4dCwgY2IpO1xuXHRcdGJyZWFrO1xuXHRjYXNlIFwib2JqZWN0XCI6XG5cdFx0ZXZhbHVhdGVPYmplY3RFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKTtcblx0XHRicmVhaztcblx0Y2FzZSBcImNvbmRpdGlvbmFsXCI6XG5cdFx0ZXZhbHVhdGVDb25kaXRpb25hbEV4cHJlc3Npb24oZXhwcmVzc2lvbiwgY29udGV4dCwgY2IpO1xuXHRcdGJyZWFrO1xuXHRjYXNlIFwic3RyaW5nXCI6XG5cdFx0Y2IobnVsbCwgZXhwcmVzc2lvblsxXSk7XG5cdFx0YnJlYWs7XG5cdGNhc2UgXCJudW1cIjpcblx0XHRjYihudWxsLCBleHByZXNzaW9uWzFdKTtcblx0XHRicmVhaztcblx0Y2FzZSBcImZ1bmN0aW9uXCI6XG5cdFx0Y2IoY29udGV4dC5lcnJvcihcImZ1bmN0aW9ucyBhcmUgbm90IGFsbG93ZWQgd2l0aGluIHRlbXBsYXRlc1wiKSk7XG5cdFx0cmV0dXJuO1xuXHRjYXNlIFwiYXNzaWduXCI6XG5cdFx0Y2IoY29udGV4dC5lcnJvcihcImFzc2lnbm1lbnQgaXMgbm90IGFsbG93ZWQgd2l0aGluIHRlbXBsYXRlc1wiKSk7XG5cdFx0cmV0dXJuO1xuXHRkZWZhdWx0OlxuXHRcdGNiKGNvbnRleHQuZXJyb3IoXCJ1bmhhbmRsZWQgZXhwcmVzc2lvbiB0eXBlIFwiICsgbmFtZShcblx0XHRcdGV4cHJlc3Npb24pKSk7XG5cdFx0YnJlYWs7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXZhbHVhdGVEb3RTdWJFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKSB7XG5cdHZhciBvYmplY3RWYWx1ZTtcblxuXHRldmFsdWF0ZUV4cHJlc3Npb24oZXhwcmVzc2lvblsxXSwgY29udGV4dCwgZ290T2JqZWN0KTtcblxuXHRmdW5jdGlvbiBnb3RPYmplY3QoZXJyLCBvYmopIHtcblx0XHRpZiAoZXJyKSB7XG5cdFx0XHRjYihlcnIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygb2JqID09PSBcInVuZGVmaW5lZFwiKSB7XG5cdFx0XHRjYihjb250ZXh0LmVycm9yKFwibm90IGFuIG9iamVjdCBcIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG9iamVjdFZhbHVlID0gb2JqO1xuXG5cdFx0ZXZhbHVhdGVFeHByZXNzaW9uKGV4cHJlc3Npb25bMl0sIGNvbnRleHQsIGdvdFByb3BlcnR5TmFtZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBnb3RQcm9wZXJ0eU5hbWUoZXJyLCBwcm9wZXJ0eU5hbWUpIHtcblx0XHRpZiAoZXJyKSB7XG5cdFx0XHRjYihlcnIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygb2JqZWN0VmFsdWUuZ2V0ID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdG9iamVjdFZhbHVlLmdldChwcm9wZXJ0eU5hbWUsIGNiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIHZhbHVlID0gb2JqZWN0VmFsdWVbcHJvcGVydHlOYW1lXTtcblx0XHRcdGlmICh0eXBlb2YgKHZhbHVlKSA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHZhbHVlID0gdmFsdWUuYmluZChvYmplY3RWYWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNiKG51bGwsIHZhbHVlKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZXZhbHVhdGVOYW1lRXhwcmVzc2lvbihleHByZXNzaW9uLCBjb250ZXh0LCBjYikge1xuXHR2YXIgbmFtZSA9IGV4cHJlc3Npb25bMV07XG5cdHZhciBzdGFja0luZGV4ID0gY29udGV4dC5zdGFjay5sZW5ndGg7XG5cblx0aWYgKG5hbWUgPT09IFwidHJ1ZVwiKSB7XG5cdFx0Y2IobnVsbCwgdHJ1ZSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKG5hbWUgPT09IFwiZmFsc2VcIikge1xuXHRcdGNiKG51bGwsIGZhbHNlKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAobmFtZSA9PT0gXCJudWxsXCIpIHtcblx0XHRjYihudWxsLCBudWxsKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRmdW5jdGlvbiBuZXh0U2NvcGUoKSB7XG5cdFx0c3RhY2tJbmRleC0tO1xuXHRcdGlmIChzdGFja0luZGV4IDwgMCkge1xuXHRcdFx0Y2IoY29udGV4dC5lcnJvcihcImNhbm5vdCByZXNvbHZlIG5hbWUgJ1wiICsgbmFtZSArIFwiJ1wiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmFyIHNjb3BlID0gY29udGV4dC5zdGFja1tzdGFja0luZGV4XTtcblx0XHRpZiAoSE9QKHNjb3BlLnZhcnMsIG5hbWUpKSB7XG5cdFx0XHRjYihudWxsLCBzY29wZS52YXJzW25hbWVdKTtcblx0XHR9IGVsc2UgaWYgKEhPUChzY29wZS5kYXRhLCBuYW1lKSkge1xuXHRcdFx0Y2IobnVsbCwgc2NvcGUuZGF0YVtuYW1lXSk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2Ygc2NvcGUuZGF0YS5nZXQgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0c2NvcGUuZGF0YS5nZXQobmFtZSwgZnVuY3Rpb24gKGVyciwgdmFsdWUpIHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdGNiKGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdFx0XHRcdG5leHRTY29wZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNiKG51bGwsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5leHRTY29wZSgpO1xuXHRcdH1cblx0fVxuXG5cdG5leHRTY29wZSgpO1xufVxuXG5mdW5jdGlvbiBldmFsdWF0ZUNhbGxFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKSB7XG5cdC8vIFtcImNhbGxcIiwgPGZ1bmN0aW9uPiwgW2FyZ3VtZW50c11cblxuXHRldmFsdWF0ZUV4cHJlc3Npb24oZXhwcmVzc2lvblsxXSwgY29udGV4dCwgZ290RnVuY3Rpb24pO1xuXG5cdGZ1bmN0aW9uIGdvdEZ1bmN0aW9uKGVyciwgZm4pIHtcblx0XHRpZiAoZXJyKSB7XG5cdFx0XHRjYihlcnIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBhcmdzID0gZXhwcmVzc2lvblsyXTtcblx0XHR2YXIgaW5kZXggPSAwO1xuXHRcdHZhciBldmFsdWF0ZWRBcmdzID0gW107XG5cblx0XHRmdW5jdGlvbiBuZXh0KCkge1xuXHRcdFx0aWYgKGluZGV4ID49IGFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdGdvdEFyZ3MoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIgYXJnID0gYXJnc1tpbmRleF07XG5cblx0XHRcdGV2YWx1YXRlRXhwcmVzc2lvbihhcmcsIGNvbnRleHQsIGdvdEFyZyk7XG5cblx0XHRcdGZ1bmN0aW9uIGdvdEFyZyhlcnIsIHZhbHVlKSB7XG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRjYihlcnIpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGV2YWx1YXRlZEFyZ3NbaW5kZXhdID0gdmFsdWU7XG5cdFx0XHRcdGluZGV4Kys7XG5cdFx0XHRcdG5leHRUaWNrKG5leHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG5leHQoKTtcblxuXHRcdGZ1bmN0aW9uIGdvdEFyZ3MoKSB7XG5cdFx0XHRpZiAodHlwZW9mIChmbikgIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRjYihjb250ZXh0LmVycm9yKFwibm90IGEgZnVuY3Rpb25cIikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gaWYgbGFzdCBhcmd1bWVudCBvZiBmdW5jdGlvbiBpcyBjYiBvciBmbiwgY2FsbFxuXHRcdFx0XHQvLyBhc3luY2hyb25vdXNseVxuXHRcdFx0XHR2YXIgc2lnID0gc2lnbmF0dXJlKGZuKTtcblx0XHRcdFx0dmFyIGxhc3RBcmcgPSBzaWcuYXJnc1tzaWcuYXJncy5sZW5ndGggLSAxXTtcblx0XHRcdFx0aWYgKCBsYXN0QXJnID09PSBcImNiXCIgfHwgbGFzdEFyZyA9PT0gXCJmblwiKSB7XG5cdFx0XHRcdFx0ZXZhbHVhdGVkQXJncy5wdXNoKGNiKTtcblx0XHRcdFx0XHRmbi5hcHBseShudWxsLCBldmFsdWF0ZWRBcmdzKVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNiKG51bGwsIGZuLmFwcGx5KG51bGwsIGV2YWx1YXRlZEFyZ3MpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZXZhbHVhdGVBcnJheUV4cHJlc3Npb24oZXhwcmVzc2lvbiwgY29udGV4dCwgY2IpIHtcblx0Ly9bXCJhcnJheVwiLFs8ZWxlbWVudHNdXVxuXHR2YXIgZWxlbWVudHMgPSBleHByZXNzaW9uWzFdO1xuXHR2YXIgcmVzdWx0ID0gW107XG5cblx0ZnVuY3Rpb24gbmV4dChpKSB7XG5cdFx0aWYgKGkgPj0gZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRjYihudWxsLCByZXN1bHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGV2YWx1YXRlRXhwcmVzc2lvbihlbGVtZW50c1tpXSwgY29udGV4dCwgZnVuY3Rpb24gKGVyciwgdmFsdWUpIHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0Y2IoZXJyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHRbaV0gPSB2YWx1ZTtcblx0XHRcdG5leHQoaSArIDEpO1xuXHRcdH0pO1xuXHR9XG5cblx0bmV4dCgwKTtcbn1cblxuZnVuY3Rpb24gZXZhbHVhdGVPYmplY3RFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKSB7XG5cdC8vW1wib2JqZWN0XCIsW1s8a2V5Piw8dmFsdWU+XSxbPGtleT4sPHZhbHVlPl1dXVxuXG5cdHZhciBlbGVtZW50cyA9IGV4cHJlc3Npb25bMV07XG5cdHZhciByZXN1bHQgPSB7fTtcblxuXHRmdW5jdGlvbiBuZXh0KGkpIHtcblx0XHRpZiAoaSA+PSBlbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdGNiKG51bGwsIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZXZhbHVhdGVFeHByZXNzaW9uKGVsZW1lbnRzW2ldWzFdLCBjb250ZXh0LCBmdW5jdGlvbiAoZXJyLFxuXHRcdFx0dmFsdWUpIHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0Y2IoZXJyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIga2V5ID0gZWxlbWVudHNbaV1bMF07XG5cblx0XHRcdHJlc3VsdFtrZXldID0gdmFsdWU7XG5cdFx0XHRuZXh0KGkgKyAxKTtcblx0XHR9KTtcblx0fVxuXG5cdG5leHQoMCk7XG59XG5cbmZ1bmN0aW9uIGV2YWx1YXRlQmluYXJ5RXhwcmVzc2lvbihleHByZXNzaW9uLCBjb250ZXh0LCBjYikge1xuXHR2YXIgb3BlcmF0b3IgPSBleHByZXNzaW9uWzFdO1xuXHR2YXIgbGVmdFZhbHVlO1xuXG5cdGV2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uWzJdLCBjb250ZXh0LCBnb3RMZWZ0VmFsdWUpO1xuXG5cdGZ1bmN0aW9uIGdvdExlZnRWYWx1ZShlcnIsIHZhbHVlKSB7XG5cdFx0aWYgKGVycikge1xuXHRcdFx0Y2IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZWZ0VmFsdWUgPSB2YWx1ZTtcblxuXHRcdGV2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uWzNdLCBjb250ZXh0LCBnb3RSaWdodFZhbHVlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdvdFJpZ2h0VmFsdWUoZXJyLCByaWdodFZhbHVlKSB7XG5cdFx0aWYgKGVycikge1xuXHRcdFx0Y2IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKG9wZXJhdG9yKSB7XG5cdFx0Y2FzZSBcIj09XCI6XG5cdFx0XHRjYihudWxsLCBsZWZ0VmFsdWUgPT09IHJpZ2h0VmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcIitcIjpcblx0XHRcdGNiKG51bGwsIGxlZnRWYWx1ZSArIHJpZ2h0VmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcIi1cIjpcblx0XHRcdGNiKG51bGwsIGxlZnRWYWx1ZSAtIHJpZ2h0VmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcIiZcIjpcblx0XHRcdGNiKGNvbnRleHQuZXJyb3IoXG5cdFx0XHRcdFwiYml0d2lzZSBvcGVyYXRvciAnJicgbm90IGFsbG93ZWQgaW4gdGVtcGxhdGVzXCIpKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCJ8XCI6XG5cdFx0XHRjYihjb250ZXh0LmVycm9yKFxuXHRcdFx0XHRcImJpdHdpc2Ugb3BlcmF0b3IgJ3wnIG5vdCBhbGxvd2VkIGluIHRlbXBsYXRlc1wiKSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwiKlwiOlxuXHRcdFx0Y2IobnVsbCwgbGVmdFZhbHVlICogcmlnaHRWYWx1ZSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwiL1wiOlxuXHRcdFx0Y2IobnVsbCwgbGVmdFZhbHVlIC8gcmlnaHRWYWx1ZSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwiJVwiOlxuXHRcdFx0Y2IobnVsbCwgbGVmdFZhbHVlICUgcmlnaHRWYWx1ZSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwiPj5cIjpcblx0XHRcdGNiKGNvbnRleHQuZXJyb3IoXCJiaXQgc2hpZnQgb3BlcmF0b3IgJz4+JyBcIiArXG5cdFx0XHRcdFwibm90IGFsbG93ZWQgaW4gdGVtcGxhdGVzXCIpKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCI8PFwiOlxuXHRcdFx0Y2IoY29udGV4dC5lcnJvcihcImJpdCBzaGlmdCBvcGVyYXRvciAnPDwnIFwiICtcblx0XHRcdFx0XCJub3QgYWxsb3dlZCBpbiB0ZW1wbGF0ZXNcIikpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcIj4+PlwiOlxuXHRcdFx0Y2IoY29udGV4dC5lcnJvcihcImJpdCBzaGlmdCBvcGVyYXRvciAnPj4+JyBcIiArXG5cdFx0XHRcdFwibm90IGFsbG93ZWQgaW4gdGVtcGxhdGVzXCIpKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCI8XCI6XG5cdFx0XHRjYihudWxsLCBsZWZ0VmFsdWUgPCByaWdodFZhbHVlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCI+XCI6XG5cdFx0XHRjYihudWxsLCBsZWZ0VmFsdWUgPiByaWdodFZhbHVlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCI8PVwiOlxuXHRcdFx0Y2IobnVsbCwgbGVmdFZhbHVlIDw9IHJpZ2h0VmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcIj49XCI6XG5cdFx0XHRjYihudWxsLCBsZWZ0VmFsdWUgPj0gcmlnaHRWYWx1ZSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwiPT09XCI6XG5cdFx0XHRjYihjb250ZXh0LmVycm9yKFxuXHRcdFx0XHRcIic9PT0nIG9wZXJhdG9yIG5vdCBhbGxvd2VkIGluIHRlbXBsYXRlcy4gXCIgK1xuXHRcdFx0XHRcIk5vdGUgdGhhdCAnPT0nIGlzICdzdHJpY3RseSBlcXVhbHMnIChub24tY2FzdGluZykuXCJcblx0XHRcdCkpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcIiE9XCI6XG5cdFx0XHRjYihudWxsLCBsZWZ0VmFsdWUgIT09IHJpZ2h0VmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcIiE9PVwiOlxuXHRcdFx0Y2IoY29udGV4dC5lcnJvcihcblx0XHRcdFx0XCInIT09JyBvcGVyYXRvciBub3QgYWxsb3dlZCBpbiB0ZW1wbGF0ZXMuIFwiICtcblx0XHRcdFx0XCJOb3RlIHRoYXQgJyE9JyBpcyAnc3RyaWN0bHkgbm90IGVxdWFsJyAobm9uLWNhc3RpbmcpLlwiXG5cdFx0XHQpKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCImJlwiOlxuXHRcdFx0Y2IobnVsbCwgbGVmdFZhbHVlICYmIHJpZ2h0VmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcInx8XCI6XG5cdFx0XHRjYihudWxsLCBsZWZ0VmFsdWUgfHwgcmlnaHRWYWx1ZSk7XG5cdFx0XHRicmVhaztcblx0XHRkZWZhdWx0OlxuXHRcdFx0Y2IoY29udGV4dC5lcnJvcihcInVuaGFuZGxlZCBiaW5hcnkgb3BlcmF0b3IgXCIgKyBvcGVyYXRvcikpO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGV2YWx1YXRlQ29uZGl0aW9uYWxFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKSB7XG5cdC8vIFtcImNvbmRpdGlvbmFsXCIsIDx0ZXN0PiwgPGNhc2UgdHJ1ZT4sIDxjYXNlIGZhbHNlPl1cblxuXHRldmFsdWF0ZUV4cHJlc3Npb24oZXhwcmVzc2lvblsxXSwgY29udGV4dCwgZ290VGVzdCk7XG5cblx0ZnVuY3Rpb24gZ290VGVzdChlcnIsIHZhbHVlKSB7XG5cdFx0aWYgKGVycikge1xuXHRcdFx0Y2IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGV2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uWzJdLCBjb250ZXh0LCBjYik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uWzNdLCBjb250ZXh0LCBjYik7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGV2YWx1YXRlVW5hcnlQcmVmaXhFeHByZXNzaW9uKGV4cHJlc3Npb24sIGNvbnRleHQsIGNiKSB7XG5cdHZhciBvcGVyYXRvciA9IGV4cHJlc3Npb25bMV07XG5cdGV2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uWzJdLCBjb250ZXh0LCBnb3RWYWx1ZSk7XG5cblx0ZnVuY3Rpb24gZ290VmFsdWUoZXJyLCB2YWx1ZSkge1xuXHRcdGlmIChlcnIpIHtcblx0XHRcdGNiKGVycik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChvcGVyYXRvcikge1xuXHRcdGNhc2UgXCIhXCI6XG5cdFx0XHRjYihudWxsLCAhdmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcIi1cIjpcblx0XHRcdGNiKG51bGwsIC12YWx1ZSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwiK1wiOlxuXHRcdFx0Y2IobnVsbCwgK3ZhbHVlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRjYihjb250ZXh0LmVycm9yKFwidW5oYW5kbGVkIHVuYXJ5LXByZWZpeCBvcGVyYXRvciBcIiArXG5cdFx0XHRcdG9wZXJhdG9yKSk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gSE9QKG9iaiwgcHJvcCkge1xuXHRpZiAoIW9iaikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaHRtbChzdHIpIHtcblx0cmV0dXJuIChcIlwiICsgc3RyKS5yZXBsYWNlKC8mfFwifCd8PHw+L2csIGZ1bmN0aW9uIChjKSB7XG5cdFx0c3dpdGNoIChjKSB7XG5cdFx0Y2FzZSBcIiZcIjpcblx0XHRcdHJldHVybiBcIiZhbXA7XCI7XG5cdFx0Y2FzZSBcIlxcXCJcIjpcblx0XHRcdHJldHVybiBcIiZxdW90O1wiO1xuXHRcdGNhc2UgXCInXCI6XG5cdFx0XHRyZXR1cm4gXCImIzM5O1wiO1xuXHRcdGNhc2UgXCI8XCI6XG5cdFx0XHRyZXR1cm4gXCImbHQ7XCI7XG5cdFx0Y2FzZSBcIj5cIjpcblx0XHRcdHJldHVybiBcIiZndDtcIjtcblx0XHR9XG5cdH0pO1xufVxuXG4vKiogaGVscGVyIGNsYXNzZXMgKi9cblxuXG4vKlxuZnVuY3Rpb24gcGFyYW1ldGVyIG5hbWUgZXh0cmFjdGlvbiBmcm9tIHN0YWNrb3ZlcmZsb3c6XG5odHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzEwMDc5ODEvXG5ob3ctdG8tZ2V0LWZ1bmN0aW9uLXBhcmFtZXRlci1uYW1lcy12YWx1ZXMtZHluYW1pY2FsbHktZnJvbS1qYXZhc2NyaXB0XG4qL1xudmFyIFNUUklQX0NPTU1FTlRTID0gLygoXFwvXFwvLiokKXwoXFwvXFwqW1xcc1xcU10qP1xcKlxcLykpL21nO1xudmFyIE5BTUVfTUFUQ0ggPSAvZnVuY3Rpb25cXHMrKFteXFwoXFxzXSspLztcblxuZnVuY3Rpb24gc2lnbmF0dXJlKGZ1bmMpIHtcblx0dmFyIHN0cmlwcGVkID0gZnVuYy50b1N0cmluZygpLnJlcGxhY2UoU1RSSVBfQ09NTUVOVFMsIFwiXCIpO1xuXHR2YXIgYXJncyA9IHN0cmlwcGVkXG5cdFx0LnNsaWNlKHN0cmlwcGVkLmluZGV4T2YoXCIoXCIpICsgMSwgc3RyaXBwZWQuaW5kZXhPZihcIilcIikpXG5cdFx0Lm1hdGNoKC8oW15cXHMsXSspL2cpO1xuXG5cdGlmICghYXJncykge1xuXHRcdGFyZ3MgPSBbXTtcblx0fVxuXG5cdHZhciBuYW1lTWF0Y2hlcyA9IE5BTUVfTUFUQ0guZXhlYyhzdHJpcHBlZCk7XG5cdHZhciBuYW1lID0gbmFtZU1hdGNoZXMgPyBuYW1lTWF0Y2hlc1sxXSA6IG51bGw7XG5cblx0cmV0dXJuIHtcblx0XHRuYW1lOiBuYW1lLFxuXHRcdGFyZ3M6IGFyZ3Ncblx0fTtcbn1cbmZ1bmN0aW9uIEFycmF5SXRlcmF0b3IoYXJyYXkpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHNlbGYuX2FycmF5ID0gYXJyYXk7XG5cdHNlbGYuX2luZGV4ID0gMDtcblx0c2VsZi5fcGF1c2VkID0gZmFsc2U7XG5cdHNlbGYuX2RvbmUgPSBmYWxzZTtcblxuXHRuZXh0VGljayhmdW5jdGlvbiAoKSB7XG5cdFx0c2VsZi5fbmV4dCgpO1xuXHR9KTtcbn1cblxudXRpbC5pbmhlcml0cyhBcnJheUl0ZXJhdG9yLCBldmVudHMuRXZlbnRFbWl0dGVyKTtcblxuQXJyYXlJdGVyYXRvci5wcm90b3R5cGUuX25leHQgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0aWYgKHNlbGYuX2RvbmUpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoIXNlbGYuX3BhdXNlZCkge1xuXHRcdGlmIChzZWxmLl9pbmRleCA+PSBzZWxmLl9hcnJheS5sZW5ndGgpIHtcblx0XHRcdHNlbGYuX2RvbmUgPSB0cnVlO1xuXHRcdFx0bmV4dFRpY2soZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRzZWxmLmVtaXQoXCJlbmRcIik7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2YXIgZGF0YSA9IHNlbGYuX2FycmF5W3NlbGYuX2luZGV4XTtcblx0XHRzZWxmLl9pbmRleCsrO1xuXHRcdHNlbGYuZW1pdChcImRhdGFcIiwgZGF0YSk7XG5cdFx0c2VsZi5fbmV4dCgpO1xuXHR9XG59O1xuXG5BcnJheUl0ZXJhdG9yLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbiAoKSB7XG5cdGlmICh0aGlzLl9wYXVzZWQpIHtcblx0XHR0aGlzLl9wYXVzZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9uZXh0KCk7XG5cdH1cbn07XG5cbkFycmF5SXRlcmF0b3IucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24gKCkge1xuXHR0aGlzLl9wYXVzZWQgPSB0cnVlO1xufTtcblxuLypcbmZ1bmN0aW9uIHBhcmFtZXRlciBuYW1lIGV4dHJhY3Rpb24gZnJvbSBzdGFja292ZXJmbG93OlxuaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xMDA3OTgxL1xuaG93LXRvLWdldC1mdW5jdGlvbi1wYXJhbWV0ZXItbmFtZXMtdmFsdWVzLWR5bmFtaWNhbGx5LWZyb20tamF2YXNjcmlwdFxuKi9cbnZhciBTVFJJUF9DT01NRU5UUyA9IC8oKFxcL1xcLy4qJCl8KFxcL1xcKltcXHNcXFNdKj9cXCpcXC8pKS9tZztcbnZhciBOQU1FX01BVENIID0gL2Z1bmN0aW9uXFxzKyhbXlxcKFxcc10rKS87XG5cbmZ1bmN0aW9uIHNpZ25hdHVyZShmdW5jKSB7XG5cdHZhciBzdHJpcHBlZCA9IGZ1bmMudG9TdHJpbmcoKS5yZXBsYWNlKFNUUklQX0NPTU1FTlRTLCBcIlwiKTtcblx0dmFyIGFyZ3MgPSBzdHJpcHBlZFxuXHRcdC5zbGljZShzdHJpcHBlZC5pbmRleE9mKFwiKFwiKSArIDEsIHN0cmlwcGVkLmluZGV4T2YoXCIpXCIpKVxuXHRcdC5tYXRjaCgvKFteXFxzLF0rKS9nKTtcblxuXHRpZiAoIWFyZ3MpIHtcblx0XHRhcmdzID0gW107XG5cdH1cblxuXHR2YXIgbmFtZU1hdGNoZXMgPSBOQU1FX01BVENILmV4ZWMoc3RyaXBwZWQpO1xuXHR2YXIgbmFtZSA9IG5hbWVNYXRjaGVzID8gbmFtZU1hdGNoZXNbMV0gOiBudWxsO1xuXG5cdHJldHVybiB7XG5cdFx0bmFtZTogbmFtZSxcblx0XHRhcmdzOiBhcmdzXG5cdH07XG59XG5cbmV4cG9ydHMucmVuZGVyID0gcmVuZGVyO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIk9jOXpRSlwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIixudWxsLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkge1xuICB0aGlzLl9ldmVudHMgPSB0aGlzLl9ldmVudHMgfHwge307XG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC4xMC54XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbi8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xuLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcbiAgaWYgKCFpc051bWJlcihuKSB8fCBuIDwgMCB8fCBpc05hTihuKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpO1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGVyLCBoYW5kbGVyLCBsZW4sIGFyZ3MsIGksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBJZiB0aGVyZSBpcyBubyAnZXJyb3InIGV2ZW50IGxpc3RlbmVyIHRoZW4gdGhyb3cuXG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgaWYgKCF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzT2JqZWN0KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKSB7XG4gICAgICBlciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGVyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgVHlwZUVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50LicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzVW5kZWZpbmVkKGhhbmRsZXIpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZiAoaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuICAgIHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgLy8gZmFzdCBjYXNlc1xuICAgICAgY2FzZSAxOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgLy8gc2xvd2VyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGhhbmRsZXIpKSB7XG4gICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuXG4gICAgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIG07XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJcIi5cbiAgaWYgKHRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcilcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgaXNGdW5jdGlvbihsaXN0ZW5lci5saXN0ZW5lcikgP1xuICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lciA6IGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgZWxzZSBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICBlbHNlXG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuXG4gIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pICYmICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkKSB7XG4gICAgdmFyIG07XG4gICAgaWYgKCFpc1VuZGVmaW5lZCh0aGlzLl9tYXhMaXN0ZW5lcnMpKSB7XG4gICAgICBtID0gdGhpcy5fbWF4TGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgaWYgKG0gJiYgbSA+IDAgJiYgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IG0pIHtcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5lcnJvcignKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXG4gICAgICAgICAgICAgICAgICAgICdsZWFrIGRldGVjdGVkLiAlZCBsaXN0ZW5lcnMgYWRkZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCk7XG4gICAgICBpZiAodHlwZW9mIGNvbnNvbGUudHJhY2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gbm90IHN1cHBvcnRlZCBpbiBJRSAxMFxuICAgICAgICBjb25zb2xlLnRyYWNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIHZhciBmaXJlZCA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcblxuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9XG5cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICB0aGlzLm9uKHR5cGUsIGcpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbGlzdCwgcG9zaXRpb24sIGxlbmd0aCwgaTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXR1cm4gdGhpcztcblxuICBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuICBsZW5ndGggPSBsaXN0Lmxlbmd0aDtcbiAgcG9zaXRpb24gPSAtMTtcblxuICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHxcbiAgICAgIChpc0Z1bmN0aW9uKGxpc3QubGlzdGVuZXIpICYmIGxpc3QubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG5cbiAgfSBlbHNlIGlmIChpc09iamVjdChsaXN0KSkge1xuICAgIGZvciAoaSA9IGxlbmd0aDsgaS0tID4gMDspIHtcbiAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgIChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwb3NpdGlvbiA8IDApXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgbGlzdC5sZW5ndGggPSAwO1xuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdC5zcGxpY2UocG9zaXRpb24sIDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGtleSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIG5vdCBsaXN0ZW5pbmcgZm9yIHJlbW92ZUxpc3RlbmVyLCBubyBuZWVkIHRvIGVtaXRcbiAgaWYgKCF0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICBmb3IgKGtleSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzRnVuY3Rpb24obGlzdGVuZXJzKSkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBMSUZPIG9yZGVyXG4gICAgd2hpbGUgKGxpc3RlbmVycy5sZW5ndGgpXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV0pO1xuICB9XG4gIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSBbXTtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbih0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xuICBlbHNlXG4gICAgcmV0ID0gdGhpcy5fZXZlbnRzW3R5cGVdLnNsaWNlKCk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCFlbWl0dGVyLl9ldmVudHMgfHwgIWVtaXR0ZXIuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSAwO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKGVtaXR0ZXIuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gMTtcbiAgZWxzZVxuICAgIHJldCA9IGVtaXR0ZXIuX2V2ZW50c1t0eXBlXS5sZW5ndGg7XG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG4iLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gcmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIGFycmF5IHdpdGggZGlyZWN0b3J5IG5hbWVzIHRoZXJlXG4vLyBtdXN0IGJlIG5vIHNsYXNoZXMsIGVtcHR5IGVsZW1lbnRzLCBvciBkZXZpY2UgbmFtZXMgKGM6XFwpIGluIHRoZSBhcnJheVxuLy8gKHNvIGFsc28gbm8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyAtIGl0IGRvZXMgbm90IGRpc3Rpbmd1aXNoXG4vLyByZWxhdGl2ZSBhbmQgYWJzb2x1dGUgcGF0aHMpXG5mdW5jdGlvbiBub3JtYWxpemVBcnJheShwYXJ0cywgYWxsb3dBYm92ZVJvb3QpIHtcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIGxhc3QgPSBwYXJ0c1tpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoYWxsb3dBYm92ZVJvb3QpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHBhcnRzLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcnRzO1xufVxuXG4vLyBTcGxpdCBhIGZpbGVuYW1lIGludG8gW3Jvb3QsIGRpciwgYmFzZW5hbWUsIGV4dF0sIHVuaXggdmVyc2lvblxuLy8gJ3Jvb3QnIGlzIGp1c3QgYSBzbGFzaCwgb3Igbm90aGluZy5cbnZhciBzcGxpdFBhdGhSZSA9XG4gICAgL14oXFwvP3wpKFtcXHNcXFNdKj8pKCg/OlxcLnsxLDJ9fFteXFwvXSs/fCkoXFwuW14uXFwvXSp8KSkoPzpbXFwvXSopJC87XG52YXIgc3BsaXRQYXRoID0gZnVuY3Rpb24oZmlsZW5hbWUpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aFJlLmV4ZWMoZmlsZW5hbWUpLnNsaWNlKDEpO1xufTtcblxuLy8gcGF0aC5yZXNvbHZlKFtmcm9tIC4uLl0sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZXNvbHZlID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZXNvbHZlZFBhdGggPSAnJyxcbiAgICAgIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gLTEgJiYgIXJlc29sdmVkQWJzb2x1dGU7IGktLSkge1xuICAgIHZhciBwYXRoID0gKGkgPj0gMCkgPyBhcmd1bWVudHNbaV0gOiBwcm9jZXNzLmN3ZCgpO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBhbmQgaW52YWxpZCBlbnRyaWVzXG4gICAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGgucmVzb2x2ZSBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9IGVsc2UgaWYgKCFwYXRoKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXNvbHZlZFBhdGggPSBwYXRoICsgJy8nICsgcmVzb2x2ZWRQYXRoO1xuICAgIHJlc29sdmVkQWJzb2x1dGUgPSBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB9XG5cbiAgLy8gQXQgdGhpcyBwb2ludCB0aGUgcGF0aCBzaG91bGQgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGFic29sdXRlIHBhdGgsIGJ1dFxuICAvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gcHJvY2Vzcy5jd2QoKSBmYWlscylcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHJlc29sdmVkUGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFyZXNvbHZlZEFic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgcmV0dXJuICgocmVzb2x2ZWRBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHJlc29sdmVkUGF0aCkgfHwgJy4nO1xufTtcblxuLy8gcGF0aC5ub3JtYWxpemUocGF0aClcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMubm9ybWFsaXplID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgaXNBYnNvbHV0ZSA9IGV4cG9ydHMuaXNBYnNvbHV0ZShwYXRoKSxcbiAgICAgIHRyYWlsaW5nU2xhc2ggPSBzdWJzdHIocGF0aCwgLTEpID09PSAnLyc7XG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFpc0Fic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgaWYgKCFwYXRoICYmICFpc0Fic29sdXRlKSB7XG4gICAgcGF0aCA9ICcuJztcbiAgfVxuICBpZiAocGF0aCAmJiB0cmFpbGluZ1NsYXNoKSB7XG4gICAgcGF0aCArPSAnLyc7XG4gIH1cblxuICByZXR1cm4gKGlzQWJzb2x1dGUgPyAnLycgOiAnJykgKyBwYXRoO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5pc0Fic29sdXRlID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuam9pbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuICByZXR1cm4gZXhwb3J0cy5ub3JtYWxpemUoZmlsdGVyKHBhdGhzLCBmdW5jdGlvbihwLCBpbmRleCkge1xuICAgIGlmICh0eXBlb2YgcCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLmpvaW4gbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfVxuICAgIHJldHVybiBwO1xuICB9KS5qb2luKCcvJykpO1xufTtcblxuXG4vLyBwYXRoLnJlbGF0aXZlKGZyb20sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZWxhdGl2ZSA9IGZ1bmN0aW9uKGZyb20sIHRvKSB7XG4gIGZyb20gPSBleHBvcnRzLnJlc29sdmUoZnJvbSkuc3Vic3RyKDEpO1xuICB0byA9IGV4cG9ydHMucmVzb2x2ZSh0bykuc3Vic3RyKDEpO1xuXG4gIGZ1bmN0aW9uIHRyaW0oYXJyKSB7XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICBmb3IgKDsgc3RhcnQgPCBhcnIubGVuZ3RoOyBzdGFydCsrKSB7XG4gICAgICBpZiAoYXJyW3N0YXJ0XSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIHZhciBlbmQgPSBhcnIubGVuZ3RoIC0gMTtcbiAgICBmb3IgKDsgZW5kID49IDA7IGVuZC0tKSB7XG4gICAgICBpZiAoYXJyW2VuZF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPiBlbmQpIHJldHVybiBbXTtcbiAgICByZXR1cm4gYXJyLnNsaWNlKHN0YXJ0LCBlbmQgLSBzdGFydCArIDEpO1xuICB9XG5cbiAgdmFyIGZyb21QYXJ0cyA9IHRyaW0oZnJvbS5zcGxpdCgnLycpKTtcbiAgdmFyIHRvUGFydHMgPSB0cmltKHRvLnNwbGl0KCcvJykpO1xuXG4gIHZhciBsZW5ndGggPSBNYXRoLm1pbihmcm9tUGFydHMubGVuZ3RoLCB0b1BhcnRzLmxlbmd0aCk7XG4gIHZhciBzYW1lUGFydHNMZW5ndGggPSBsZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoZnJvbVBhcnRzW2ldICE9PSB0b1BhcnRzW2ldKSB7XG4gICAgICBzYW1lUGFydHNMZW5ndGggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgdmFyIG91dHB1dFBhcnRzID0gW107XG4gIGZvciAodmFyIGkgPSBzYW1lUGFydHNMZW5ndGg7IGkgPCBmcm9tUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRQYXJ0cy5wdXNoKCcuLicpO1xuICB9XG5cbiAgb3V0cHV0UGFydHMgPSBvdXRwdXRQYXJ0cy5jb25jYXQodG9QYXJ0cy5zbGljZShzYW1lUGFydHNMZW5ndGgpKTtcblxuICByZXR1cm4gb3V0cHV0UGFydHMuam9pbignLycpO1xufTtcblxuZXhwb3J0cy5zZXAgPSAnLyc7XG5leHBvcnRzLmRlbGltaXRlciA9ICc6JztcblxuZXhwb3J0cy5kaXJuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgcmVzdWx0ID0gc3BsaXRQYXRoKHBhdGgpLFxuICAgICAgcm9vdCA9IHJlc3VsdFswXSxcbiAgICAgIGRpciA9IHJlc3VsdFsxXTtcblxuICBpZiAoIXJvb3QgJiYgIWRpcikge1xuICAgIC8vIE5vIGRpcm5hbWUgd2hhdHNvZXZlclxuICAgIHJldHVybiAnLic7XG4gIH1cblxuICBpZiAoZGlyKSB7XG4gICAgLy8gSXQgaGFzIGEgZGlybmFtZSwgc3RyaXAgdHJhaWxpbmcgc2xhc2hcbiAgICBkaXIgPSBkaXIuc3Vic3RyKDAsIGRpci5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIHJldHVybiByb290ICsgZGlyO1xufTtcblxuXG5leHBvcnRzLmJhc2VuYW1lID0gZnVuY3Rpb24ocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gc3BsaXRQYXRoKHBhdGgpWzJdO1xuICAvLyBUT0RPOiBtYWtlIHRoaXMgY29tcGFyaXNvbiBjYXNlLWluc2Vuc2l0aXZlIG9uIHdpbmRvd3M/XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5cbmV4cG9ydHMuZXh0bmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aChwYXRoKVszXTtcbn07XG5cbmZ1bmN0aW9uIGZpbHRlciAoeHMsIGYpIHtcbiAgICBpZiAoeHMuZmlsdGVyKSByZXR1cm4geHMuZmlsdGVyKGYpO1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChmKHhzW2ldLCBpLCB4cykpIHJlcy5wdXNoKHhzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuLy8gU3RyaW5nLnByb3RvdHlwZS5zdWJzdHIgLSBuZWdhdGl2ZSBpbmRleCBkb24ndCB3b3JrIGluIElFOFxudmFyIHN1YnN0ciA9ICdhYicuc3Vic3RyKC0xKSA9PT0gJ2InXG4gICAgPyBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7IHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pIH1cbiAgICA6IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHtcbiAgICAgICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSBzdHIubGVuZ3RoICsgc3RhcnQ7XG4gICAgICAgIHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pO1xuICAgIH1cbjtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJPYzl6UUpcIikpIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiT2M5elFKXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiXX0=
