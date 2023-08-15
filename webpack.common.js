const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
var webpack = require('webpack');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')
require('dotenv').config({ path: './.env' }); 

module.exports = {
  // Note: 
  // Chrome MV3 no longer allowed remote hosted code
  // Using module bundlers we can add the required code for your extension
  // Any modular script should be added as entry point
  entry: {
    options: './options/options.js',
    firebase_config: './options/firebase_config.js',
    signin: './options/signin.js',
    content: './content/content.js',
  },
  plugins: [
    // adds jquery to all modules. May not be necessary but need
    // to find a way to add it before adding content.js
    new webpack.ProvidePlugin({
      $: "jquery",
      jQuery: "jquery",
     }),
    new CleanWebpackPlugin({ cleanStaleWebpackAssets: false }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "options", "signin.html"),
      filename: "signin.html",
      chunks: ["signin"] // This is script from entry point
    }),
    // Note: you can add as many new HtmlWebpackPlugin objects  
    // filename: being the html filename
    // chunks: being the script src
    // if the script src is modular then add it as the entry point above
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "options", "options.html"),
      filename: "options.html",
      chunks: ["options"] // This is script from entry point
    }),

    // Note: This is to copy any remaining files to bundler
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: 'manifest.json',
          transform(content) {
            const replacedContent = content
              .toString()
              .replace('__EXTENSION_KEY__', process.env.EXTENSION_KEY)
              .replace('__CLIENT_ID__', process.env.CLIENT_ID);
            return Buffer.from(replacedContent);
          },
        },        { from: './icons/**' },
        { from: './css/*' },
        { from: '.env'},
        {
          from: './background/background.js',
          to: 'background.js',
          transform(content) {
            const replacedContent = content
              .toString()
              .replace('__BACKEND_URL__', process.env.BACKEND_URL);
            return Buffer.from(replacedContent);
          },
        },  
      ],
    }),

    // The following two are required for dotenv
    new NodePolyfillPlugin(),
    new webpack.DefinePlugin({
      "process.env": JSON.stringify(process.env),
    }),
  ],
  output: {
    // chrome load uppacked extension looks for files under dist/* folder
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
        {
            test: /\.css$/i,
            use: ['style-loader', 'css-loader'],
        },
        {
            test: /\.(gif|png|jpe?g|svg)$/i,
            use: [
                {
                    loader: 'file-loader',
                    options: {
                        outputPath: 'images',
                    },
                },
            ],
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: 'babel-loader'
        },
    ],
  },
};
