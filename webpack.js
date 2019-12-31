const config = require('./webpack.config');
const Compiler = require('./compiler');

const compiler = new Compiler(config);

compiler.run();
