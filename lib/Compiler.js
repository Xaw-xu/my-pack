let path = require('path')
let fs = require('fs')
let {parse:babylon} = require('babylon')
let traverse = require('@babel/traverse').default
let t = require('@babel/types')
let generator = require('@babel/generator').default
let ejs = require('ejs')
let {SyncHook} = require('tapable')
//babylon 源码转换为ast
//@babel/traverse
// @babel/types
// @babel/generator
class Compiler {
    constructor(config) {
        this.config = config

        this.entryId

        this.modules = {}

        this.entry = config.entry

        this.root = process.cwd()

        this.hooks = {
            entryOption:new SyncHook(),
            compile:new SyncHook(),
            afterCompile:new SyncHook(),
            afterPlugins:new SyncHook(),
            run:new SyncHook(),
            emit:new SyncHook(),
            done:new SyncHook()
        }
        let plugins = this.config.plugins
        if(Array.isArray(plugins)) {
            plugins.forEach(plugin=>{
                plugin.apply(this)
            })
        }
        this.hooks.afterPlugins.call()
    }

    getSource(modulePath) {
        let content = fs.readFileSync(modulePath,'utf-8')
        let rules = this.config.module.rules
        for (let i = 0; i < rules.length; i++) {
            let rule = rules[i]
            let {test,use} = rule
            let len = use.length -1
            if(test.test(modulePath)){
                function normalLoader() {
                    let loader = require(use[len--])
                    content = loader(content)
                    if(len>=0) {
                        normalLoader()
                    }
                }
                normalLoader()
            }
        }

        return content
    }

    parse(source,parentPath) {
        let ast = babylon(source)
        let dependencies = []
        traverse(ast,{
            CallExpression(p) {
                let node = p.node
                if(node.callee.name==='require'){
                    node.callee.name = '__webpack_require__'
                    let moduleName = node.arguments[0].value
                    moduleName = moduleName + (path.extname(moduleName)? '':'.js')
                    moduleName = './'+path.join(parentPath,moduleName)
                    dependencies.push(moduleName)
                    node.arguments = [t.stringLiteral(moduleName)]
                }
            }
        })
        let sourceCode = generator(ast).code
        return {sourceCode,dependencies}
    }

    buildModule(modulePath,isEntry){
        let source = this.getSource(modulePath)
        let moduleName = './'+ path.relative(this.root,modulePath)
        if(isEntry) {
            this.entryId = moduleName
        }
        let {sourceCode,dependencies}=this.parse(source,path.dirname(moduleName))
        
        this.modules[moduleName] = sourceCode
        dependencies.forEach(dep=>{
            this.buildModule(path.join(this.root,dep),false)
        })
    }

    emitFile() {
        let main = path.join(this.config.output.path,this.config.output.filename)

        let templateStr = this.getSource(path.join(__dirname,'main.ejs'))
        let code = ejs.render(templateStr,{entryId:this.entryId,modules:this.modules})
        this.assets = {}
        this.assets[main] = code
        fs.writeFileSync(main,this.assets[main])
    }

    run() {
        this.hooks.run.call()
        this.hooks.compile.call()
        this.buildModule(path.resolve(this.root,this.entry),true)
        this.hooks.afterCompile.call()
        this.hooks.emit.call()
        this.emitFile()
        this.hooks.done.call()
    }
}

module.exports = Compiler