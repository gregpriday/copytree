# Troubleshooting Guide

This guide helps you resolve common issues with CopyTree.

## Installation Issues

### Command Not Found

**Problem**: `copytree: command not found` after installation

**Solutions**:

1. **Check npm global bin path**:
   ```bash
   npm bin -g
   # Add this path to your PATH environment variable
   ```

2. **Add to PATH** (add to ~/.bashrc or ~/.zshrc):
   ```bash
   export PATH="$(npm bin -g):$PATH"
   source ~/.bashrc  # or ~/.zshrc
   ```

3. **Verify installation**:
   ```bash
   npm list -g copytree
   ```

4. **Use npx instead**:
   ```bash
   npx copytree
   ```

### Permission Errors (EACCES)

**Problem**: Permission denied during global installation

**Solutions**:

1. **Configure npm prefix**:
   ```bash
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'
   echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc
   npm install -g copytree
   ```

2. **Use local installation**:
   ```bash
   npm install copytree
   npx copytree
   ```

### Node.js Version Issues

**Problem**: Incompatible Node.js version

**Solution**:
```bash
# Check current version
node --version

# Install Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js 18+
nvm install 18
nvm use 18
```

## Configuration Problems

### Configuration Validation

**Problem**: Configuration errors or validation failures

**Solutions**:

1. **Validate configuration**:
   ```bash
   copytree config:validate
   ```

2. **Check environment variables**:
   ```bash
   echo $COPYTREE_MAX_FILE_SIZE
   echo $COPYTREE_MAX_TOTAL_SIZE
   ```

3. **Inspect effective configuration**:
   ```bash
   copytree config:inspect
   ```

### Configuration File Not Found

**Problem**: CopyTree can't find configuration

**Solutions**:

> **Note:** CopyTree automatically creates required directories on first use. Configuration files are optional - the tool works with built-in defaults.

1. **Check config location**:
   ```bash
   ls -la ~/.copytree/
   ```

2. **Verify auto-created directories**:
   ```bash
   # Directories are created automatically when needed
   # Run any command to trigger auto-creation:
   copytree --version
   ```

## Output Issues

### Nothing Copied to Clipboard

**Problem**: Command completes but clipboard is empty

**Solutions**:

1. **Check clipboard functionality**:
   ```bash
   echo "test" | pbcopy  # macOS
   echo "test" | xclip -selection clipboard  # Linux
   ```

2. **Use display mode to verify**:
   ```bash
   copytree --display
   ```

3. **Save to file instead**:
   ```bash
   copytree --output test.xml
   ```

4. **Check for errors**:
   ```bash
   copytree --debug
   ```

### Output Too Large

**Problem**: Output exceeds clipboard or memory limits

**Solutions**:

1. **Use file output**:
   ```bash
   copytree --output large-project.xml
   ```

2. **Limit content**:
   ```bash
   copytree --max-lines 100 --max-characters 5000
   ```

3. **Use specific profile**:
   ```bash
   copytree --profile minimal
   ```

4. **Stream output**:
   ```bash
   copytree --stream > project.xml
   ```

### Wrong Format

**Problem**: Output format not as expected

**Solution**:
```bash
# Specify format explicitly
copytree --format json
copytree --format xml
copytree --format tree
```

## File Selection Problems

### No Files Selected

**Problem**: "No files found matching criteria"

**Solutions**:

1. **Check current directory**:
   ```bash
   pwd
   ls -la
   ```

2. **Use less restrictive profile**:
   ```bash
   copytree --profile full
   ```

3. **Debug file selection**:
   ```bash
   copytree --dry-run --verbose
   ```

4. **Check .copytreeignore**:
   ```bash
   cat .copytreeignore
   ```

### Too Many Files Selected

**Problem**: Selecting entire node_modules or unwanted files

**Solutions**:

1. **Use specific profile**:
   ```bash
   copytree --profile minimal
   ```

2. **Add exclusions**:
   ```bash
   # Create .copytreeignore
   echo "node_modules/" > .copytreeignore
   echo "dist/" >> .copytreeignore
   ```

3. **Use filters**:
   ```bash
   copytree --filter "src/**/*.js"
   ```

### Git Integration Not Working

**Problem**: --modified or --changes not finding files

**Solutions**:

1. **Verify Git repository**:
   ```bash
   git status
   ```

2. **Check Git installation**:
   ```bash
   git --version
   ```

3. **Ensure changes exist**:
   ```bash
   git diff --name-only
   git diff --name-only main..HEAD
   ```

## Performance Issues

### Slow Execution

**Problem**: CopyTree takes too long to run

**Solutions**:

1. **Limit directory depth**:
   ```bash
   copytree --depth 3
   ```

2. **Use specific profile**:
   ```bash
   copytree --profile api  # Instead of --profile full
   ```

3. **Skip transformations**:
   ```bash
   copytree --no-transform
   ```

4. **Exclude large directories**:
   ```bash
   echo "coverage/" >> .copytreeignore
   echo "build/" >> .copytreeignore
   ```

### High Memory Usage

**Problem**: Process uses too much memory

**Solutions**:

1. **Stream output**:
   ```bash
   copytree --stream > output.xml
   ```

2. **Process in chunks**:
   ```bash
   copytree src/ --max-files 1000
   ```

3. **Increase Node.js memory**:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" copytree
   ```

## Platform-Specific Issues

### macOS Issues

**Clipboard not working**:
```bash
# Test pbcopy
echo "test" | pbcopy
pbpaste  # Should output "test"
```

**File permissions**:
```bash
# Reset permissions
chmod -R 755 ~/.copytree
```

### Linux Issues

**Missing clipboard support**:
```bash
# Install clipboard utilities
sudo apt-get install xclip  # Debian/Ubuntu
sudo yum install xclip      # RedHat/CentOS
```

**Path issues**:
```bash
# Add to ~/.bashrc
export PATH="$HOME/.npm-global/bin:$PATH"
```

### Windows (WSL) Issues

**Line ending problems**:
```bash
# Configure Git
git config --global core.autocrlf input
```

**Path translation**:
```bash
# Use WSL paths
copytree /mnt/c/Users/username/project
```

## Getting Help

### Debug Information

Collect debug information for bug reports:

```bash
# Version info
copytree --version
node --version
npm --version

# Configuration check
copytree config:validate --verbose

# Debug run
DEBUG=copytree:* copytree --dry-run
```

### Logs and Cache

```bash
# Clear cache
copytree cache:clear --all

# Check cache location
ls -la ~/.copytree/cache/
```

### Community Support

- GitHub Issues: Report bugs and request features
- Documentation: Check other guides in this documentation
- Examples: Review the profile examples for common patterns

## Common Error Messages

### "Profile not found"
- Check profile name spelling
- Run `copytree profile:list` to see available profiles
- Ensure profile file exists in `.copytree/` or `~/.copytree/profiles/`

### "No files found matching criteria"
- Current directory might be empty
- Profile rules might be too restrictive
- Check .gitignore and .copytreeignore

### "Invalid configuration"
- Run `copytree config:validate`
- Check JSON syntax in config files
- Ensure all required fields are present