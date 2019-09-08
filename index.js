module.exports.runCLI = async function runCLI() {
  const chalk = require("chalk");
  const ora = require("ora");
  const spinner = ora(chalk.cyan("Initializing...")).start();

  const webpack = require("webpack");
  const stream = require("stream");
  const inquirer = require("inquirer");
  const formatWebpackMessages = require("react-dev-utils/formatWebpackMessages");
  const child_process = require("child_process");
  const { createServerWebpackConfig } = require("./server.webpack.config");

  spinner.text = chalk.cyan("Creating compiler...");

  const webpackConfig = createServerWebpackConfig();
  const serverCompiler = createCompiler(webpackConfig);

  const compilationPromise = waitForCompilation(serverCompiler);

  let serverProcess;
  let serverLogPaused = false;

  let ui = new inquirer.ui.BottomBar();
  const stdin = process.stdin;

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
      .pipe(ui.log)
      .pipe(process.stdout);
    serverProcess.stderr
      .pipe(serverLogPauser())
      .pipe(serverLogPrefixer())
      .pipe(ui.log)
      .pipe(process.stderr);

    serverProcess.on("disconnect", () => (serverProcess = undefined));
    serverProcess.on("close", code => {
      console.log("closed!");
      ui.updateBottomBar(
        `${
          code && code > 0
            ? chalk.red(`! Exited with code ${code}...`)
            : chalk.green(`✔ Exited cleanly`)
        } ${chalk.gray("(any key to view menu)")}`
      );
    });

    serverProcess.on("exit", code => {
      // console.log("exit");
    });

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
        ui.updateBottomBar(
          `${chalk.green("✈ Running...")} ${chalk.gray(
            "(any key to view menu)"
          )}`
        );
        stdin.resume();
      }
    }
  });

  try {
    await compilationPromise;
  } catch (error) {}

  ui.updateBottomBar(
    `${chalk.green("✈ Running...")} ${chalk.gray("(any key to view menu)")}`
  );

  // without this, we would only get streams once enter is pressed
  stdin.setRawMode(true);

  // resume stdin in the parent process (node app won't quit all by itself
  // unless an error or process.exit() happens)
  stdin.resume();

  // i don't want binary, do you?
  stdin.setEncoding("utf8");

  const prompt = inquirer.createPromptModule();

  const onKeyPress = key => {
    // ctrl-c ( end of text )
    if (key === "\u0003") {
      process.exit();
    }

    serverLogPaused = true;

    ui.updateBottomBar("");
    stdin.removeListener("data", onKeyPress);
    prompt([
      {
        type: "list",
        name: "action",
        message: "What now?",
        choices: ["Restart", "Show stdout"]
      }
    ]).then(({ action }) => {
      if (action === "Show stdout") {
        serverLogPaused = false;
        ui.updateBottomBar(
          `${chalk.green("✈ Running...")} ${chalk.gray(
            "(any key to view menu)"
          )}`
        );
        stdin.resume();
        stdin.on("data", onKeyPress);
      } else if (action === "Restart") {
        serverLogPaused = false;
        if (serverProcess) {
          spinner.text = "Killing process...";
          spinner.start();

          serverProcess.removeAllListeners("exit");
          serverProcess.on("exit", () => {
            spinner.succeed("Process killed");
            startServerProcess();
            ui.updateBottomBar(
              `${chalk.green("✈ Running...")} ${chalk.gray(
                "(any key to view menu)"
              )}`
            );
            stdin.resume();
            stdin.on("data", onKeyPress);
          });
          serverProcess.kill();
        } else {
          startServerProcess();
          ui.updateBottomBar(
            `${chalk.green("✈ Running...")} ${chalk.gray(
              "(any key to view menu)"
            )}`
          );
          stdin.resume();
          stdin.on("data", onKeyPress);
        }
      }
    });
  };

  // on any data into stdin
  stdin.on("data", onKeyPress);

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
      compiler.hooks.done.tap("promise", stats =>
        stats.hasErrors() ? reject(stats) : resolve(stats)
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
