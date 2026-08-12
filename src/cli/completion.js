/**
 * Shell completion, generated from the command schema.
 *
 * The same declarations that produce the parser and the help produce this, so a
 * completion can never offer a flag the parser rejects, or omit one it accepts.
 * That was the actual failure mode of hand-written completions: they are
 * correct on the day they are written.
 */

import { COMMANDS, COMMAND_GROUPS, longFlagOf, optionsOf, subcommandsOf } from './schema.js';

/**
 * Visible commands, as the tokens a user types.
 * @returns {Array<{path: string, summary: string}>} Command rows
 */
function visibleCommands() {
  const rows = [];
  for (const [parent, summary] of Object.entries(COMMAND_GROUPS)) {
    if (subcommandsOf(parent).length > 0) rows.push({ path: parent, summary });
  }
  for (const command of COMMANDS) {
    if (command.hidden) continue;
    rows.push({ path: command.path.join(' '), summary: command.summary });
  }
  return rows;
}

/**
 * Long flags for a command, excluding hidden and deprecated ones.
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @returns {Array<{flag: string, description: string, enumValues?: string[]}>} Flags
 */
function completableOptions(command) {
  return optionsOf(command)
    .filter((option) => option.visibility !== 'hidden')
    .map((option) => ({
      flag: longFlagOf(option),
      description: option.description,
      ...(option.enumValues ? { enumValues: option.enumValues } : {}),
    }));
}

/**
 * Escape a string for a single-quoted shell literal.
 * @param {string} value - Raw text
 * @returns {string} Escaped text
 */
function quote(value) {
  return String(value).replace(/'/g, `'\\''`);
}

/**
 * Generate completion code for a shell.
 *
 * @param {'bash'|'zsh'|'fish'|'powershell'} shell - Target shell
 * @returns {string} Completion script
 */
export function generateCompletion(shell) {
  switch (shell) {
    case 'bash':
      return bashCompletion();
    case 'zsh':
      return zshCompletion();
    case 'fish':
      return fishCompletion();
    case 'powershell':
      return powershellCompletion();
    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}

/**
 * Bash completion.
 * @returns {string} Script
 */
function bashCompletion() {
  const topLevel = [...new Set(visibleCommands().map((row) => row.path.split(' ')[0]))];
  const perCommand = COMMANDS.filter((command) => !command.hidden)
    .map((command) => {
      const flags = completableOptions(command)
        .map((option) => option.flag)
        .join(' ');
      return `    '${command.path.join(' ')}') echo '${quote(flags)}' ;;`;
    })
    .join('\n');

  // Keyed by command *and* flag: `--format` means `xml|markdown|…` on copy and
  // `text|json|ndjson` on plan, and offering the wrong set is worse than
  // offering none.
  const enumBlock = COMMANDS.filter((command) => !command.hidden)
    .flatMap((command) =>
      completableOptions(command)
        .filter((option) => option.enumValues)
        .map(
          (option) =>
            `    '${command.path.join(' ')}|${option.flag}') echo '${quote(option.enumValues.join(' '))}' ;;`,
        ),
    )
    .join('\n');

  return `# copytree bash completion — generated from the CopyTree command schema
_copytree_flags_for() {
  case "$1" in
${perCommand}
    *) echo '' ;;
  esac
}

_copytree_values_for() {
  case "$1|$2" in
${enumBlock}
    *'|--profile') ls -1d .copytree-*.yml .copytree-*.yaml .copytree-*.json 2>/dev/null |
      sed -e 's/^\\.copytree-//' -e 's/\\.[^.]*$//' ;;
    *) echo '' ;;
  esac
}

_copytree() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"

  local sub=""
  if [ "\${#COMP_WORDS[@]}" -gt 1 ]; then
    sub="\${COMP_WORDS[1]}"
  fi
  local sub2=""
  if [ "\${#COMP_WORDS[@]}" -gt 2 ]; then
    sub2="\${COMP_WORDS[2]}"
  fi

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W '${quote(topLevel.join(' '))}' -- "$cur") )
    COMPREPLY+=( $(compgen -d -- "$cur") )
    return 0
  fi

  # A flag that takes a fixed set of values completes those values, not paths.
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local values
  values="$(_copytree_values_for "$sub $sub2" "$prev")"
  if [ -z "$values" ]; then
    values="$(_copytree_values_for "$sub" "$prev")"
  fi
  if [ -z "$values" ]; then
    values="$(_copytree_values_for 'copy' "$prev")"
  fi
  if [ -n "$values" ]; then
    COMPREPLY=( $(compgen -W "$values" -- "$cur") )
    return 0
  fi

  local flags
  flags="$(_copytree_flags_for "$sub $sub2")"
  if [ -z "$flags" ]; then
    flags="$(_copytree_flags_for "$sub")"
  fi
  if [ -z "$flags" ]; then
    flags="$(_copytree_flags_for 'copy')"
  fi

  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
  else
    COMPREPLY=( $(compgen -f -- "$cur") )
  fi
  return 0
}

