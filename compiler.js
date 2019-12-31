const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");

class compiler {
  constructor(opt) {
    this.opt = opt;
  }

  run() {
    const { entry, output } = this.opt;

    const res = this.generateCode(entry);

    fs.writeFileSync(path.resolve(output.path, output.filename), res);
  }

  moduleAnalyze(filename) {
    const content = fs.readFileSync(filename, "utf-8");

    const ast = parser.parse(content, {
      sourceType: "module"
    });

    const dependencies = {};

    traverse(ast, {
      ImportDeclaration({ node }) {
        const dirname = path.dirname(filename);
        const genFile = "./" + path.join(dirname, node.source.value);
        dependencies[node.source.value] = genFile;
      }
    });

    const { code } = babel.transformFromAst(ast, null, {
      presets: ["@babel/preset-env"]
    });

    return {
      filename,
      dependencies,
      code
    };
  }

  loader(filename, content) {
    const { rules } = this.opt.module;

    rules.forEach(v => {
      if (v.test.test(filename)) {
        const loaders = v.use;
        const length = loaders.length;
        const loaderIdx = length - 1;

        function iterateLoader() {
          const loaderName = loaders[loaderIdx--];

          const loader = require(path.join(
            process.pwd(),
            "node_modules",
            loaderName
          ));

          content = loader(content);

          if (loaderIdx >= 0) {
            iterateLoader();
          }
        }

        iterateLoader();
      }
    });

    return content;
  }

  graphAnalyze(entry) {
    const entryModule = this.moduleAnalyze(entry);
    const graphArr = [entryModule];

    graphArr.forEach(v => {
      const { dependencies } = v;

      if (dependencies) {
        for (let key in dependencies) {
          graphArr.push(this.moduleAnalyze(dependencies[key]));
        }
      }
    });

    const graph = {};

    graphArr.forEach(v => {
      graph[v.filename] = {
        dependencies: v.dependencies,
        code: v.code
      };
    });

    return graph;
  }

  generateCode(entry) {
    const graph = JSON.stringify(this.graphAnalyze(entry));

    return `(function(graph) {
            function require(module) {
                function localRequire(relativePath) {
                    return require(graph[module].dependencies[relativePath]);
                }

                var exports = {};
                (function(require, exports, code){
                    eval(code);
                })(localRequire, exports, graph[module].code);

                return exports;
            }

            require('${entry}')
        })(${graph})`;
  }
}

module.exports = compiler;
