#!/usr/bin/env node

var argv = require("optimist").argv;

var commands = {
    "dev": require("../lib/commands/dev.js")
};

process.title = "bcn";

if (!argv._.length) {
    usage();
}

var commandName = argv._.shift();
var command = commands[commandName];
if (!command) {
    usage();
}

command.run(argv);

function usage() {
    console.log("Usage: bcn <command> [options]"); 
    process.exit();
}

