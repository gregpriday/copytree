const chalk = require('chalk');

module.exports = async function profileCreateCommand(path, options) {
  console.log(chalk.blue(`Creating profile for: ${path}`));
  console.log(chalk.gray('Character limit:'), options.charLimit);
  console.log(chalk.yellow('\nThis command is not yet implemented.'));
};