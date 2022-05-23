#! /usr/bin/env node

let path = require('path')

let config = require(path.resolve('webpack.config.js'))

let Compiler = require('../lib/Compiler.js')

let comp = new Compiler(config)
comp.hooks.entryOption.call()

comp.run()

