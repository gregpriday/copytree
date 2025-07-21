# Private Repository Authentication

CopyTree supports private GitHub repositories by leveraging your system's Git authentication. Here's how to set it up.

## Quick Start

### Method 1: GitHub CLI (Recommended)

```bash
# 1. Install GitHub CLI
brew install gh              # macOS
sudo apt install gh          # Ubuntu/Debian
choco install gh             # Windows

# 2. Authenticate
gh auth login

# 3. Select "GitHub.com"
# 4. Choose HTTPS
# 5. Authenticate with browser or token

# That's it! CopyTree will now work with private repos
```

### Method 2: Git Credential Manager

```bash
# Configure Git to store credentials
git config --global credential.helper store

# On macOS, use the keychain:
git config --global credential.helper osxkeychain

# On Windows, use the manager:
git config --global credential.helper manager
```

### Method 3: Personal Access Token

1. Create a token at https://github.com/settings/tokens
2. Grant "repo" scope for private repositories
3. Configure Git to use the token:

```bash
# Set up Git to use your token
git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
```

## Using Private Repos in Profiles

Once authenticated, use private repositories normally:

```yaml
name: Private Dependencies
external:
  # Private organization repository
  - source: https://github.com/myorg/private-lib
    destination: vendor/private-lib
    
  # Private personal repository
  - source: https://github.com/myusername/secret-utils
    destination: lib/utils
    optional: true
```

## Environment Variables (Future Enhancement)

Currently, CopyTree doesn't support direct token configuration. For now, use system-level Git authentication.

Future versions may support:
```bash
# Not yet implemented
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
copytree copy . --profile private-repos
```

## Troubleshooting

### Authentication Failed

If you see "GitHub authentication failed. Repository may be private":

1. **Check if you're authenticated**:
   ```bash
   gh auth status
   # or
   git ls-remote https://github.com/org/private-repo
   ```

2. **Re-authenticate**:
   ```bash
   gh auth login
   # or
   git credential-manager erase
   ```

3. **Verify token permissions**:
   - Token needs "repo" scope for private repositories
   - Check at https://github.com/settings/tokens

### Cache Issues

Clear credential cache if having issues:
```bash
# Clear Git credentials
git credential-manager erase

# Clear CopyTree cache
rm -rf ~/.copytree/repos/
```

### Corporate Proxies

Behind a corporate proxy? Configure Git:
```bash
git config --global http.proxy http://proxy.company.com:8080
git config --global https.proxy http://proxy.company.com:8080
```

## Security Best Practices

1. **Never commit tokens** in your profiles or code
2. **Use GitHub CLI** or credential managers instead of tokens in URLs
3. **Rotate tokens regularly** if using personal access tokens
4. **Use fine-grained tokens** with minimal permissions
5. **Set token expiration** for added security

## Alternative: Local Directory Reference

For sensitive code, consider cloning manually and referencing locally:

```yaml
external:
  # Clone once manually:
  # git clone https://github.com/org/private-repo ~/projects/private-repo
  
  # Then reference locally:
  - source: ~/projects/private-repo
    destination: vendor/private
```

## SSH Support (Not Available)

Currently, CopyTree only supports HTTPS URLs. SSH URLs like `git@github.com:user/repo.git` are not supported.

To use SSH-only repositories:
1. Configure Git to rewrite URLs:
   ```bash
   git config --global url."https://github.com/".insteadOf "git@github.com:"
   ```
2. Ensure you have HTTPS access to the repository