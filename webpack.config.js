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
        path: path.resolve(__dirname, 'dist'),
        filename: 'js/[name].js',
        clean: true
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
}
