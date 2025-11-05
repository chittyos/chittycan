# ChittyCan shell snippets - Grow With Me Intelligence
# Learning hooks for context-aware command suggestions

# Hook: After command execution (learn from usage)
function chittycan_precmd() {
  local exit_code=$?
  local last_cmd=$(fc -ln -1)

  # Async learning (don't slow down prompt)
  if command -v can &> /dev/null; then
    (can learn command "$last_cmd" $exit_code &)
  fi
}

# Hook: Before prompt display (show smart suggestions)
function chittycan_prompt() {
  if command -v can &> /dev/null; then
    local suggestion=$(can predict --quiet 2>/dev/null)
    if [[ -n "$suggestion" ]]; then
      echo -e "\n\033[0;36m💡 $suggestion\033[0m"
    fi
  fi
}

# Hook: On directory change (context awareness)
function chittycan_chpwd() {
  if command -v can &> /dev/null; then
    (can learn context --cwd "$PWD" &)
  fi
}

# Hook: After git operations (workflow learning)
function chittycan_git_hook() {
  if command -v can &> /dev/null; then
    (can learn git "$@" &)
  fi
}

# Keybinding: Ctrl-G to show analytics dashboard
function chittycan_dashboard() {
  echo
  can chitty analytics
  zle reset-prompt
}

# Keybinding: Ctrl-P to show predictions
function chittycan_predictions() {
  echo
  can predict
  zle reset-prompt
}

# Register ZLE widgets
zle -N chittycan_dashboard
zle -N chittycan_predictions

# Bind keys
bindkey '^G' chittycan_dashboard    # Ctrl-G: Analytics
bindkey '^P' chittycan_predictions  # Ctrl-P: Predictions

# Add hooks to ZSH
autoload -Uz add-zsh-hook
add-zsh-hook precmd chittycan_precmd
add-zsh-hook chpwd chittycan_chpwd

# Git command wrapper for learning
function git() {
  command git "$@"
  local exit_code=$?

  if [[ $exit_code -eq 0 ]] && [[ "$1" =~ ^(commit|push|pull|merge|rebase)$ ]]; then
    chittycan_git_hook "$@"
  fi

  return $exit_code
}

# Show welcome message on first load
if [[ ! -f ~/.chittycan/.hooks_loaded ]]; then
  echo "\n\033[1;36m🌱 ChittyCan Grow With Me Intelligence Active!\033[0m"
  echo "\033[0;36m   Ctrl-G: Analytics Dashboard\033[0m"
  echo "\033[0;36m   Ctrl-P: Smart Predictions\033[0m"
  echo "\033[0;36m   Learning from your commands...\033[0m\n"

  mkdir -p ~/.chittycan
  touch ~/.chittycan/.hooks_loaded
fi
