module.exports.runCLI = async function runCLI() {
  const chalk = require("chalk");
  const ora = require("ora");
  const spinner = ora(chalk.cyan("Initializing...")).start();

  const webpack = require("webpack");
  const stream = require("stream");
  const formatWebpackMessages = require("react-dev-utils/formatWebpackMessages");
  const child_process = require("child_process");
  const { createServerWebpackConfig } = require("./server.webpack.config");

  spinner.text = chalk.cyan("Creating compiler...");

  const webpackConfig = createServerWebpackConfig();
  const serverCompiler = createCompiler(webpackConfig);

  const compilationPromise = waitForCompilation(serverCompiler);

  let serverProcess;
  let serverLogPaused = false;

  const startServerProcess = () => {
    serverProcess = child_process.fork("./build/index.js", {
      stdio: "pipe",
      execArgv: process.argv.slice(3),
      env: {
        ...process.env,
        NODE_ENV: "development"
      }
    });

    serverProcess.stdout
      .pipe(serverLogPauser())
      .pipe(serverLogPrefixer())
      .pipe(process.stdout);
    serverProcess.stderr
      .pipe(serverLogPauser())
      .pipe(serverLogPrefixer())
      .pipe(process.stderr);

    serverProcess.on("disconnect", () => (serverProcess = undefined));

    serverProcess.on("message", () => {
      serverProcess.kill();
      startServerProcess();
    });
  };

  spinner.succeed(chalk.green("Compiler created"));

  serverCompiler.watch({ "info-verbosity": "none" }, (error, stats) => {
    if (!error && !stats.hasErrors()) {
      if (serverProcess) {
        serverProcess.send({});
      } else {
        startServerProcess();
      }
    }
  });

  try {
    await compilationPromise;
  } catch (error) {}

  function createCompiler(config) {
    let compiler;

    try {
      compiler = webpack(config);
    } catch (err) {
      console.log(chalk.red("Failed to compile."));
      console.log();
      console.log(err.message || err);
      console.log();
      process.exit(1);
    }

    let spinner;

    compiler.hooks.watchRun.tap("start-log", () => {
      serverLogPaused = true;
      console.log();
      spinner = ora(chalk.cyan("Compiling...")).start();
    });

    compiler.hooks.done.tap("finished-log", stats => {
      const messages = formatWebpackMessages(stats.toJson({}, true));
      const isSuccessful = !messages.errors.length && !messages.warnings.length;

      if (isSuccessful) {
        spinner.succeed(chalk.green("Compiled successfully!"));
        console.log();
      }

      // If errors exist, only show errors.
      if (messages.errors.length) {
        if (messages.errors.length > 1) {
          messages.errors.length = 1;
        }

        spinner.fail(chalk.red("Failed to compile."));

        console.log(messages.errors.join("\n\n"));

        return;
      }

      // Show warnings if no errors were found.
      if (messages.warnings.length) {
        spinner.warn(chalk.orange("Compiled with warnings."));
        console.log(messages.warnings.join("\n\n"));
      }

      serverLogPaused = false;
    });

    return compiler;
  }

  function waitForCompilation(compiler) {
    return new Promise((resolve, reject) => {
      compiler.hooks.done.tap(
        "promise",
        stats => (stats.hasErrors() ? reject(stats) : resolve(stats))
      );
    });
  }

  function serverLogPrefixer() {
    return new stream.Transform({
      transform(chunk, encoding, callback) {
        const chunkString = chunk.toString();
        if (chunkString.startsWith("[HMR]")) {
          this.push(chunkString.replace(/\[HMR\]/g, chalk.cyan(["[HMR]"])));
        } else {
          this.push(`${chalk.blue("[SERVER]")}: ${chunk.toString()}`);
        }

        callback();
      }
    });
  }

  function serverLogPauser() {
    return new stream.Transform({
      transform(chunk, encoding, callback) {
        if (!serverLogPaused) {
          this.push(chunk);
        }

        callback();
      }
    });
  }
};
