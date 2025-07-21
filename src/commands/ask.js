const chalk = require('chalk');

module.exports = async function askCommand(query, options) {
  console.log(chalk.blue('AI Query:'), query);
  if (options.state) {
    console.log(chalk.gray('State ID:'), options.state);
  }
  console.log(chalk.yellow('\nThis command is not yet implemented.'));
};