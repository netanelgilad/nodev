const path = require("path");
const webpack = require("webpack");
const nodeExternals = require("webpack-node-externals");
const ModuleNotFoundPlugin = require("react-dev-utils/ModuleNotFoundPlugin");
const CaseSensitivePathsPlugin = require("case-sensitive-paths-webpack-plugin");
const typescriptFormatter = require("react-dev-utils/typescriptFormatter");

module.exports.createServerWebpackConfig = function createServerWebpackConfig({
  mode = "development",
  entry = "./index.ts",
  isDebug = true
} = {}) {
  entry = path.resolve(entry);
  const context = path.dirname(entry);

  const serverConfig = {
    context,

    mode,

    name: "server",

    target: "node",

    entry: {
      index: [require.resolve("./server-hmr"), entry]
    },

    output: {
      publicPath: "/",
      pathinfo: isDebug,
      path: path.resolve("build"),
      filename: "[name].js",
      chunkFilename: "chunks/[name].js",
      libraryTarget: "umd",
      libraryExport: "default",
      globalObject: "(typeof self !== 'undefined' ? self : this)",
      hotUpdateMainFilename: "updates/[hash].hot-update.json",
      hotUpdateChunkFilename: "updates/[id].[hash].hot-update.js",
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: info =>
        path.resolve(info.absoluteResourcePath).replace(/\\/g, "/")
    },

    // Webpack mutates resolve object, so clone it to avoid issues
    // https://github.com/webpack/webpack/issues/4817
    resolve: {
      modules: ["node_modules", context],

      extensions: [".wasm", ".mjs", ".js", ".json", ".ts", ".tsx"],

      // Whether to resolve symlinks to their symlinked location.
      symlinks: false
    },

    module: {
      rules: [
        // Rules for TS / TSX
        {
          test: /\.(ts|tsx)$/,
          exclude: /(node_modules)/,
          use: [
            {
              loader: "thread-loader",
              options: {
                workers: require("os").cpus().length - 1
              }
            },
            {
              loader: "ts-loader",
              options: {
                // This implicitly sets `transpileOnly` to `true`
                happyPackMode: true,
                compilerOptions: {
                  // force es modules for tree shaking
                  module: "esnext",
                  // use same module resolution
                  moduleResolution: "node",

                  // allow using Promises, Array.prototype.includes, String.prototype.padStart, etc.
                  lib: ["es2017"],
                  // use async/await instead of embedding polyfills
                  target: "es2017"
                }
              }
            }
          ]
        }
      ]
    },

    resolveLoader: {
      modules: [path.join(__dirname, "../node_modules"), "node_modules"]
    },

    externals: [nodeExternals()],

    plugins: [
      // This gives some necessary context to module not found errors, such as
      // the requesting resource
      new ModuleNotFoundPlugin(process.cwd()),
      // https://github.com/Urthen/case-sensitive-paths-webpack-plugin
      new CaseSensitivePathsPlugin(),

      // https://webpack.js.org/plugins/banner-plugin/
      new webpack.BannerPlugin({
        // https://github.com/evanw/node-source-map-support
        banner: 'require("source-map-support").install();',
        raw: true,
        entryOnly: false
      }),

      new webpack.HotModuleReplacementPlugin(),

      new (require("fork-ts-checker-webpack-plugin"))({
        // https://github.com/facebook/create-react-app/pull/5607
        compilerOptions: {
          module: "esnext",
          moduleResolution: "node",
          resolveJsonModule: true,
          noEmit: true
        },
        async: false,
        silent: true,
        checkSyntacticErrors: true,
        formatter: typescriptFormatter
      })
    ],

    stats: "none",

    // https://webpack.js.org/configuration/optimization
    optimization: {
      // Do not modify/set the value of `process.env.NODE_ENV`
      nodeEnv: false
    },

    // Do not replace node globals with polyfills
    // https://webpack.js.org/configuration/node/
    node: {
      console: false,
      global: false,
      process: false,
      Buffer: false,
      __filename: false,
      __dirname: false
    },

    devtool: "cheap-module-inline-source-map"
  };

  return serverConfig;
};