complete -o filenames -F _copytree copytree
`;
}

/**
 * Zsh completion.
 * @returns {string} Script
 */
function zshCompletion() {
  const commandLines = visibleCommands()
    .filter((row) => !row.path.includes(' '))
    .map((row) => `    '${quote(row.path)}:${quote(row.summary)}'`)
    .join('\n');

  const caseBlocks = COMMANDS.filter((command) => !command.hidden)
    .map((command) => {
      const specs = completableOptions(command)
        .map((option) => {
          const value = option.enumValues
            ? `:${option.flag.slice(2)}:(${option.enumValues.join(' ')})`
            : '';
          return `        '${quote(option.flag)}[${quote(option.description)}]${value}'`;
        })
        .join(' \\\n');
      return `    ${command.path.join('-')})\n      _arguments \\\n${specs} \\\n        '*:path:_files'\n      ;;`;
    })
    .join('\n');

  return `#compdef copytree
# copytree zsh completion — generated from the CopyTree command schema

_copytree() {
  local -a commands
  commands=(
${commandLines}
  )

  local context state line
  local key="\${words[2]}"
  if [[ -n "\${words[3]}" && "\${words[3]}" != -* ]]; then
    key="\${words[2]}-\${words[3]}"
  fi

  if (( CURRENT == 2 )); then
    _describe -t commands 'copytree command' commands
    _files -/
    return
  fi

  case "$key" in
${caseBlocks}
    *)
      _arguments '*:path:_files'
      ;;
  esac
}

_copytree "$@"
`;
}

/**
 * Fish completion.
 * @returns {string} Script
 */
function fishCompletion() {
  const lines = ['# copytree fish completion — generated from the CopyTree command schema'];
  const roots = [...new Set(visibleCommands().map((row) => row.path.split(' ')[0]))];

  lines.push(
    `complete -c copytree -n "not __fish_seen_subcommand_from ${roots.join(' ')}" -a "${roots.join(' ')}"`,
  );

  for (const command of COMMANDS) {
    if (command.hidden) continue;
    const condition = `__fish_seen_subcommand_from ${command.path.join(' ')}`;
    for (const option of completableOptions(command)) {
      const name = option.flag.replace(/^--/, '');
      const values = option.enumValues ? ` -a "${option.enumValues.join(' ')}"` : '';
      lines.push(
        `complete -c copytree -n "${condition}" -l ${name} -d '${quote(option.description)}'${values}`,
      );
    }
  }

  // The default command takes copy's options with no subcommand typed.
  const copy = COMMANDS.find((command) => command.isDefault);
  for (const option of completableOptions(copy)) {
    const name = option.flag.replace(/^--/, '');
    lines.push(
      `complete -c copytree -n "not __fish_seen_subcommand_from ${roots.join(' ')}" -l ${name} -d '${quote(option.description)}'`,
    );
  }

  return `${lines.join('\n')}\n`;
}

/**
 * PowerShell completion.
 * @returns {string} Script
 */
function powershellCompletion() {
  const map = COMMANDS.filter((command) => !command.hidden)
    .map((command) => {
      const flags = completableOptions(command)
        .map((option) => `'${option.flag}'`)
        .join(', ');
      return `    '${command.path.join(' ')}' = @(${flags})`;
    })
    .join('\n');

  // Keyed by command and flag, for the same reason as the Bash script.
  const enumMap = COMMANDS.filter((command) => !command.hidden)
    .flatMap((command) =>
      completableOptions(command)
        .filter((option) => option.enumValues)
        .map(
          (option) =>
            `    '${command.path.join(' ')}|${option.flag}' = @(${option.enumValues
              .map((value) => `'${value}'`)
              .join(', ')})`,
        ),
    )
    .join('\n');

  const roots = [...new Set(visibleCommands().map((row) => row.path.split(' ')[0]))]
    .map((name) => `'${name}'`)
    .join(', ');

  return `# copytree PowerShell completion — generated from the CopyTree command schema
$CopyTreeCommands = @(${roots})
$CopyTreeFlags = @{
${map}
}
$CopyTreeEnums = @{
${enumMap}
}

Register-ArgumentCompleter -Native -CommandName copytree -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)

  $tokens = $commandAst.CommandElements | Select-Object -Skip 1 | ForEach-Object { $_.ToString() }
  $sub = if ($tokens.Count -ge 1) { $tokens[0] } else { '' }
  $sub2 = if ($tokens.Count -ge 2) { $tokens[1] } else { '' }

  if ($tokens.Count -eq 0 -or ($tokens.Count -eq 1 -and -not $wordToComplete.StartsWith('-'))) {
    return $CopyTreeCommands |
      Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  }

  # A flag that takes a fixed set of values completes those values.
  $previous = if ($tokens.Count -ge 1) { $tokens[$tokens.Count - 1] } else { '' }
  $enumKey = "$sub $sub2".Trim() + '|' + $previous
  if (-not $CopyTreeEnums.ContainsKey($enumKey)) { $enumKey = "$sub|$previous" }
  if (-not $CopyTreeEnums.ContainsKey($enumKey)) { $enumKey = "copy|$previous" }
  if ($CopyTreeEnums.ContainsKey($enumKey)) {
    return $CopyTreeEnums[$enumKey] |
      Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  }

  if (-not $wordToComplete.StartsWith('-')) {
    return Get-ChildItem -Path "$wordToComplete*" -ErrorAction SilentlyContinue |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_.Name, $_.Name, 'ProviderItem', $_.Name) }
  }

  $key = "$sub $sub2".Trim()
  $flags = $CopyTreeFlags[$key]
  if (-not $flags) { $flags = $CopyTreeFlags[$sub] }
  if (-not $flags) { $flags = $CopyTreeFlags['copy'] }

  return $flags |
    Where-Object { $_ -like "$wordToComplete*" } |
    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_) }
}
`;
}
