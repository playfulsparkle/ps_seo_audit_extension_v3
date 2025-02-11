const path = require('path')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const TransformJson = require('transform-json-webpack-plugin')
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
            exclude: path.resolve(__dirname, 'src'),
            enforce: 'pre',
            use: 'source-map-loader'
        },
        {
            test: /\.jsx?$/,
            exclude: /node_modules/,
            use: 'babel-loader'
        },
        {
            test: /\.css$/,
            use: [{
                loader: 'style-loader' // creates style nodes from JS strings
            }, {
                loader: 'css-loader' // translates CSS into CommonJS,
            }],
        }
    ]
}

module.exports = [
    {
        devtool: 'source-map',
        entry: [
            path.resolve(__dirname, 'src', 'js', 'background.js')
        ],
        output: {
            // build to the extension src vendor directory
            path: path.resolve(__dirname, 'dist'),
            filename: path.join('js', 'background.js')
        },
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: path.resolve(__dirname, 'src', 'html'),
                        to: path.resolve(__dirname, 'dist', 'html')
                    },
                    {
                        from: path.resolve(__dirname, 'src', 'css'),
                        to: path.resolve(__dirname, 'dist', 'css')
                    },
                    {
                        from: path.resolve(__dirname, 'src', 'icons'),
                        to: path.resolve(__dirname, 'dist', 'icons')
                    }
                ]
            }),
            new TransformJson({
                source: path.resolve(__dirname, 'src', 'manifest.json'),
                filename: 'manifest.json',
                object: {
                    description: package.description,
                    version: package.version
                }
            })
        ],
        resolve: _resolve,
        module: _module
    },
    {
        devtool: 'source-map',
        entry: [
            path.resolve(__dirname, 'src', 'js', 'settings.js')
        ],
        output: {
            // build to the extension src vendor directory
            path: path.resolve(__dirname, 'dist'),
            filename: path.join('js', 'settings.js')
        },
        resolve: _resolve,
        module: _module
    },
    {
        devtool: 'source-map',
        entry: [
            path.resolve(__dirname, 'src', 'js', 'content.js')
        ],
        output: {
            // build to the extension src vendor directory
            path: path.resolve(__dirname, 'dist'),
            filename: path.join('js', 'content.js')
        },
        resolve: _resolve,
        module: _module
    }
]
