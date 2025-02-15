const path = require('path')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const package = require('./package.json')

const _resolve = {
    extensions: ['.jsx', '.js'],
    modules: [
        path.resolve(__dirname, 'node_modules'),
        'node_modules'
    ]
}

const _module = {
    rules: [
        {
            test: /\.jsx?$/,
            exclude: /node_modules/,
            use: {
                loader: 'babel-loader',
                options: {
                    presets: ['@babel/preset-env']
                }
            }
        },
        {
            test: /\.css$/,
            use: ['style-loader', 'css-loader']
        }
    ]
}

process.traceDeprecation = true;

module.exports = {
    mode: 'development',
    devtool: 'source-map',
    entry: {
        background: './src/js/background.js',
        content: './src/js/content.js',
        settings: './src/js/settings.js',
        popup: './src/js/popup.js'
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: 'js/[name].js',
        clean: true
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'src', 'html'),
                    to: path.resolve(__dirname, 'build', 'html')
                },
                {
                    from: path.resolve(__dirname, 'src', 'css'),
                    to: path.resolve(__dirname, 'build', 'css')
                },
                {
                    from: path.resolve(__dirname, 'src', 'icons'),
                    to: path.resolve(__dirname, 'build', 'icons')
                },
                {
                    from: path.resolve(__dirname, 'src', 'js', 'tabsautomatic.js'),
                    to: path.resolve(__dirname, 'build', 'js')
                },
                {
                    from: 'src/_locales',
                    to: '_locales'
                },
                {
                    from: "node_modules/webextension-polyfill/dist/browser-polyfill.min.js",
                    to: "js/browser-polyfill.min.js"
                },
                {
                    from: "node_modules/dompurify/dist/purify.min.js",
                    to: "js/purify.min.js"
                },
                {
                    from: "node_modules/sprintf-js/dist/sprintf.min.js",
                    to: "js/sprintf.min.js"
                }
            ]
        }),
        {
            apply: (compiler) => {
                compiler.hooks.compilation.tap('TransformManifestJsonPlugin', (compilation) => {
                    compilation.hooks.processAssets.tap(
                        {
                            name: 'TransformManifestJsonPlugin',
                            stage: compilation.PROCESS_ASSETS_STAGE_ADDITIONS
                        },
                        (assets) => {
                            // Load and transform the manifest.json
                            const manifestSource = compilation.inputFileSystem.readFileSync(
                                path.resolve(__dirname, 'src', 'manifest.json'),
                                'utf-8'
                            )
                            const manifest = JSON.parse(manifestSource)

                            // Modify manifest with package.json details
                            manifest.version = package.version

                            // Add the transformed manifest to assets
                            const transformedManifest = JSON.stringify(manifest, null, 2)
                            compilation.emitAsset(
                                'manifest.json',
                                {
                                    source: () => transformedManifest,
                                    size: () => transformedManifest.length
                                }
                            )
                        }
                    )
                })
            }
        }
    ],
    resolve: _resolve,
    module: _module
}
